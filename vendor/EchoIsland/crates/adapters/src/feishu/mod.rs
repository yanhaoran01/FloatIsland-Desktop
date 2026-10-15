//! Feishu bot message subscription (event source, not an installable adapter).
//!
//! Unlike the Claude / Codex / OpenClaw adapters — which install hooks or scan
//! session files — the Feishu integration receives real-time message pushes
//! via the `lark-cli event +subscribe` sidecar. Each inbound message is
//! converted into a lightweight `EventEnvelope` with a synthetic `feishu:<chat>`
//! session id and `hook_event_name = "Stop"` so it reuses the runtime's existing
//! completed-message path: the panel plays its sound and shows the compact
//! preview card, nothing more.
//!
//! This module only provides the parsing layer; the sidecar process is managed
//! by the desktop app (see `apps/desktop/src-tauri/src/feishu_sidecar.rs`).

use anyhow::{Context, Result};
use chrono::{TimeZone, Utc};
use echoisland_core::{EventEnvelope, PROTOCOL_VERSION};
use serde_json::Value;

/// One compact-mode NDJSON line emitted by `lark-cli event +subscribe`.
///
/// The CLI flattens the raw Lark event payload so we do not need to decode the
/// double-encoded `content` field ourselves. Fields we don't consume yet are
/// preserved as `serde_json::Value` via `#[serde(flatten)]` in case a future
/// feature (reply-from-panel, mention detection, ...) needs them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeishuCompactEvent {
    pub event_type: String,
    pub message_id: Option<String>,
    pub chat_id: Option<String>,
    pub chat_type: Option<String>,
    pub message_type: Option<String>,
    pub content: Option<String>,
    pub sender_id: Option<String>,
    pub sender_type: Option<String>,
    pub timestamp: Option<String>,
    pub create_time: Option<String>,
}

/// One message returned by `lark-cli im +chat-messages-list`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeishuChatMessage {
    pub message_id: Option<String>,
    pub msg_type: Option<String>,
    pub content: Option<String>,
    pub sender_id: Option<String>,
    pub sender_type: Option<String>,
    pub create_time: Option<String>,
}

/// Parse a single NDJSON line from `lark-cli event +subscribe --compact`.
/// Returns `Ok(None)` for blank lines so callers can cheaply skip them.
pub fn parse_compact_line(line: &str) -> Result<Option<FeishuCompactEvent>> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let value: Value = serde_json::from_str(trimmed)
        .with_context(|| format!("failed to parse lark-cli NDJSON line: {trimmed}"))?;
    Ok(Some(feishu_event_from_value(&value)))
}

/// Convert a compact Feishu message event into an `EventEnvelope` the runtime
/// can ingest through its completed-message path. We only translate
/// message-receive events for now; other event types (reactions, chat member
/// changes) return `None` so the caller can skip them without a warning.
pub fn envelope_from_compact_event(event: &FeishuCompactEvent) -> Option<EventEnvelope> {
    if event.event_type != "im.message.receive_v1" {
        return None;
    }

    let chat_id = event.chat_id.as_deref().unwrap_or("unknown");
    let session_id = format!("feishu:{chat_id}");

    let timestamp_ms = event
        .timestamp
        .as_deref()
        .or(event.create_time.as_deref())
        .and_then(|raw| raw.parse::<i64>().ok())
        .and_then(|ms| Utc.timestamp_millis_opt(ms).single())
        .unwrap_or_else(Utc::now);

    let message_body = compose_notification_message(event);

    Some(EventEnvelope {
        protocol_version: PROTOCOL_VERSION.to_string(),
        hook_event_name: "Stop".to_string(),
        session_id,
        source: "feishu".to_string(),
        timestamp: timestamp_ms,
        tool_name: None,
        tool_input: None,
        cwd: None,
        model: None,
        message: Some(message_body),
        agent_id: event.sender_id.clone(),
        metadata: None,
        question: None,
    })
}

/// A receive event from a human user should not immediately notify. It only
/// tells the desktop sidecar which chat to poll for the bot's eventual reply.
pub fn should_poll_reply_for_event(event: &FeishuCompactEvent) -> bool {
    event.event_type == "im.message.receive_v1"
        && event
            .chat_id
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        && !is_bot_sender(event.sender_type.as_deref(), event.sender_id.as_deref())
}

