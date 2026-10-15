use std::path::PathBuf;

use echoisland_paths::{
    bridge_binary_path, bridge_binary_path_from_home, claude_config_dir,
    claude_config_dir_from_home, claude_projects_dir, claude_projects_dir_from_home,
    claude_settings_path, claude_settings_path_from_home, echoisland_bin_dir,
    echoisland_bin_dir_from_home, user_home_dir,
};
use serde::Serialize;

use crate::{AdapterPath, AdapterStatus, InstallableAdapter, SessionScanningAdapter};

mod install;
mod scan;

pub use install::{get_claude_status, install_claude_adapter};
pub use scan::{ClaudeSessionScanner, scan_claude_sessions};

#[derive(Debug, Clone)]
pub struct ClaudeAdapter {
    paths: ClaudePaths,
}

#[derive(Debug, Clone)]
pub struct ClaudePaths {
    pub home_dir: PathBuf,
    pub claude_dir: PathBuf,
    pub settings_path: PathBuf,
    pub projects_dir: PathBuf,
    pub hook_script_path: PathBuf,
    pub bridge_install_dir: PathBuf,
    pub bridge_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClaudeStatus {
    pub claude_dir_exists: bool,
    pub bridge_exists: bool,
    pub hooks_installed: bool,
    pub live_capture_supported: bool,
    pub live_capture_ready: bool,
    pub status_note: Option<String>,
    pub claude_dir: String,
    pub settings_path: String,
    pub projects_dir: String,
    pub bridge_path: String,
}

impl ClaudePaths {
    pub fn from_home(home_dir: impl Into<PathBuf>) -> Self {
        let home_dir = home_dir.into();
        let claude_dir = claude_config_dir_from_home(&home_dir);
        let settings_path = claude_settings_path_from_home(&home_dir);
        let projects_dir = claude_projects_dir_from_home(&home_dir);
        let hook_script_path = claude_dir.join("hooks").join("echoisland-hook.sh");
        let bridge_install_dir = echoisland_bin_dir_from_home(&home_dir);
        let bridge_path = bridge_binary_path_from_home(&home_dir);
        Self {
            home_dir,
            claude_dir,
            settings_path,
            projects_dir,
            hook_script_path,
            bridge_install_dir,
            bridge_path,
        }
    }
}

impl ClaudeAdapter {
    pub fn new(paths: ClaudePaths) -> Self {
        Self { paths }
    }

    pub fn with_default_paths() -> Self {
        Self::new(default_paths())
    }
}

pub fn default_paths() -> ClaudePaths {
    ClaudePaths {
        home_dir: user_home_dir(),
        claude_dir: claude_config_dir(),
        settings_path: claude_settings_path(),
        projects_dir: claude_projects_dir(),
        hook_script_path: claude_config_dir().join("hooks").join("echoisland-hook.sh"),
        bridge_install_dir: echoisland_bin_dir(),
        bridge_path: bridge_binary_path(),
    }
}

impl From<ClaudeStatus> for AdapterStatus {
    fn from(value: ClaudeStatus) -> Self {
        Self {
            adapter: "claude".to_string(),
            config_dir_exists: value.claude_dir_exists,
            bridge_exists: value.bridge_exists,
            hooks_installed: value.hooks_installed,
            hooks_enabled: value.hooks_installed,
            live_capture_supported: value.live_capture_supported,
            live_capture_ready: value.live_capture_ready,
            status_note: value.status_note,
            paths: vec![
                AdapterPath {
                    label: "claude_dir".to_string(),
                    path: value.claude_dir,
                },
                AdapterPath {
                    label: "settings_path".to_string(),
                    path: value.settings_path,
                },
                AdapterPath {
                    label: "projects_dir".to_string(),
                    path: value.projects_dir,
                },
                AdapterPath {
                    label: "bridge_path".to_string(),
                    path: value.bridge_path,
                },
            ],
        }
    }
}

impl InstallableAdapter for ClaudeAdapter {
    fn adapter_id(&self) -> &'static str {
        "claude"
    }

    fn status(&self) -> anyhow::Result<AdapterStatus> {
        Ok(get_claude_status(&self.paths)?.into())
    }

    fn install(&self, source_bridge: &std::path::Path) -> anyhow::Result<AdapterStatus> {
        Ok(install_claude_adapter(&self.paths, source_bridge)?.into())
    }
}

impl SessionScanningAdapter for ClaudeAdapter {
    fn adapter_id(&self) -> &'static str {
        "claude"
    }

    fn scan_sessions(&self) -> anyhow::Result<Vec<echoisland_core::SessionRecord>> {
        scan_claude_sessions(&self.paths)
    }
}
