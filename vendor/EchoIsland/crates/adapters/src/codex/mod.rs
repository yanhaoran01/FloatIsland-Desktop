use std::path::PathBuf;

use echoisland_paths::{
    bridge_binary_path, bridge_binary_path_from_home, codex_config_path,
    codex_config_path_from_home, codex_dir, codex_dir_from_home, codex_hooks_path,
    codex_hooks_path_from_home, echoisland_bin_dir, echoisland_bin_dir_from_home, user_home_dir,
};
use serde::Serialize;

use crate::{AdapterPath, AdapterStatus, InstallableAdapter, SessionScanningAdapter};

mod install;
mod scan;

pub use install::{get_codex_status, install_codex_adapter};
pub use scan::{CodexSessionScanner, scan_codex_sessions};

#[derive(Debug, Clone)]
pub struct CodexAdapter {
    paths: CodexPaths,
}

#[derive(Debug, Clone)]
pub struct CodexPaths {
    pub home_dir: PathBuf,
    pub codex_dir: PathBuf,
    pub hooks_path: PathBuf,
    pub config_path: PathBuf,
    pub bridge_install_dir: PathBuf,
    pub bridge_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
pub struct CodexStatus {
    pub codex_dir_exists: bool,
    pub bridge_exists: bool,
    pub hooks_installed: bool,
    pub codex_hooks_enabled: bool,
    pub live_capture_supported: bool,
    pub live_capture_ready: bool,
    pub status_note: Option<String>,
    pub codex_dir: String,
    pub hooks_path: String,
    pub config_path: String,
    pub bridge_path: String,
}

impl CodexPaths {
    pub fn from_home(home_dir: impl Into<PathBuf>) -> Self {
        let home_dir = home_dir.into();
        let codex_dir = codex_dir_from_home(&home_dir);
        let hooks_path = codex_hooks_path_from_home(&home_dir);
        let config_path = codex_config_path_from_home(&home_dir);
        let bridge_install_dir = echoisland_bin_dir_from_home(&home_dir);
        let bridge_path = bridge_binary_path_from_home(&home_dir);
        Self {
            home_dir,
            codex_dir,
            hooks_path,
            config_path,
            bridge_install_dir,
            bridge_path,
        }
    }
}

impl CodexAdapter {
    pub fn new(paths: CodexPaths) -> Self {
        Self { paths }
    }

    pub fn with_default_paths() -> Self {
        Self::new(default_paths())
    }

    pub fn paths(&self) -> &CodexPaths {
        &self.paths
    }
}

pub fn default_paths() -> CodexPaths {
    CodexPaths {
        home_dir: user_home_dir(),
        codex_dir: codex_dir(),
        hooks_path: codex_hooks_path(),
        config_path: codex_config_path(),
        bridge_install_dir: echoisland_bin_dir(),
        bridge_path: bridge_binary_path(),
    }
}

impl From<CodexStatus> for AdapterStatus {
    fn from(value: CodexStatus) -> Self {
        Self {
            adapter: "codex".to_string(),
            config_dir_exists: value.codex_dir_exists,
            bridge_exists: value.bridge_exists,
            hooks_installed: value.hooks_installed,
            hooks_enabled: value.codex_hooks_enabled,
            live_capture_supported: value.live_capture_supported,
            live_capture_ready: value.live_capture_ready,
            status_note: value.status_note,
            paths: vec![
                AdapterPath {
                    label: "codex_dir".to_string(),
                    path: value.codex_dir,
                },
                AdapterPath {
                    label: "hooks_path".to_string(),
                    path: value.hooks_path,
                },
                AdapterPath {
                    label: "config_path".to_string(),
                    path: value.config_path,
                },
                AdapterPath {
                    label: "bridge_path".to_string(),
                    path: value.bridge_path,
                },
            ],
        }
    }
}

impl InstallableAdapter for CodexAdapter {
    fn adapter_id(&self) -> &'static str {
        "codex"
    }

    fn status(&self) -> anyhow::Result<AdapterStatus> {
        Ok(get_codex_status(&self.paths)?.into())
    }

    fn install(&self, source_bridge: &std::path::Path) -> anyhow::Result<AdapterStatus> {
        Ok(install_codex_adapter(&self.paths, source_bridge)?.into())
    }
}

impl SessionScanningAdapter for CodexAdapter {
    fn adapter_id(&self) -> &'static str {
        "codex"
    }

    fn scan_sessions(&self) -> anyhow::Result<Vec<echoisland_core::SessionRecord>> {
        scan_codex_sessions(&self.paths)
    }
}