/// Parse `lark-cli im +chat-messages-list --format json` output.
pub fn parse_chat_messages_response(output: &str) -> Result<Vec<FeishuChatMessage>> {
    let value: Value = serde_json::from_str(output)
        .with_context(|| "failed to parse lark-cli chat messages response")?;
    let messages = value
        .get("data")
        .and_then(|data| data.get("messages"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(feishu_chat_message_from_value)
        .collect();
    Ok(messages)
}

/// Convert a bot/app chat reply into an EchoIsland completion notification.
pub fn envelope_from_chat_reply(
    chat_id: &str,
    message: &FeishuChatMessage,
) -> Option<EventEnvelope> {
    if !is_bot_sender(message.sender_type.as_deref(), message.sender_id.as_deref()) {
        return None;
    }
    if !is_reply_message_type(message.msg_type.as_deref()) {
        return None;
    }
    let content = message.content.as_deref()?.trim();
    if !has_semantic_text(content) {
        return None;
    }

    Some(EventEnvelope {
        protocol_version: PROTOCOL_VERSION.to_string(),
        hook_event_name: "Stop".to_string(),
        session_id: format!("feishu:{chat_id}"),
        source: "feishu".to_string(),
        timestamp: Utc::now(),
        tool_name: None,
        tool_input: None,
        cwd: None,
        model: None,
        message: Some(content.to_string()),
        agent_id: message.sender_id.clone(),
        metadata: None,
        question: None,
    })
}

fn feishu_event_from_value(value: &Value) -> FeishuCompactEvent {
    let header = value.get("header");
    let raw_event = value.get("event");
    let raw_message = raw_event.and_then(|event| event.get("message"));
    let raw_sender = raw_event.and_then(|event| event.get("sender"));

    FeishuCompactEvent {
        event_type: string_at(value, &["type"])
            .or_else(|| string_at(value, &["event_type"]))
            .or_else(|| header.and_then(|header| string_at(header, &["event_type"])))
            .unwrap_or_default(),
        message_id: string_at(value, &["message_id"])
            .or_else(|| string_at(value, &["id"]))
            .or_else(|| raw_message.and_then(|message| string_at(message, &["message_id"]))),
        chat_id: string_at(value, &["chat_id"])
            .or_else(|| raw_message.and_then(|message| string_at(message, &["chat_id"]))),
        chat_type: string_at(value, &["chat_type"])
            .or_else(|| raw_message.and_then(|message| string_at(message, &["chat_type"]))),
        message_type: string_at(value, &["message_type"])
            .or_else(|| raw_message.and_then(|message| string_at(message, &["message_type"]))),
        content: string_at(value, &["content"]).or_else(|| {
            raw_message
                .and_then(|message| string_at(message, &["content"]))
                .map(|content| human_readable_lark_message_content(&content))
        }),
        sender_id: string_at(value, &["sender_id"])
            .or_else(|| raw_sender.and_then(extract_sender_id)),
        sender_type: string_at(value, &["sender_type"])
            .or_else(|| raw_sender.and_then(|sender| string_at(sender, &["sender_type"]))),
        timestamp: string_at(value, &["timestamp"])
            .or_else(|| header.and_then(|header| string_at(header, &["create_time"]))),
        create_time: string_at(value, &["create_time"])
            .or_else(|| header.and_then(|header| string_at(header, &["create_time"]))),
    }
}

fn feishu_chat_message_from_value(value: &Value) -> FeishuChatMessage {
    let sender = value.get("sender");
    FeishuChatMessage {
        message_id: string_at(value, &["message_id"]),
        msg_type: string_at(value, &["msg_type"]).or_else(|| string_at(value, &["message_type"])),
        content: string_at(value, &["content"]),
        sender_id: sender
            .and_then(|sender| string_at(sender, &["id"]))
            .or_else(|| sender.and_then(extract_sender_id)),
        sender_type: sender.and_then(|sender| string_at(sender, &["sender_type"])),
        create_time: string_at(value, &["create_time"]),
    }
}

fn string_at(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    match current {
        Value::String(value) if !value.trim().is_empty() => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn extract_sender_id(sender: &Value) -> Option<String> {
    let sender_id = sender.get("sender_id")?;
    string_at(sender_id, &["open_id"])
        .or_else(|| string_at(sender_id, &["union_id"]))
        .or_else(|| string_at(sender_id, &["user_id"]))
        .or_else(|| string_at(sender_id, &["app_id"]))
        .or_else(|| match sender_id {
            Value::String(value) if !value.trim().is_empty() => Some(value.clone()),
            _ => None,
        })
}

fn human_readable_lark_message_content(content: &str) -> String {
    let Ok(value) = serde_json::from_str::<Value>(content) else {
        return content.to_string();
    };
    if let Some(text) = string_at(&value, &["text"]) {
        return text;
    }
    if let Some(title) = string_at(&value, &["title"]) {
        return title;
    }
    content.to_string()
}

fn compose_notification_message(event: &FeishuCompactEvent) -> String {
    let content = event.content.as_deref().unwrap_or("").trim();
    let scope = match event.chat_type.as_deref() {
        Some("group") => "group",
        _ => "direct",
    };
    let kind = event.message_type.as_deref().unwrap_or("text");
    if content.is_empty() {
        format!("[feishu {scope} {kind}]")
    } else {
        format!("[feishu {scope} {kind}] {content}")
    }
}

fn is_bot_sender(sender_type: Option<&str>, sender_id: Option<&str>) -> bool {
    sender_type.is_some_and(|value| matches!(value.to_ascii_lowercase().as_str(), "app" | "bot"))
        || sender_id.is_some_and(|value| value.starts_with("cli_"))
}

fn is_reply_message_type(message_type: Option<&str>) -> bool {
    matches!(
        message_type.map(|value| value.to_ascii_lowercase()),
        Some(value) if value == "text" || value == "post"
    )
}

fn has_semantic_text(content: &str) -> bool {
    content
        .chars()
        .any(|ch| ch.is_ascii_alphanumeric() || is_cjk(ch))
}

fn is_cjk(ch: char) -> bool {
    ('\u{4E00}'..='\u{9FFF}').contains(&ch)
        || ('\u{3400}'..='\u{4DBF}').contains(&ch)
        || ('\u{F900}'..='\u{FAFF}').contains(&ch)
}
