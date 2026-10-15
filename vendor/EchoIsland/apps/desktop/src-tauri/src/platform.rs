use serde::Serialize;

use echoisland_paths::current_platform_paths as resolved_platform_paths;

use crate::platform_stub::stub_platform_capabilities;

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaptureMode {
    Live,
    Fallback,
    Mixed,
    Sample,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlatformBackend {
    Windows,
    Macos,
    Stub,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    pub platform: String,
    pub platform_backend: PlatformBackend,
    pub can_focus_terminal: bool,
    pub can_bind_terminal_tab: bool,
    pub can_live_capture: bool,
    pub can_shape_window_region: bool,
    pub supports_tray: bool,
    pub capture_mode: CaptureMode,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformPathsPayload {
    pub home_dir: String,
    pub app_data_dir: String,
    pub echoisland_app_dir: String,
    pub state_path: String,
    pub ipc_token_path: String,
    pub http_receiver_status_path: String,
    pub focus_bindings_path: String,
    pub bridge_log_path: String,
    pub echoisland_home_dir: String,
    pub echoisland_bin_dir: String,
    pub bridge_binary_path: String,
    pub codex_dir: String,
    pub codex_hooks_path: String,
    pub codex_config_path: String,
    pub claude_config_dir: String,
    pub claude_settings_path: String,
    pub claude_projects_dir: String,
    pub openclaw_dir: String,
    pub openclaw_config_path: String,
    pub openclaw_hooks_dir: String,
}

pub fn current_platform_capabilities() -> PlatformCapabilities {
    let platform = current_platform_name();
    if cfg!(target_os = "windows") {
        PlatformCapabilities {
            platform: platform.to_string(),
            platform_backend: PlatformBackend::Windows,
            can_focus_terminal: true,
            can_bind_terminal_tab: true,
            can_live_capture: true,
            can_shape_window_region: true,
            supports_tray: true,
            capture_mode: CaptureMode::Mixed,
        }
    } else if cfg!(target_os = "macos") {
        PlatformCapabilities {
            platform: platform.to_string(),
            platform_backend: PlatformBackend::Macos,
            can_focus_terminal: true,
            can_bind_terminal_tab: false,
            can_live_capture: true,
            can_shape_window_region: false,
            supports_tray: false,
            capture_mode: CaptureMode::Fallback,
        }
    } else {
        stub_platform_capabilities(platform)
    }
}

pub fn current_platform_paths() -> PlatformPathsPayload {
    let paths = resolved_platform_paths();
    PlatformPathsPayload {
        home_dir: paths.home_dir.display().to_string(),
        app_data_dir: paths.app_data_dir.display().to_string(),
        echoisland_app_dir: paths.echoisland_app_dir.display().to_string(),
        state_path: paths.state_path.display().to_string(),
        ipc_token_path: paths.ipc_token_path.display().to_string(),
        http_receiver_status_path: paths.http_receiver_status_path.display().to_string(),
        focus_bindings_path: paths.focus_bindings_path.display().to_string(),
        bridge_log_path: paths.bridge_log_path.display().to_string(),
        echoisland_home_dir: paths.echoisland_home_dir.display().to_string(),
        echoisland_bin_dir: paths.echoisland_bin_dir.display().to_string(),
        bridge_binary_path: paths.bridge_binary_path.display().to_string(),
        codex_dir: paths.codex_dir.display().to_string(),
        codex_hooks_path: paths.codex_hooks_path.display().to_string(),
        codex_config_path: paths.codex_config_path.display().to_string(),
        claude_config_dir: paths.claude_config_dir.display().to_string(),
        claude_settings_path: paths.claude_settings_path.display().to_string(),
        claude_projects_dir: paths.claude_projects_dir.display().to_string(),
        openclaw_dir: paths.openclaw_dir.display().to_string(),
        openclaw_config_path: paths.openclaw_config_path.display().to_string(),
        openclaw_hooks_dir: paths.openclaw_hooks_dir.display().to_string(),
    }
}

fn current_platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}
