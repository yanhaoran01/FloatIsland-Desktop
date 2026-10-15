use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use echoisland_core::SessionRecord;
use echoisland_paths::current_platform_paths;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Default)]
struct PersistedState {
    sessions: Vec<SessionRecord>,
}

pub fn default_state_path() -> PathBuf {
    current_platform_paths().state_path
}

pub fn save_sessions(path: &Path, sessions: &[SessionRecord]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }

    let payload = PersistedState {
        sessions: sessions.to_vec(),
    };
    let encoded = serde_json::to_vec_pretty(&payload).context("failed to encode state")?;
    write_atomic(path, &encoded)?;
    Ok(())
}

pub fn load_sessions(path: &Path) -> Result<Vec<SessionRecord>> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let raw = fs::read(path).with_context(|| format!("failed to read {}", path.display()))?;
    let decoded: PersistedState =
        serde_json::from_slice(&raw).context("failed to decode persisted state")?;
    Ok(decoded.sessions)
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("state.json");
    let temp_path = path.with_file_name(format!("{file_name}.tmp"));

    fs::write(&temp_path, bytes)
        .with_context(|| format!("failed to write temp file {}", temp_path.display()))?;

    if path.exists() {
        fs::remove_file(path).with_context(|| format!("failed to replace {}", path.display()))?;
    }

    fs::rename(&temp_path, path).with_context(|| {
        format!(
            "failed to move {} to {}",
            temp_path.display(),
            path.display()
        )
    })?;
    Ok(())
}
