use std::{process::Command, thread, time::Duration};

use anyhow::{Context, Result};
use tracing::warn;

use crate::terminal_focus::{
    CodexSessionKind, FocusOutcome, SessionFocusTarget, codex_session_kind,
};

const DEEPLINK_DELAY: Duration = Duration::from_millis(260);

pub(super) fn schedule_thread_resume(target: &SessionFocusTarget) -> Option<FocusOutcome> {
    if !should_resume_in_codex_app(target) {
        return None;
    }

    let deeplink = codex_thread_deeplink(&target.session_id).ok()?;
    thread::spawn(move || {
        thread::sleep(DEEPLINK_DELAY);
        if let Err(error) = open_thread_deeplink(&deeplink) {
            warn!(
                deeplink = %deeplink,
                error = %error,
                "failed to open Codex app thread deeplink"
            );
        }
    });

    Some(FocusOutcome {
        focused: true,
        selected_tab: None,
    })
}

fn should_resume_in_codex_app(target: &SessionFocusTarget) -> bool {
    codex_session_kind(target) == CodexSessionKind::App
}

fn codex_thread_deeplink(thread_id: &str) -> Result<String> {
    let thread_id = thread_id.trim();
    if thread_id.is_empty() {
        anyhow::bail!("missing Codex thread id");
    }
    Ok(format!("codex://threads/{thread_id}"))
}

fn open_thread_deeplink(deeplink: &str) -> Result<()> {
    Command::new("explorer.exe")
        .arg(deeplink)
        .spawn()
        .with_context(|| format!("open {deeplink}"))?;
    Ok(())
}
