use std::path::PathBuf;

use echoisland_paths::{
    http_receiver_status_path, ipc_token_path, openclaw_config_path,
    openclaw_config_path_from_home, openclaw_dir, openclaw_dir_from_home, openclaw_hooks_dir,
    openclaw_hooks_dir_from_home, user_home_dir,
};
use serde::Serialize;

use crate::{AdapterPath, AdapterStatus, InstallableAdapter};

mod install;

pub use install::{DEFAULT_OPENCLAW_RECEIVER_URL, get_openclaw_status, install_openclaw_adapter};

const OPENCLAW_HOOK_ID: &str = "echoisland";

#[derive(Debug, Clone)]
pub struct OpenClawAdapter {
    paths: OpenClawPaths,
}

#[derive(Debug, Clone)]
pub struct OpenClawPaths {
    pub home_dir: PathBuf,
    pub openclaw_dir: PathBuf,
    pub config_path: PathBuf,
    pub hooks_dir: PathBuf,
    pub hook_dir: PathBuf,
    pub hook_manifest_path: PathBuf,
    pub hook_handler_path: PathBuf,
    pub plugin_dir: PathBuf,
    pub plugin_package_path: PathBuf,
    pub plugin_manifest_path: PathBuf,
    pub plugin_entry_path: PathBuf,
    pub token_path: PathBuf,
    pub receiver_status_path: PathBuf,
    pub receiver_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OpenClawStatus {
    pub openclaw_dir_exists: bool,
    pub config_path_exists: bool,
    pub hooks_dir_exists: bool,
    pub hook_installed: bool,
    pub hook_enabled: bool,
    pub plugin_installed: bool,
    pub plugin_enabled: bool,
    pub token_exists: bool,
    pub live_capture_supported: bool,
    pub live_capture_ready: bool,
    pub status_note: Option<String>,
    pub openclaw_dir: String,
    pub config_path: String,
    pub hooks_dir: String,
    pub hook_dir: String,
    pub hook_manifest_path: String,
    pub hook_handler_path: String,
    pub plugin_dir: String,
    pub plugin_package_path: String,
    pub plugin_manifest_path: String,
    pub plugin_entry_path: String,
    pub token_path: String,
    pub receiver_url: String,
}

impl OpenClawPaths {
    pub fn from_home(home_dir: impl Into<PathBuf>) -> Self {
        Self::from_home_with_runtime(
            home_dir,
            DEFAULT_OPENCLAW_RECEIVER_URL.to_string(),
            ipc_token_path(),
        )
    }

    pub fn from_home_with_runtime(
        home_dir: impl Into<PathBuf>,
        receiver_url: impl Into<String>,
        token_path: impl Into<PathBuf>,
    ) -> Self {
        let home_dir = home_dir.into();
        let openclaw_dir = openclaw_dir_from_home(&home_dir);
        let config_path = openclaw_config_path_from_home(&home_dir);
        let hooks_dir = openclaw_hooks_dir_from_home(&home_dir);
        let hook_dir = hooks_dir.join(OPENCLAW_HOOK_ID);
        let plugin_dir = openclaw_dir.join("echoisland-plugin");

        Self {
            home_dir,
            openclaw_dir,
            config_path,
            hooks_dir,
            hook_manifest_path: hook_dir.join("HOOK.md"),
            hook_handler_path: hook_dir.join("handler.ts"),
            hook_dir,
            plugin_package_path: plugin_dir.join("package.json"),
            plugin_manifest_path: plugin_dir.join("openclaw.plugin.json"),
            plugin_entry_path: plugin_dir.join("index.ts"),
            plugin_dir,
            token_path: token_path.into(),
            receiver_status_path: http_receiver_status_path(),
            receiver_url: receiver_url.into(),
        }
    }
}

impl OpenClawAdapter {
    pub fn new(paths: OpenClawPaths) -> Self {
        Self { paths }
    }

    pub fn with_default_paths() -> Self {
        Self::new(default_paths())
    }
}

pub fn default_paths() -> OpenClawPaths {
    let openclaw_dir = openclaw_dir();
    let hooks_dir = openclaw_hooks_dir();
    let hook_dir = hooks_dir.join(OPENCLAW_HOOK_ID);
    let plugin_dir = openclaw_dir.join("echoisland-plugin");

    OpenClawPaths {
        home_dir: user_home_dir(),
        openclaw_dir,
        config_path: openclaw_config_path(),
        hooks_dir,
        hook_manifest_path: hook_dir.join("HOOK.md"),
        hook_handler_path: hook_dir.join("handler.ts"),
        hook_dir,
        plugin_package_path: plugin_dir.join("package.json"),
        plugin_manifest_path: plugin_dir.join("openclaw.plugin.json"),
        plugin_entry_path: plugin_dir.join("index.ts"),
        plugin_dir,
        token_path: ipc_token_path(),
        receiver_status_path: http_receiver_status_path(),
        receiver_url: DEFAULT_OPENCLAW_RECEIVER_URL.to_string(),
    }
}

impl From<OpenClawStatus> for AdapterStatus {
    fn from(value: OpenClawStatus) -> Self {
        Self {
            adapter: "openclaw".to_string(),
            config_dir_exists: value.openclaw_dir_exists,
            bridge_exists: value.hook_installed || value.plugin_installed,
            hooks_installed: value.hook_installed,
            hooks_enabled: value.hook_enabled && value.plugin_enabled,
            live_capture_supported: value.live_capture_supported,
            live_capture_ready: value.live_capture_ready,
            status_note: value.status_note,
            paths: vec![
                AdapterPath {
                    label: "openclaw_dir".to_string(),
                    path: value.openclaw_dir,
                },
                AdapterPath {
                    label: "config_path".to_string(),
                    path: value.config_path,
                },
                AdapterPath {
                    label: "hook_dir".to_string(),
                    path: value.hook_dir,
                },
                AdapterPath {
                    label: "hook_manifest_path".to_string(),
                    path: value.hook_manifest_path,
                },
                AdapterPath {
                    label: "hook_handler_path".to_string(),
                    path: value.hook_handler_path,
                },
                AdapterPath {
                    label: "plugin_dir".to_string(),
                    path: value.plugin_dir,
                },
                AdapterPath {
                    label: "plugin_manifest_path".to_string(),
                    path: value.plugin_manifest_path,
                },
                AdapterPath {
                    label: "plugin_entry_path".to_string(),
                    path: value.plugin_entry_path,
                },
                AdapterPath {
                    label: "token_path".to_string(),
                    path: value.token_path,
                },
            ],
        }
    }
}

impl InstallableAdapter for OpenClawAdapter {
    fn adapter_id(&self) -> &'static str {
        "openclaw"
    }

    fn status(&self) -> anyhow::Result<AdapterStatus> {
        Ok(get_openclaw_status(&self.paths)?.into())
    }

    fn install(&self, _source_bridge: &std::path::Path) -> anyhow::Result<AdapterStatus> {
        Ok(install_openclaw_adapter(&self.paths)?.into())
    }
}
