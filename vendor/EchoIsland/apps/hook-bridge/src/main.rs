#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::{
    env,
    fs::OpenOptions,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};

use anyhow::Context;
use chrono::Utc;
use echoisland_core::{PROTOCOL_VERSION, ResponseEnvelope};
use echoisland_ipc::{DEFAULT_ADDR, send_raw};
use echoisland_paths::bridge_log_path as default_bridge_log_path;
use serde_json::{Map, Value, json};

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        append_bridge_log(&format!("fatal hook bridge error: {error:#}"));
    }
}

async fn run() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    let mut source = "codex".to_string();
    while let Some(arg) = args.next() {
        if arg == "--source" {
            source = args.next().unwrap_or_else(|| "codex".to_string());
        }
    }

    use tokio::io::{self, AsyncReadExt};
    let mut stdin = io::stdin();
    let mut raw = Vec::new();
    stdin.read_to_end(&mut raw).await?;
    if raw.is_empty() {
        append_bridge_log("empty stdin; exiting");
        return Ok(());
    }

    let value = match serde_json::from_slice::<Value>(&raw) {
        Ok(value) => value,
        Err(error) => {
            append_bridge_log(&format!("failed to parse stdin json: {error}"));
            return Ok(());
        }
    };
    let mut obj = match value {
        Value::Object(obj) => obj,
        _ => {
            append_bridge_log("stdin json is not an object");
            return Ok(());
        }
    };

    let raw_event_name = obj
        .get("hook_event_name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    enrich_event(&mut obj, &source);

    if obj
        .get("session_id")
        .and_then(Value::as_str)
        .map(|v| v.trim().is_empty())
        .unwrap_or(true)
    {
        append_bridge_log("missing session_id after enrichment");
        return Ok(());
    }

    let event_name = obj
        .get("hook_event_name")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let session_id = obj
        .get("session_id")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    append_bridge_log(&format!(
        "invoked source={source} event={event_name} session_id={session_id}"
    ));
    if let Some(metadata) = obj.get("metadata").and_then(Value::as_object) {
        append_bridge_log(&format!(
            "metadata source={source} event={event_name} session_id={session_id} terminal_app={:?} terminal_bundle={:?} tty={:?} pid={:?} cli_pid={:?}",
            metadata.get("terminal_app").and_then(Value::as_str),
            metadata.get("terminal_bundle").and_then(Value::as_str),
            metadata.get("tty").and_then(Value::as_str),
            metadata.get("pid").and_then(Value::as_u64),
            metadata.get("cli_pid").and_then(Value::as_u64),
        ));
    }

    let payload =
        serde_json::to_vec(&Value::Object(obj.clone())).context("failed to encode payload")?;
    let response = match send_raw(DEFAULT_ADDR, &payload).await {
        Ok(response) => {
            append_bridge_log(&format!(
                "sent to ipc source={source} event={event_name} session_id={session_id} ok={}",
                response.ok
            ));
            response
        }
        Err(error) => {
            append_bridge_log(&format!(
                "ipc send failed source={source} event={event_name} session_id={session_id}: {error}"
            ));
            fallback_response(&payload)
        }
    };

    if let Some(output) = format_output(&source, &raw_event_name, &obj, &response) {
        println!("{}", serde_json::to_string(&output)?);
    }
    Ok(())
}

