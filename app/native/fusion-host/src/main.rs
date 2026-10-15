// FusionIsland host. GPL-3.0; EchoIsland modules remain MIT (vendor/EchoIsland/LICENSE).
// Reuses the pinned EchoIsland runtime, scanners and Windows focus implementation.
use std::{path::PathBuf, sync::{Arc, atomic::{AtomicBool, Ordering}}, collections::HashMap};
use anyhow::{Context, Result, bail};
use echoisland_adapters::*;
use echoisland_core::{EventEnvelope, SessionRecord};
use echoisland_runtime::SharedRuntime;
use notify::{Watcher, RecursiveMode};
use serde_json::{Value, json};
use tokio::{io::{AsyncBufReadExt, AsyncWriteExt, BufReader}, sync::{Mutex, mpsc, Notify}, time::{sleep, Duration}};
#[path = "../../../../vendor/EchoIsland/apps/desktop/src-tauri/src/terminal_focus/mod.rs"]
mod terminal_focus;

struct Host {
    runtime: Arc<SharedRuntime>,
    enabled: AtomicBool,
    wake: Notify,
    focus: Mutex<HashMap<String, terminal_focus::SessionTabCache>>,
    restored: Mutex<std::collections::HashSet<String>>,
    operations: Mutex<HashMap<String, Value>>,
    focus_path: PathBuf,
}

fn scoped(source: &str, id: &str) -> String { format!("{source}:{id}") }
fn raw_id(id: &str) -> &str { id.split_once(':').map(|(_, raw)| raw).unwrap_or(id) }

