use anyhow::Result;
use echoisland_core::EventMetadata;
use tracing::info;

use super::{FocusOutcome, ForegroundTabInfo, SessionFocusTarget, SessionTabCache};

mod activation;
mod codex_app;
mod native_apps;
mod osascript;
mod process_inference;
mod target;
mod title_match;
mod tmux;
mod util;

use activation::{
    activate_ghostty, activate_ide_window, activate_iterm2, activate_kitty, activate_terminal_app,
    activate_terminal_window, activate_wezterm,
};
use native_apps::{activate_app_bundle, native_app_bundle_for_terminal, source_native_app_bundle};
use process_inference::{
    detect_tty_path_from_pid, infer_cli_pid_from_running_processes, known_terminal_target_for_pid,
    terminal_process_from_process_tree,
};
use target::{
    MacFocusTarget, has_terminal_metadata, is_bundle_running, resolve_focus_target,
    should_use_source_native_app_fallback, terminal_metadata_for_target,
};
use tmux::effective_tty;

pub fn prewarm_codex_app_deeplink_handler() {
    codex_app::prewarm_deeplink_handler();
}

pub fn focus_session_terminal(
    target: &SessionFocusTarget,
    cached_tab: Option<&SessionTabCache>,
) -> Result<FocusOutcome> {
    let _ = cached_tab;

    if let Some(outcome) = codex_app::schedule_thread_resume(target) {
        return Ok(outcome);
    }

    if let Some((bundle_id, display_name)) = native_app_bundle_for_terminal(target) {
        info!(
            source = %target.source,
            bundle_id,
            display_name,
            "focusing macOS native desktop app by terminal bundle"
        );
        return Ok(FocusOutcome {
            focused: activate_app_bundle(bundle_id, display_name),
            selected_tab: None,
        });
    }

    let resolved_target = resolve_focus_target(target);
    info!(
        source = %target.source,
        terminal_app = ?target.terminal_app,
        host_app = ?target.host_app,
        cwd = ?target.cwd,
        resolved_target = ?resolved_target,
        "trying macOS terminal focus"
    );

    if resolved_target.is_none()
        && should_use_source_native_app_fallback(target)
        && let Some((bundle_id, display_name)) = source_native_app_bundle(&target.source)
        && is_bundle_running(bundle_id)
    {
        info!(
            source = %target.source,
            bundle_id,
            display_name,
            "focusing macOS native desktop app from source fallback"
        );
        return Ok(FocusOutcome {
            focused: activate_app_bundle(bundle_id, display_name),
            selected_tab: None,
        });
    }

    let focused = match resolved_target {
        Some(MacFocusTarget::ITerm2) => activate_iterm2(target),
        Some(MacFocusTarget::Ghostty) => activate_ghostty(target),
        Some(MacFocusTarget::TerminalApp) => activate_terminal_app(target),
        Some(MacFocusTarget::Warp) => {
            activate_terminal_window(target, "dev.warp.Warp-Stable", "Warp")
        }
        Some(MacFocusTarget::WezTerm) => activate_wezterm(target),
        Some(MacFocusTarget::Kitty) => activate_kitty(target),
        Some(MacFocusTarget::Alacritty) => {
            activate_terminal_window(target, "org.alacritty", "Alacritty")
        }
        Some(MacFocusTarget::Hyper) => activate_terminal_window(target, "", "Hyper"),
        Some(MacFocusTarget::Tabby) => activate_terminal_window(target, "", "Tabby"),
        Some(MacFocusTarget::Rio) => activate_terminal_window(target, "", "Rio"),
        Some(MacFocusTarget::Cursor) => {
            activate_ide_window(target, "com.todesktop.230313mzl4w4u92", "Cursor")
        }
        Some(MacFocusTarget::VSCode) => {
            activate_ide_window(target, "com.microsoft.VSCode", "Visual Studio Code")
        }
        Some(MacFocusTarget::CodexApp) => activate_app_bundle("com.openai.codex", "Codex"),
        Some(MacFocusTarget::TraeApp) => activate_app_bundle("com.trae.app", "Trae"),
        Some(MacFocusTarget::QoderApp) => activate_app_bundle("com.qoder.ide", "Qoder"),
        Some(MacFocusTarget::FactoryApp) => activate_app_bundle("com.factory.app", "Factory"),
        Some(MacFocusTarget::CodeBuddyApp) => {
            activate_app_bundle("com.tencent.codebuddy", "CodeBuddy")
        }
        Some(MacFocusTarget::CodyBuddyCnApp) => {
            activate_app_bundle("com.tencent.codebuddy.cn", "CodyBuddyCN")
        }
        Some(MacFocusTarget::StepFunApp) => activate_app_bundle("com.stepfun.app", "StepFun"),
        Some(MacFocusTarget::OpenCodeApp) => activate_app_bundle("ai.opencode.desktop", "OpenCode"),
        None => false,
    };

    Ok(FocusOutcome {
        focused,
        selected_tab: None,
    })
}

#[allow(dead_code)]
pub fn foreground_session_terminal_tab() -> Result<Option<ForegroundTabInfo>> {
    Ok(None)
}

pub fn infer_terminal_metadata(target: &SessionFocusTarget) -> Option<EventMetadata> {
    let cli_pid = target
        .cli_pid
        .or_else(|| infer_cli_pid_from_running_processes(target));
    let inferred_terminal = target
        .terminal_pid
        .and_then(|pid| known_terminal_target_for_pid(pid).map(|target| (pid, target)))
        .or_else(|| cli_pid.and_then(terminal_process_from_process_tree));
    let inferred_terminal_pid = inferred_terminal.map(|(pid, _)| pid);
    let inferred_tty = effective_tty(target)
        .map(str::to_string)
        .or_else(|| cli_pid.and_then(detect_tty_path_from_pid))
        .or_else(|| inferred_terminal_pid.and_then(detect_tty_path_from_pid));
    let inferred_target = inferred_terminal.map(|(_, target)| target);
    let (inferred_app, inferred_bundle) = inferred_target
        .and_then(terminal_metadata_for_target)
        .unwrap_or((None, None));

    let metadata = EventMetadata {
        terminal_app: target.terminal_app.clone().or(inferred_app),
        terminal_bundle: target.terminal_bundle.clone().or(inferred_bundle),
        host_app: target.host_app.clone(),
        window_title: target.window_title.clone(),
        tty: inferred_tty,
        pid: inferred_terminal_pid,
        cli_pid: target.cli_pid.or(cli_pid),
        iterm_session_id: target.iterm_session_id.clone(),
        kitty_window_id: target.kitty_window_id.clone(),
        tmux_env: target.tmux_env.clone(),
        tmux_pane: target.tmux_pane.clone(),
        tmux_client_tty: target.tmux_client_tty.clone(),
        workspace_roots: None,
    };

    has_terminal_metadata(&metadata).then_some(metadata)
}
