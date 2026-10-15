use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use echoisland_paths::current_platform_paths;
use serde::{Deserialize, Serialize};

use crate::terminal_focus::SessionTabCache;

#[derive(Debug, Default, Serialize, Deserialize)]
struct PersistedFocusBindings {
    session_tabs: HashMap<String, SessionTabCache>,
}

pub fn default_focus_bindings_path() -> PathBuf {
    current_platform_paths().focus_bindings_path
}

pub fn load_focus_bindings(path: &Path) -> Result<HashMap<String, SessionTabCache>> {
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let raw = fs::read(path).with_context(|| format!("failed to read {}", path.display()))?;
    let decoded: PersistedFocusBindings =
        serde_json::from_slice(&raw).context("failed to decode persisted focus bindings")?;
    Ok(decoded.session_tabs)
}

pub fn save_focus_bindings(path: &Path, bindings: &HashMap<String, SessionTabCache>) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }

    let encoded = serde_json::to_vec_pretty(&PersistedFocusBindings {
        session_tabs: bindings.clone(),
    })
    .context("failed to encode focus bindings")?;
    fs::write(path, encoded).with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}
