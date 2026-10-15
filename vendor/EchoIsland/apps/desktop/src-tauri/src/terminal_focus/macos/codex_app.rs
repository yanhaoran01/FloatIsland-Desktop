use std::{process::Command, thread, time::Duration};

use anyhow::{Context, Result};

use crate::terminal_focus::{
    CODEX_APP_BUNDLE_ID, CodexSessionKind, FocusOutcome, SessionFocusTarget, codex_session_kind,
};

const DEEPLINK_DELAY: Duration = Duration::from_millis(260);

pub(super) fn prewarm_deeplink_handler() {
    thread::spawn(|| {
        let script = format!(
            r#"try
path to application id "{CODEX_APP_BUNDLE_ID}" as text
end try"#
        );
        let _ = Command::new("/usr/bin/osascript")
            .args(["-e", script.as_str()])
            .output();
    });
}

pub(super) fn schedule_thread_resume(target: &SessionFocusTarget) -> Option<FocusOutcome> {
    if codex_session_kind(target) != CodexSessionKind::App {
        return None;
    }

    let deeplink = codex_thread_deeplink(&target.session_id).ok()?;
    thread::spawn(move || {
        thread::sleep(DEEPLINK_DELAY);
        let _ = open_thread_deeplink(&deeplink);
    });

    Some(FocusOutcome {
        focused: true,
        selected_tab: None,
    })
}

fn codex_thread_deeplink(thread_id: &str) -> Result<String> {
    let thread_id = thread_id.trim();
    if thread_id.is_empty() {
        anyhow::bail!("missing Codex thread id");
    }
    Ok(format!("codex://threads/{thread_id}"))
}

fn open_thread_deeplink(deeplink: &str) -> Result<()> {
    Command::new("/usr/bin/open")
        .arg(deeplink)
        .spawn()
        .with_context(|| format!("open {deeplink}"))?;
    Ok(())
}