fn scanner<S, F>(host: Arc<Host>, source: &'static str, mut state: S, mut scan: F, paths: Vec<PathBuf>)
where S: Send + 'static, F: FnMut(&mut S) -> Result<(Option<Vec<SessionRecord>>, Duration)> + Send + 'static {
    tokio::spawn(async move {
        let signal = Arc::new(Notify::new());
        let watch_signal = signal.clone();
        let mut watcher = notify::recommended_watcher(move |_event: notify::Result<notify::Event>| watch_signal.notify_one()).ok();
        if let Some(watcher) = watcher.as_mut() {
            for path in paths {
                // Parent watch also observes a source directory created after startup.
                let target = if path.exists() { path.clone() } else { path.parent().unwrap_or(&path).to_path_buf() };
                let _ = watcher.watch(&target, RecursiveMode::Recursive);
            }
        }
        loop {
            let enabled = host.enabled.load(Ordering::Relaxed);
            let interval = if enabled {
                let result = tokio::task::spawn_blocking(move || {
                    let result = scan(&mut state);
                    (state, scan, result)
                }).await;
                let (next_state, next_scan, result) = match result { Ok(value) => value, Err(_) => break };
                state = next_state; scan = next_scan;
                match result {
                    Ok((Some(mut records), interval)) => {
                        let mut restored = host.restored.lock().await;
                        for record in &mut records {
                            record.session_id = scoped(source, &record.session_id);
                            restored.remove(&record.session_id);
                        }
                        drop(restored);
                        host.runtime.sync_source_sessions(source, records).await;
                        interval
                    }
                    Ok((None, interval)) => interval,
                    Err(error) => { eprintln!("scan {source}: {error}"); Duration::from_secs(15) }
                }
            } else { Duration::from_secs(30) };
            tokio::select! {
                _ = sleep(interval.max(Duration::from_millis(500))) => {},
                _ = signal.notified() => { sleep(Duration::from_millis(250)).await; },
                _ = host.wake.notified() => {}
            }
        }
    });
}

impl Host {
    async fn snapshot(&self) -> Result<Value> {
        let mut value = serde_json::to_value(self.runtime.snapshot().await)?;
        let restored = self.restored.lock().await;
        let operations = self.operations.lock().await;
        if let Some(sessions) = value["sessions"].as_array_mut() {
            for session in sessions {
                let key = session["session_id"].as_str().unwrap_or("").to_string();
                session["key"] = json!(key);
                session["restored"] = json!(restored.contains(&key));
                session["session_id"] = json!(raw_id(&key));
            }
        }
        for field in ["pending_permissions", "pending_questions"] {
            if let Some(requests) = value[field].as_array_mut() {
                for request in requests {
                    let key = request["session_id"].as_str().unwrap_or("").to_string();
                    request["session_key"] = json!(key);
                    request["session_id"] = json!(raw_id(&key));
                    if let Some(operation) = operations.get(&key) { request["operation"] = operation.clone(); }
                }
            }
        }
        value["discovery_enabled"] = json!(self.enabled.load(Ordering::Relaxed));
        Ok(value)
    }

    async fn command(&self, method: &str, params: Value) -> Result<Value> {
        match method {
            "snapshot" => self.snapshot().await,
            "discover" => {
                self.enabled.store(params["enabled"].as_bool().unwrap_or(true), Ordering::Relaxed);
                self.wake.notify_waiters(); Ok(json!(true))
            },
            "event" => {
                let mut event: EventEnvelope = serde_json::from_value(params["event"].clone())?;
                event.validate()?;
                event.session_id = scoped(&event.source, &event.session_id);
                let key = event.session_id.clone();
                self.restored.lock().await.remove(&key);
                if matches!(event.hook_event_name.as_str(), "PermissionRequest" | "AskUserQuestion") {
                    self.operations.lock().await.insert(key.clone(), params.clone());
                }
                let result = self.runtime.handle_event(event).await;
                // A newer event may own this session's operation; do not clear its metadata.
                Ok(serde_json::to_value(result)?)
            },
            "disconnect" => {
                let key = scoped(params["source"].as_str().context("source required")?, params["sessionId"].as_str().context("session required")?);
                self.runtime.handle_peer_disconnect(&key).await;
                Ok(json!(true))
            },
            "answer" => {
                let id = params["requestId"].as_str().context("requestId required")?;
                let result = match params["action"].as_str() {
                    Some("approve") => self.runtime.approve_permission(id).await,
                    Some("deny") => self.runtime.deny_permission(id).await,
                    Some("answer") => self.runtime.answer_question(id, params["answer"].as_str().context("answer required")?).await,
                    Some("skip") => self.runtime.skip_question(id).await,
                    _ => bail!("unknown answer action"),
                };
                result.map_err(anyhow::Error::msg)?;
                Ok(json!(true))
            },
            "focus" => {
                let key = scoped(params["source"].as_str().context("source required")?, params["sessionId"].as_str().context("session required")?);
                let session = self.runtime.session(&key).await.context("session unavailable")?;
                let target = terminal_focus::SessionFocusTarget {
                    session_id: raw_id(&session.session_id).into(), source: session.source,
                    project_name: session.project_name, cwd: session.cwd, terminal_app: session.terminal_app,
                    terminal_bundle: session.terminal_bundle, host_app: session.host_app, window_title: session.window_title,
                    tty: session.tty, terminal_pid: session.terminal_pid, cli_pid: session.cli_pid,
                    iterm_session_id: session.iterm_session_id, kitty_window_id: session.kitty_window_id,
                    tmux_env: session.tmux_env, tmux_pane: session.tmux_pane, tmux_client_tty: session.tmux_client_tty,
                };
                let cached = self.focus.lock().await.get(&key).cloned();
                let outcome = tokio::task::spawn_blocking(move || terminal_focus::focus_session_terminal(&target, cached.as_ref())).await??;
                if let Some(tab) = outcome.selected_tab {
                    let mut focus = self.focus.lock().await;
                    focus.insert(key, tab);
                    std::fs::write(&self.focus_path, serde_json::to_vec(&*focus)?)?;
                }
                Ok(json!({"focused": outcome.focused}))
            },
            "flush" => { self.runtime.flush_persistence().await; Ok(json!(true)) },
            _ => bail!("unknown host command"),
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let path = PathBuf::from(std::env::args().nth(1).context("FusionIsland data path required")?);
    std::fs::create_dir_all(&path)?;
    let runtime = Arc::new(SharedRuntime::with_storage_path(path.join("sessions.json")));
    let restored = runtime.snapshot().await.sessions.iter().map(|s| s.session_id.clone()).collect();
    let focus_path = path.join("focus.json");
    let focus = std::fs::read(&focus_path).ok().and_then(|s| serde_json::from_slice(&s).ok()).unwrap_or_default();
    let host = Arc::new(Host { runtime, enabled: AtomicBool::new(false), wake: Notify::new(),
        focus: Mutex::new(focus), restored: Mutex::new(restored), operations: Mutex::new(HashMap::new()), focus_path });
    let cp = default_paths();
    scanner(host.clone(), "codex", CodexSessionScanner::new(cp.clone()), |s| Ok((s.scan()?, s.recommended_poll_interval())), vec![cp.codex_dir]);
    let cp = claude_default_paths();
    scanner(host.clone(), "claude", ClaudeSessionScanner::new(cp.clone()), |s| Ok((s.scan()?, s.recommended_poll_interval())), vec![cp.claude_dir]);
    for spec in [gemini_cli_process_spec(), glm_cli_process_spec(), vscode_process_spec(), cursor_process_spec(), trae_process_spec()] {
        scanner(host.clone(), spec.source, ProcessSourceScanner::new(spec), |s| Ok((s.scan()?, s.recommended_poll_interval())), vec![]);
    }
    let (out, mut receiver) = mpsc::unbounded_channel::<Value>();
    tokio::spawn(async move {
        let mut stdout = tokio::io::stdout();
        while let Some(value) = receiver.recv().await {
            let line = format!("{}\n", value);
            if stdout.write_all(line.as_bytes()).await.is_err() { break; }
        }
    });
    let snapshots = host.clone(); let updates = out.clone();
    tokio::spawn(async move {
        let mut last = Value::Null;
        loop {
            if let Ok(value) = snapshots.snapshot().await {
                if value != last { let _ = updates.send(json!({"event":"snapshot","value":value})); last = value; }
            }
            sleep(Duration::from_millis(250)).await;
        }
    });
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    while let Some(line) = lines.next_line().await? {
        if line.len() > 4 * 1024 * 1024 { continue; }
        let Ok(message) = serde_json::from_str::<Value>(&line) else { continue };
        let host = host.clone(); let out = out.clone();
        // Blocking hook requests must not prevent snapshot/answer commands from running.
        tokio::spawn(async move {
            let id = &message["id"];
            let result = host.command(message["method"].as_str().unwrap_or(""), message["params"].clone()).await;
            let response = match result { Ok(value) => json!({"id":id,"result":value}), Err(error) => json!({"id":id,"error":error.to_string()}) };
            let _ = out.send(response);
        });
    }
    host.runtime.flush_persistence().await;
    Ok(())
}

