use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::state::{AgentStatus, SessionRecord};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentSourceType {
    Cli,
    Ide,
    Extension,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentSource {
    pub source_id: String,
    pub source_type: AgentSourceType,
    pub display_name: String,
    pub icon: Option<String>,
    pub priority: i32,
    pub enabled: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentSessionStatus {
    Idle,
    Running,
    Waiting,
    Completed,
    Error,
}

impl From<AgentStatus> for AgentSessionStatus {
    fn from(value: AgentStatus) -> Self {
        match value {
            AgentStatus::Idle => Self::Idle,
            AgentStatus::Processing | AgentStatus::Running => Self::Running,
            AgentStatus::WaitingApproval | AgentStatus::WaitingQuestion => Self::Waiting,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentSession {
    pub source_id: String,
    pub session_id: String,
    pub workspace_path: Option<String>,
    pub title: String,
    pub status: AgentSessionStatus,
    pub pid: Option<u32>,
    pub window_id: Option<String>,
    pub terminal_tab: Option<String>,
    pub ide_bundle_id: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub last_activity_at: Option<DateTime<Utc>>,
    pub metadata: Value,
}

impl AgentSession {
    pub fn from_record(record: &SessionRecord) -> Self {
        let terminal_tab = record
            .iterm_session_id
            .clone()
            .or_else(|| record.kitty_window_id.clone())
            .or_else(|| record.tmux_pane.clone())
            .or_else(|| record.tty.clone());

        Self {
            source_id: record.source.clone(),
            session_id: record.session_id.clone(),
            workspace_path: record.cwd.clone(),
            title: session_title(record),
            status: record.status.into(),
            pid: record.cli_pid.or(record.terminal_pid),
            window_id: record.window_title.clone(),
            terminal_tab,
            ide_bundle_id: record.host_app.clone(),
            started_at: None,
            last_activity_at: Some(record.last_activity),
            metadata: json!({
                "project_name": record.project_name.clone(),
                "cwd": record.cwd.clone(),
                "model": record.model.clone(),
                "terminal_app": record.terminal_app.clone(),
                "terminal_bundle": record.terminal_bundle.clone(),
                "host_app": record.host_app.clone(),
                "window_title": record.window_title.clone(),
                "tty": record.tty.clone(),
                "terminal_pid": record.terminal_pid,
                "cli_pid": record.cli_pid,
                "current_tool": record.current_tool.clone(),
                "tool_description": record.tool_description.clone(),
                "last_user_prompt": record.last_user_prompt.clone(),
                "last_assistant_message": record.last_assistant_message.clone(),
            }),
        }
    }
}

pub fn agent_sessions_from_records<'a>(
    records: impl IntoIterator<Item = &'a SessionRecord>,
) -> Vec<AgentSession> {
    let mut sessions = records
        .into_iter()
        .map(AgentSession::from_record)
        .collect::<Vec<_>>();
    sessions.sort_by(|a, b| {
        agent_session_sort_key(a)
            .cmp(&agent_session_sort_key(b))
            .then_with(|| b.last_activity_at.cmp(&a.last_activity_at))
            .then_with(|| a.source_id.cmp(&b.source_id))
            .then_with(|| a.session_id.cmp(&b.session_id))
    });
    sessions
}

fn agent_session_sort_key(session: &AgentSession) -> u8 {
    match session.status {
        AgentSessionStatus::Waiting => 0,
        AgentSessionStatus::Running => 1,
        AgentSessionStatus::Completed => 2,
        AgentSessionStatus::Error => 3,
        AgentSessionStatus::Idle => 4,
    }
}

fn session_title(record: &SessionRecord) -> String {
    record
        .project_name
        .clone()
        .or_else(|| {
            record
                .last_user_prompt
                .as_ref()
                .map(|prompt| compact_title(prompt))
        })
        .or_else(|| record.cwd.as_ref().and_then(|cwd| path_name(cwd)))
        .unwrap_or_else(|| record.source.clone())
}

fn compact_title(value: &str) -> String {
    let trimmed = value.trim();
    let mut title = trimmed.chars().take(80).collect::<String>();
    if title.is_empty() {
        title = "Untitled session".to_string();
    }
    title
}

fn path_name(value: &str) -> Option<String> {
    value
        .trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .filter(|part| !part.is_empty())
        .map(ToOwned::to_owned)
}
