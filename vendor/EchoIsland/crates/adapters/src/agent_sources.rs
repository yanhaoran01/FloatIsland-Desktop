use anyhow::{Result, bail};
use echoisland_core::{
    AgentSession, AgentSource, AgentSourceType, SessionRecord, agent_sessions_from_records,
};

use crate::SessionScanningAdapter;

pub trait AgentSourceAdapter: Send {
    fn source(&self) -> AgentSource;
    fn detect_sessions(&mut self) -> Result<Vec<AgentSession>>;

    fn focus_session(&self, session: &AgentSession) -> Result<()> {
        bail!(
            "focus is not implemented for source {} session {}",
            session.source_id,
            session.session_id
        )
    }
}

#[derive(Default)]
pub struct AgentSourceRegistry {
    adapters: Vec<Box<dyn AgentSourceAdapter>>,
}

impl AgentSourceRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register<A>(&mut self, adapter: A)
    where
        A: AgentSourceAdapter + 'static,
    {
        self.adapters.push(Box::new(adapter));
        self.adapters.sort_by(|a, b| {
            b.source()
                .priority
                .cmp(&a.source().priority)
                .then_with(|| a.source().source_id.cmp(&b.source().source_id))
        });
    }

    pub fn sources(&self) -> Vec<AgentSource> {
        self.adapters
            .iter()
            .map(|adapter| adapter.source())
            .collect()
    }

    pub fn detect_sessions(&mut self) -> Vec<AgentSession> {
        let mut sessions = Vec::new();

        for adapter in &mut self.adapters {
            let source = adapter.source();
            if !source.enabled {
                continue;
            }

            match adapter.detect_sessions() {
                Ok(mut detected) => sessions.append(&mut detected),
                Err(error) => {
                    tracing::warn!(
                        source = source.source_id,
                        error = %error,
                        "failed to detect agent source sessions"
                    );
                }
            }
        }

        sessions.sort_by(|a, b| {
            agent_session_status_rank(a)
                .cmp(&agent_session_status_rank(b))
                .then_with(|| b.last_activity_at.cmp(&a.last_activity_at))
                .then_with(|| a.source_id.cmp(&b.source_id))
                .then_with(|| a.session_id.cmp(&b.session_id))
        });
        sessions
    }
}

pub struct ScanningAgentSourceAdapter<A> {
    source: AgentSource,
    adapter: A,
}

impl<A> ScanningAgentSourceAdapter<A> {
    pub fn new(source: AgentSource, adapter: A) -> Self {
        Self { source, adapter }
    }
}

impl<A> AgentSourceAdapter for ScanningAgentSourceAdapter<A>
where
    A: SessionScanningAdapter + Send,
{
    fn source(&self) -> AgentSource {
        self.source.clone()
    }

    fn detect_sessions(&mut self) -> Result<Vec<AgentSession>> {
        let records = self.adapter.scan_sessions()?;
        Ok(records_to_agent_sessions(records))
    }
}

pub fn records_to_agent_sessions(records: Vec<SessionRecord>) -> Vec<AgentSession> {
    agent_sessions_from_records(records.iter())
}

pub fn built_in_source(source_id: &str) -> Option<AgentSource> {
    let (source_type, display_name, icon, priority) = match source_id {
        "codex" | "codex-cli" => (AgentSourceType::Cli, "Codex", Some("codex"), 100),
        "claude" | "claude-code" => (AgentSourceType::Cli, "Claude Code", Some("claude"), 90),
        "openclaw" => (AgentSourceType::Cli, "OpenClaw", Some("openclaw"), 85),
        "gemini" | "gemini-cli" => (AgentSourceType::Cli, "Gemini CLI", Some("gemini"), 80),
        "glm" | "glm-cli" => (AgentSourceType::Cli, "GLM CLI", Some("glm"), 70),
        "vscode" => (AgentSourceType::Ide, "VS Code", Some("vscode"), 50),
        "cursor" => (AgentSourceType::Ide, "Cursor", Some("cursor"), 50),
        "trae" => (AgentSourceType::Ide, "Trae", Some("trae"), 50),
        _ => return None,
    };

    Some(AgentSource {
        source_id: source_id.to_string(),
        source_type,
        display_name: display_name.to_string(),
        icon: icon.map(ToOwned::to_owned),
        priority,
        enabled: true,
    })
}

fn agent_session_status_rank(session: &AgentSession) -> u8 {
    match session.status {
        echoisland_core::AgentSessionStatus::Waiting => 0,
        echoisland_core::AgentSessionStatus::Running => 1,
        echoisland_core::AgentSessionStatus::Completed => 2,
        echoisland_core::AgentSessionStatus::Error => 3,
        echoisland_core::AgentSessionStatus::Idle => 4,
    }
}