fn enrich_event(obj: &mut Map<String, Value>, source: &str) {
    if source.eq_ignore_ascii_case("claude") {
        enrich_claude_event(obj);
    } else if source.eq_ignore_ascii_case("codex") {
        enrich_codex_event(obj);
    }
    obj.entry("protocol_version".to_string())
        .or_insert_with(|| Value::String(PROTOCOL_VERSION.to_string()));
    obj.insert("source".to_string(), Value::String(source.to_string()));
    obj.entry("timestamp".to_string())
        .or_insert_with(|| Value::String(Utc::now().to_rfc3339()));
    if obj.get("cwd").is_none()
        && let Ok(cwd) = std::env::current_dir()
    {
        obj.insert("cwd".to_string(), Value::String(cwd.display().to_string()));
    }
    let metadata = obj
        .entry("metadata".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if let Some(metadata_obj) = metadata.as_object_mut() {
        if !source.eq_ignore_ascii_case("codex") {
            metadata_obj
                .entry("host_app".to_string())
                .or_insert_with(|| Value::String(source.to_string()));
        }
        enrich_terminal_metadata(metadata_obj);
    }
}

fn enrich_terminal_metadata(metadata_obj: &mut Map<String, Value>) {
    for (key, value) in collect_terminal_metadata() {
        metadata_obj.entry(key).or_insert(value);
    }
}

fn collect_terminal_metadata() -> Map<String, Value> {
    collect_terminal_metadata_with(
        &|name| env::var(name).ok().filter(|value| !value.trim().is_empty()),
        detect_tty_path(),
        current_parent_pid(),
    )
}

fn collect_terminal_metadata_with(
    env_get: &dyn Fn(&str) -> Option<String>,
    tty: Option<String>,
    parent_pid: Option<u32>,
) -> Map<String, Value> {
    let mut metadata = Map::new();

    if let Some(terminal_app) = env_get("TERM_PROGRAM") {
        metadata.insert("terminal_app".to_string(), Value::String(terminal_app));
    }
    if let Some(terminal_bundle) = env_get("__CFBundleIdentifier") {
        metadata.insert(
            "terminal_bundle".to_string(),
            Value::String(terminal_bundle),
        );
    }
    if let Some(iterm_session_id) = env_get("ITERM_SESSION_ID")
        .map(|value| parse_iterm_session_id(&value))
        .filter(|value| !value.is_empty())
    {
        metadata.insert(
            "iterm_session_id".to_string(),
            Value::String(iterm_session_id),
        );
    }
    if let Some(kitty_window_id) = env_get("KITTY_WINDOW_ID") {
        metadata.insert(
            "kitty_window_id".to_string(),
            Value::String(kitty_window_id),
        );
    }
    if let Some(tmux_env) = env_get("TMUX") {
        metadata.insert("tmux_env".to_string(), Value::String(tmux_env.clone()));
        if let Some(tmux_pane) = env_get("TMUX_PANE") {
            metadata.insert("tmux_pane".to_string(), Value::String(tmux_pane.clone()));
            if let Some(tmux_client_tty) = tmux_client_tty(&tmux_pane, Some(&tmux_env)) {
                metadata.insert(
                    "tmux_client_tty".to_string(),
                    Value::String(tmux_client_tty),
                );
            }
        }
    }
    let tty = tty
        .filter(|value| is_precise_tty_path(value))
        .or_else(|| parent_pid.and_then(detect_tty_path_from_pid));
    if let Some(tty) = tty.filter(|value| !value.is_empty()) {
        metadata.insert("tty".to_string(), Value::String(tty));
    }
    if let Some(parent_pid) = parent_pid {
        metadata.insert("cli_pid".to_string(), json!(parent_pid));
    }

    metadata
}

fn parse_iterm_session_id(raw: &str) -> String {
    raw.split_once(':')
        .map(|(_, value)| value)
        .unwrap_or(raw)
        .trim()
        .to_string()
}

fn find_binary(name: &str) -> Option<String> {
    [
        format!("/opt/homebrew/bin/{name}"),
        format!("/usr/local/bin/{name}"),
        format!("/usr/bin/{name}"),
    ]
    .into_iter()
    .find(|path| std::fs::metadata(path).is_ok())
}

fn run_command(path: &str, args: &[&str], extra_env: Option<&[(&str, &str)]>) -> Option<String> {
    let mut command = Command::new(path);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Some(extra_env) = extra_env {
        command.envs(extra_env.iter().copied());
    }
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!stdout.is_empty()).then_some(stdout)
}

