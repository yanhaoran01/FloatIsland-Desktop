use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const CODEX_APP_BUNDLE_ID: &str = "com.openai.codex";

#[derive(Clone, Debug)]
#[cfg_attr(target_os = "windows", allow(dead_code))]
pub struct SessionFocusTarget {
    pub session_id: String,
    pub source: String,
    pub project_name: Option<String>,
    pub cwd: Option<String>,
    pub terminal_app: Option<String>,
    pub terminal_bundle: Option<String>,
    pub host_app: Option<String>,
    pub window_title: Option<String>,
    pub tty: Option<String>,
    pub terminal_pid: Option<u32>,
    pub cli_pid: Option<u32>,
    pub iterm_session_id: Option<String>,
    pub kitty_window_id: Option<String>,
    pub tmux_env: Option<String>,
    pub tmux_pane: Option<String>,
    pub tmux_client_tty: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionTabCache {
    pub terminal_pid: u32,
    pub window_hwnd: i64,
    pub runtime_id: String,
    pub title: String,
}

#[derive(Clone, Debug)]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub struct ForegroundTabInfo {
    pub cache: SessionTabCache,
}

#[derive(Clone, Debug)]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub struct ObservedTab {
    pub cache: SessionTabCache,
    pub observed_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct SessionObservation {
    pub status: String,
    pub last_user_prompt: Option<String>,
    pub last_activity: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct FocusOutcome {
    pub focused: bool,
    pub selected_tab: Option<SessionTabCache>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CodexSessionKind {
    App,
    Cli,
    Unknown,
}

pub fn codex_session_kind(target: &SessionFocusTarget) -> CodexSessionKind {
    if target.host_app.as_deref().is_some_and(is_codex_app_host)
        || target
            .terminal_bundle
            .as_deref()
            .is_some_and(is_codex_app_host)
    {
        return CodexSessionKind::App;
    }

    if !target.source.eq_ignore_ascii_case("codex") {
        return CodexSessionKind::Unknown;
    }

    if target.cli_pid.is_some()
        || target.tty.as_deref().is_some_and(|value| !value.is_empty())
        || target.terminal_pid.is_some()
        || target
            .terminal_bundle
            .as_deref()
            .is_some_and(|value| !value.is_empty())
        || target
            .terminal_app
            .as_deref()
            .is_some_and(|value| !value.is_empty())
    {
        return CodexSessionKind::Cli;
    }

    CodexSessionKind::Unknown
}

pub fn is_codex_app_host(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    normalized == CODEX_APP_BUNDLE_ID
}