fn tmux_client_tty(tmux_pane: &str, tmux_env: Option<&str>) -> Option<String> {
    let tmux_bin = find_binary("tmux")?;
    let mut env_pairs = Vec::new();
    if let Some(tmux_env) = tmux_env.filter(|value| !value.trim().is_empty()) {
        env_pairs.push(("TMUX", tmux_env));
    }
    run_command(
        &tmux_bin,
        &[
            "display-message",
            "-p",
            "-t",
            tmux_pane,
            "-F",
            "#{client_tty}",
        ],
        (!env_pairs.is_empty()).then_some(env_pairs.as_slice()),
    )
}

#[cfg(unix)]
fn detect_tty_path() -> Option<String> {
    for fd in [libc::STDIN_FILENO, libc::STDOUT_FILENO, libc::STDERR_FILENO] {
        let tty_name = unsafe { libc::ttyname(fd) };
        if tty_name.is_null() {
            continue;
        }
        let value = unsafe { std::ffi::CStr::from_ptr(tty_name) }
            .to_string_lossy()
            .trim()
            .to_string();
        if is_precise_tty_path(&value) {
            return Some(value);
        }
    }

    let path = b"/dev/tty\0";
    let fd = unsafe { libc::open(path.as_ptr().cast(), libc::O_RDONLY | libc::O_NOCTTY) };
    if fd < 0 {
        return None;
    }
    let tty_name = unsafe { libc::ttyname(fd) };
    let _ = unsafe { libc::close(fd) };
    if tty_name.is_null() {
        return None;
    }
    let value = unsafe { std::ffi::CStr::from_ptr(tty_name) }
        .to_string_lossy()
        .trim()
        .to_string();
    is_precise_tty_path(&value).then_some(value)
}

#[cfg(not(unix))]
fn detect_tty_path() -> Option<String> {
    None
}

#[cfg(unix)]
fn current_parent_pid() -> Option<u32> {
    let pid = unsafe { libc::getppid() };
    (pid > 0).then_some(pid as u32)
}

#[cfg(not(unix))]
fn current_parent_pid() -> Option<u32> {
    None
}

fn detect_tty_path_from_pid(pid: u32) -> Option<String> {
    let pid_text = pid.to_string();
    let tty = run_command("/bin/ps", &["-p", &pid_text, "-o", "tty="], None)?
        .trim()
        .to_string();
    if tty.is_empty() || tty == "??" {
        return None;
    }
    let tty_path = if tty.starts_with("/dev/") {
        tty
    } else {
        format!("/dev/{tty}")
    };
    is_precise_tty_path(&tty_path).then_some(tty_path)
}

fn is_precise_tty_path(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty() && value != "/dev/tty" && value != "/dev/console"
}

fn enrich_codex_event(obj: &mut Map<String, Value>) {
    if obj.get("message").is_none()
        && let Some(message) = obj
            .get("prompt")
            .and_then(Value::as_str)
            .or_else(|| obj.get("last_assistant_message").and_then(Value::as_str))
            .or_else(|| {
                obj.get("tool_input")
                    .and_then(|tool| tool.get("command"))
                    .and_then(Value::as_str)
            })
    {
        obj.insert("message".to_string(), Value::String(message.to_string()));
    }
}

fn enrich_claude_event(obj: &mut Map<String, Value>) {
    if let Some(event_name) = obj.get("hook_event_name").and_then(Value::as_str) {
        let normalized = match event_name {
            "Elicitation" => "AskUserQuestion",
            "TaskCompleted" => "Notification",
            "StopFailure" => "Notification",
            other => other,
        };
        obj.insert(
            "hook_event_name".to_string(),
            Value::String(normalized.to_string()),
        );
    }

    if obj.get("message").is_none()
        && let Some(message) = obj
            .get("last_assistant_message")
            .and_then(Value::as_str)
            .or_else(|| obj.get("task_subject").and_then(Value::as_str))
            .or_else(|| obj.get("prompt").and_then(Value::as_str))
            .or_else(|| obj.get("question").and_then(Value::as_str))
            .or_else(|| {
                obj.get("tool_input")
                    .and_then(|tool| tool.get("description"))
                    .and_then(Value::as_str)
            })
    {
        obj.insert("message".to_string(), Value::String(message.to_string()));
    }

    if obj.get("question").is_none()
        && obj
            .get("hook_event_name")
            .and_then(Value::as_str)
            .map(|value| value == "AskUserQuestion")
            .unwrap_or(false)
        && let Some(question) = build_claude_question_payload(obj)
    {
        obj.insert("question".to_string(), question);
    }
}

fn build_claude_question_payload(obj: &Map<String, Value>) -> Option<Value> {
    let requested_schema = obj.get("requested_schema").and_then(Value::as_object);
    let field_specs = requested_schema
        .and_then(parse_elicitation_fields)
        .unwrap_or_default();

    let header = obj
        .get("mcp_server_name")
        .and_then(Value::as_str)
        .map(|value| Value::String(value.to_string()))
        .unwrap_or(Value::Null);

    let mode = obj.get("mode").and_then(Value::as_str).unwrap_or("form");
    let base_message = obj
        .get("message")
        .and_then(Value::as_str)
        .or_else(|| obj.get("question").and_then(Value::as_str))
        .unwrap_or("Question");

    let text = match mode {
        "url" => {
            let url = obj.get("url").and_then(Value::as_str).unwrap_or("");
            if url.is_empty() {
                base_message.to_string()
            } else {
                format!("{base_message}\nOpen URL: {url}")
            }
        }
        _ => {
            let guidance = elicitation_guidance(&field_specs);
            if guidance.is_empty() {
                base_message.to_string()
            } else {
                format!("{base_message}\n{guidance}")
            }
        }
    };

    let options = build_elicitation_options(&field_specs);

    Some(json!({
        "header": header,
        "text": text,
        "options": options,
    }))
}

fn format_output(
    source: &str,
    raw_event_name: &str,
    request: &Map<String, Value>,
    response: &ResponseEnvelope,
) -> Option<Value> {
    if source.eq_ignore_ascii_case("claude") {
        return format_claude_output(raw_event_name, request, response);
    }
    if source.eq_ignore_ascii_case("codex") {
        return format_codex_output(raw_event_name, response);
    }

    Some(
        serde_json::to_value(response)
            .unwrap_or_else(|_| json!({ "ok": false, "error": "encode_failed" })),
    )
}

fn format_codex_output(raw_event_name: &str, _response: &ResponseEnvelope) -> Option<Value> {
    match raw_event_name {
        "Stop" | "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" => None,
        _ => None,
    }
}

fn format_claude_output(
    raw_event_name: &str,
    request: &Map<String, Value>,
    response: &ResponseEnvelope,
) -> Option<Value> {
    match raw_event_name {
        "PermissionRequest" => {
            let behavior = response
                .decision
                .as_ref()
                .map(|decision| decision.behavior.clone())
                .unwrap_or_else(|| "deny".to_string());
            let denied = behavior == "deny";

            let mut decision = Map::new();
            decision.insert("behavior".to_string(), Value::String(behavior));
            if denied {
                decision.insert(
                    "message".to_string(),
                    Value::String("Denied by EchoIsland approval workflow".to_string()),
                );
                decision.insert("interrupt".to_string(), Value::Bool(false));
            }
            if let Some(updated_permissions) = response
                .decision
                .as_ref()
                .and_then(|decision| decision.updated_permissions.clone())
            {
                decision.insert("updatedPermissions".to_string(), updated_permissions);
            }

            Some(json!({
                "hookSpecificOutput": {
                    "hookEventName": "PermissionRequest",
                    "decision": Value::Object(decision),
                }
            }))
        }
        "Elicitation" => {
            if response
                .answer
                .as_ref()
                .map(|answer| answer.skipped)
                .unwrap_or(false)
            {
                return Some(json!({
                    "hookSpecificOutput": {
                        "hookEventName": "Elicitation",
                        "action": "cancel"
                    }
                }));
            }

            let answer = response
                .answer
                .as_ref()
                .and_then(|answer| answer.value.clone());
            if let Some(value) = answer {
                Some(json!({
                    "hookSpecificOutput": {
                        "hookEventName": "Elicitation",
                        "action": "accept",
                        "content": build_elicitation_content(request, &value),
                    }
                }))
            } else {
                Some(json!({
                    "hookSpecificOutput": {
                        "hookEventName": "Elicitation",
                        "action": "cancel"
                    }
                }))
            }
        }
        _ => None,
    }
}

fn build_elicitation_content(request: &Map<String, Value>, answer: &str) -> Value {
    let fields = request
        .get("requested_schema")
        .and_then(Value::as_object)
        .and_then(parse_elicitation_fields)
        .unwrap_or_default();

    if let Ok(value) = serde_json::from_str::<Value>(answer)
        && value.is_object()
    {
        return value;
    }

    if fields.len() == 1 {
        return json!({
            fields[0].name.clone(): answer,
        });
    }

    json!({
        "value": answer,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ElicitationField {
    name: String,
    label: String,
    description: Option<String>,
    enum_values: Vec<String>,
}

fn parse_elicitation_fields(schema: &Map<String, Value>) -> Option<Vec<ElicitationField>> {
    let properties = schema.get("properties")?.as_object()?;
    let mut fields = Vec::new();

    for (name, value) in properties {
        let field = value.as_object()?;
        let label = field
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or(name)
            .to_string();
        let description = field
            .get("description")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let enum_values = field
            .get("enum")
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToOwned::to_owned)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        fields.push(ElicitationField {
            name: name.clone(),
            label,
            description,
            enum_values,
        });
    }

    fields.sort_by(|left, right| left.name.cmp(&right.name));

    Some(fields)
}

fn elicitation_guidance(fields: &[ElicitationField]) -> String {
    if fields.is_empty() {
        return String::new();
    }

    if fields.len() == 1 {
        let field = &fields[0];
        if !field.enum_values.is_empty() {
            return format!(
                "Choose one value for {}: {}",
                field.label,
                field.enum_values.join(", ")
            );
        }
        return format!("Provide a value for {}.", field.label);
    }

    let names = fields
        .iter()
        .map(|field| format!("\"{}\"", field.name))
        .collect::<Vec<_>>()
        .join(", ");
    format!("Reply with JSON containing fields: {names}")
}

fn build_elicitation_options(fields: &[ElicitationField]) -> Vec<Value> {
    if fields.len() != 1 || fields[0].enum_values.is_empty() {
        return Vec::new();
    }

    let field = &fields[0];
    field
        .enum_values
        .iter()
        .map(|value| {
            json!({
                "label": value,
                "description": field.description.clone(),
            })
        })
        .collect()
}

fn fallback_response(payload: &[u8]) -> ResponseEnvelope {
    let event_name = serde_json::from_slice::<Value>(payload)
        .ok()
        .and_then(|value| {
            value
                .get("hook_event_name")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_default();

    match event_name.as_str() {
        "PermissionRequest" => ResponseEnvelope::deny(),
        "AskUserQuestion" => ResponseEnvelope::skipped(),
        _ => ResponseEnvelope::ok(),
    }
}

fn append_bridge_log(message: &str) {
    let Some(path) = bridge_log_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "[{}] {}", Utc::now().to_rfc3339(), message);
    }
}

fn bridge_log_path() -> Option<PathBuf> {
    Some(default_bridge_log_path())
}
