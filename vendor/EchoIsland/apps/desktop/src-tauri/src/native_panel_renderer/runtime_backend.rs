use echoisland_runtime::RuntimeSnapshot;
use std::marker::PhantomData;
use tauri::AppHandle;

use crate::{
    native_panel_core::{PanelSnapshotSyncResult, PanelState},
    native_panel_scene::{PanelRuntimeSceneBundle, build_panel_runtime_scene_bundle},
};

use super::descriptors::NativePanelRuntimeInputDescriptor;
use super::host_runtime_facade::native_panel_host_display_reposition_from_input_descriptor;
use super::runtime_scene_cache::{
    NativePanelRuntimeSceneCache, NativePanelRuntimeSceneCacheKey, cache_runtime_scene_with_key,
    native_panel_runtime_scene_cache_key,
};
use super::traits::NativePanelSceneHost;

pub(crate) fn reposition_native_panel_to_selected_display_then_refresh<R: tauri::Runtime>(
    app: &AppHandle<R>,
    reposition: impl FnOnce(&AppHandle<R>) -> Result<(), String>,
    refresh: impl FnOnce(&AppHandle<R>) -> Result<(), String>,
) -> Result<(), String> {
    reposition(app)?;
    refresh(app)
}

#[derive(Clone, Debug)]
pub(crate) struct NativePanelRuntimeSceneSyncResult {
    pub(crate) snapshot_sync: PanelSnapshotSyncResult,
    pub(crate) bundle: PanelRuntimeSceneBundle,
    pub(crate) cache_key: NativePanelRuntimeSceneCacheKey,
}

pub(crate) fn sync_runtime_scene_bundle_from_input_descriptor(
    panel_state: &mut PanelState,
    raw_snapshot: &RuntimeSnapshot,
    input: &NativePanelRuntimeInputDescriptor,
    now: chrono::DateTime<chrono::Utc>,
) -> NativePanelRuntimeSceneSyncResult {
    let snapshot_sync =
        crate::native_panel_core::sync_panel_snapshot_state(panel_state, raw_snapshot, now);
    let bundle = build_panel_runtime_scene_bundle(
        panel_state,
        &snapshot_sync.displayed_snapshot,
        &input.scene_input,
    );
    let cache_key = native_panel_runtime_scene_cache_key(panel_state, input);

    NativePanelRuntimeSceneSyncResult {
        snapshot_sync,
        bundle,
        cache_key,
    }
}

pub(crate) fn rebuild_runtime_scene_sync_result_from_snapshot_input(
    panel_state: &mut PanelState,
    snapshot: &RuntimeSnapshot,
    input: &NativePanelRuntimeInputDescriptor,
) -> NativePanelRuntimeSceneSyncResult {
    sync_runtime_scene_bundle_from_input_descriptor(
        panel_state,
        snapshot,
        input,
        chrono::Utc::now(),
    )
}

pub(crate) fn cache_runtime_scene_sync_result(
    cache: &mut NativePanelRuntimeSceneCache,
    sync_result: NativePanelRuntimeSceneSyncResult,
) -> PanelSnapshotSyncResult {
    cache_runtime_scene_with_key(
        cache,
        sync_result.bundle.displayed_snapshot,
        Some(sync_result.cache_key),
        sync_result.bundle.scene,
        sync_result.bundle.runtime_render_state,
    );
    sync_result.snapshot_sync
}

pub(crate) fn apply_runtime_scene_sync_result_to_host<H>(
    host: &mut H,
    cache: &mut NativePanelRuntimeSceneCache,
    sync_result: NativePanelRuntimeSceneSyncResult,
    input: &NativePanelRuntimeInputDescriptor,
) -> Result<PanelSnapshotSyncResult, H::Error>
where
    H: NativePanelSceneHost,
{
    let NativePanelRuntimeSceneSyncResult {
        snapshot_sync,
        bundle,
        cache_key,
    } = sync_result;
    host.sync_scene_with_payload(
        &bundle.scene,
        bundle.runtime_render_state,
        native_panel_host_display_reposition_from_input_descriptor(input),
    )?;
    cache_runtime_scene_with_key(
        cache,
        bundle.displayed_snapshot,
        Some(cache_key),
        bundle.scene,
        bundle.runtime_render_state,
    );
    Ok(snapshot_sync)
}

pub(crate) fn sync_and_apply_runtime_scene_from_input_descriptor<H>(
    host: &mut H,
    cache: &mut NativePanelRuntimeSceneCache,
    panel_state: &mut PanelState,
    raw_snapshot: &RuntimeSnapshot,
    input: &NativePanelRuntimeInputDescriptor,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<PanelSnapshotSyncResult, H::Error>
where
    H: NativePanelSceneHost,
{
    let sync_result =
        sync_runtime_scene_bundle_from_input_descriptor(panel_state, raw_snapshot, input, now);
    apply_runtime_scene_sync_result_to_host(host, cache, sync_result, input)
}

pub(crate) fn rerender_runtime_scene_sync_result_to_host_with_input_descriptor<H>(
    host: &mut H,
    cache: &mut NativePanelRuntimeSceneCache,
    input: &NativePanelRuntimeInputDescriptor,
    rebuild_sync_result: impl FnOnce(&RuntimeSnapshot) -> NativePanelRuntimeSceneSyncResult,
) -> Result<bool, H::Error>
where
    H: NativePanelSceneHost,
{
    let Some(snapshot) = cache.last_snapshot.clone() else {
        return Ok(false);
    };
    let sync_result = rebuild_sync_result(&snapshot);
    apply_runtime_scene_sync_result_to_host(host, cache, sync_result, input)?;
    Ok(true)
}

pub(crate) fn rerender_runtime_scene_sync_result_to_host_for_panel_state_with_input_descriptor<H>(
    host: &mut H,
    cache: &mut NativePanelRuntimeSceneCache,
    panel_state: &mut PanelState,
    input: &NativePanelRuntimeInputDescriptor,
) -> Result<bool, H::Error>
where
    H: NativePanelSceneHost,
{
    rerender_runtime_scene_sync_result_to_host_with_input_descriptor(
        host,
        cache,
        input,
        |snapshot| {
            rebuild_runtime_scene_sync_result_from_snapshot_input(panel_state, snapshot, input)
        },
    )
}

pub(crate) fn rerender_runtime_scene_sync_result_to_host_on_transition_with_input_descriptor<H, T>(
    host: &mut H,
    cache: &mut NativePanelRuntimeSceneCache,
    transition: Option<T>,
    input: &NativePanelRuntimeInputDescriptor,
    rebuild_sync_result: impl FnOnce(&RuntimeSnapshot) -> NativePanelRuntimeSceneSyncResult,
) -> Result<Option<T>, H::Error>
where
    H: NativePanelSceneHost,
{
    if transition.is_some() {
        rerender_runtime_scene_sync_result_to_host_with_input_descriptor(
            host,
            cache,
            input,
            rebuild_sync_result,
        )?;
    }
    Ok(transition)
}

pub(crate) fn rerender_runtime_scene_sync_result_to_host_on_transition_for_panel_state_with_input_descriptor<
    H,
    T,
>(
    host: &mut H,
    cache: &mut NativePanelRuntimeSceneCache,
    panel_state: &mut PanelState,
    transition: Option<T>,
    input: &NativePanelRuntimeInputDescriptor,
) -> Result<Option<T>, H::Error>
where
    H: NativePanelSceneHost,
{
    rerender_runtime_scene_sync_result_to_host_on_transition_with_input_descriptor(
        host,
        cache,
        transition,
        input,
        |snapshot| {
            rebuild_runtime_scene_sync_result_from_snapshot_input(panel_state, snapshot, input)
        },
    )
}

pub(crate) fn mutate_panel_state_and_rerender_runtime_scene_sync_result_with_input_descriptor<H>(
    host: &mut H,
    cache: &mut NativePanelRuntimeSceneCache,
    panel_state: &mut PanelState,
    input: &NativePanelRuntimeInputDescriptor,
    mutate: impl FnOnce(&mut PanelState) -> bool,
) -> Result<bool, H::Error>
where
    H: NativePanelSceneHost,
{
    if !mutate(panel_state) {
        return Ok(false);
    }
    let _ = rerender_runtime_scene_sync_result_to_host_for_panel_state_with_input_descriptor(
        host,
        cache,
        panel_state,
        input,
    )?;
    Ok(true)
}

pub(crate) trait NativePanelPlatformRuntimeBackend {
    fn native_ui_enabled(&self) -> bool;

    fn create_panel(&self) -> Result<(), String>;

    fn hide_legacy_app_window<R: tauri::Runtime>(&self, app: &AppHandle<R>) -> Result<(), String>;

    fn spawn_platform_loops<R: tauri::Runtime + 'static>(&self, app: AppHandle<R>);

    fn update_snapshot<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
        snapshot: &RuntimeSnapshot,
    ) -> Result<(), String>;

    fn hide_panel<R: tauri::Runtime>(&self, app: &AppHandle<R>) -> Result<(), String>;

    fn refresh_from_last_snapshot<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<(), String>;

    fn reposition_to_selected_display<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<(), String>;

    fn set_shared_expanded_body_height<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
        body_height: f64,
    ) -> Result<(), String>;
}

pub(crate) trait NativePanelPlatformRuntimeFacadeApi {
    fn native_ui_enabled() -> bool;

    fn create_panel() -> Result<(), String>;

    fn hide_legacy_app_window<R: tauri::Runtime>(_: &AppHandle<R>) -> Result<(), String> {
        Ok(())
    }

    fn spawn_platform_loops<R: tauri::Runtime + 'static>(app: AppHandle<R>);

    fn update_snapshot<R: tauri::Runtime>(
        app: &AppHandle<R>,
        snapshot: &RuntimeSnapshot,
    ) -> Result<(), String>;

    fn hide_panel<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<(), String>;

    fn refresh_from_last_snapshot<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<(), String>;

    fn reposition_to_selected_display<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<(), String>;

    fn set_shared_expanded_body_height<R: tauri::Runtime>(
        app: &AppHandle<R>,
        body_height: f64,
    ) -> Result<(), String>;
}

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct NativePanelPlatformRuntimeBackendFacade<Api> {
    marker: PhantomData<fn() -> Api>,
}

impl<Api> NativePanelPlatformRuntimeBackendFacade<Api> {
    pub(crate) fn new() -> Self {
        Self {
            marker: PhantomData,
        }
    }
}

impl<Api> NativePanelPlatformRuntimeBackend for NativePanelPlatformRuntimeBackendFacade<Api>
where
    Api: NativePanelPlatformRuntimeFacadeApi,
{
    fn native_ui_enabled(&self) -> bool {
        Api::native_ui_enabled()
    }

    fn create_panel(&self) -> Result<(), String> {
        Api::create_panel()
    }

    fn hide_legacy_app_window<R: tauri::Runtime>(&self, app: &AppHandle<R>) -> Result<(), String> {
        Api::hide_legacy_app_window(app)
    }

    fn spawn_platform_loops<R: tauri::Runtime + 'static>(&self, app: AppHandle<R>) {
        Api::spawn_platform_loops(app);
    }

    fn update_snapshot<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
        snapshot: &RuntimeSnapshot,
    ) -> Result<(), String> {
        Api::update_snapshot(app, snapshot)
    }

    fn hide_panel<R: tauri::Runtime>(&self, app: &AppHandle<R>) -> Result<(), String> {
        Api::hide_panel(app)
    }

    fn refresh_from_last_snapshot<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<(), String> {
        Api::refresh_from_last_snapshot(app)
    }

    fn reposition_to_selected_display<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<(), String> {
        Api::reposition_to_selected_display(app)
    }

    fn set_shared_expanded_body_height<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
        body_height: f64,
    ) -> Result<(), String> {
        Api::set_shared_expanded_body_height(app, body_height)
    }
}

pub(crate) trait NativePanelRuntimeBackend: NativePanelPlatformRuntimeBackend {
    fn native_ui_enabled(&self) -> bool {
        NativePanelPlatformRuntimeBackend::native_ui_enabled(self)
    }

    fn create_panel(&self) -> Result<(), String> {
        NativePanelPlatformRuntimeBackend::create_panel(self)
    }

    fn hide_legacy_app_window<R: tauri::Runtime>(&self, app: &AppHandle<R>) -> Result<(), String> {
        NativePanelPlatformRuntimeBackend::hide_legacy_app_window(self, app)
    }

    fn spawn_platform_loops<R: tauri::Runtime + 'static>(&self, app: AppHandle<R>) {
        NativePanelPlatformRuntimeBackend::spawn_platform_loops(self, app);
    }

    fn update_snapshot<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
        snapshot: &RuntimeSnapshot,
    ) -> Result<(), String> {
        NativePanelPlatformRuntimeBackend::update_snapshot(self, app, snapshot)
    }

    fn hide_panel<R: tauri::Runtime>(&self, app: &AppHandle<R>) -> Result<(), String> {
        NativePanelPlatformRuntimeBackend::hide_panel(self, app)
    }

    fn refresh_from_last_snapshot<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<(), String> {
        NativePanelPlatformRuntimeBackend::refresh_from_last_snapshot(self, app)
    }

    fn reposition_to_selected_display<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<(), String> {
        NativePanelPlatformRuntimeBackend::reposition_to_selected_display(self, app)
    }

    fn set_shared_expanded_body_height<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
        body_height: f64,
    ) -> Result<(), String> {
        NativePanelPlatformRuntimeBackend::set_shared_expanded_body_height(self, app, body_height)
    }
}

impl<T> NativePanelRuntimeBackend for T where T: NativePanelPlatformRuntimeBackend {}

#[cfg(target_os = "macos")]
pub(crate) type CurrentNativePanelRuntimeBackend =
    crate::macos_native_panel::MacosNativePanelRuntimeBackendFacade;

#[cfg(target_os = "windows")]
pub(crate) type CurrentNativePanelRuntimeBackend =
    crate::windows_native_panel::WindowsNativePanelRuntimeBackendFacade;

#[cfg(not(target_os = "macos"))]
#[cfg(not(target_os = "windows"))]
pub(crate) struct CurrentNativePanelRuntimeBackend;

#[cfg(target_os = "macos")]
pub(crate) fn current_native_panel_runtime_backend() -> CurrentNativePanelRuntimeBackend {
    crate::macos_native_panel::current_macos_native_panel_runtime_backend()
}

#[cfg(target_os = "windows")]
pub(crate) fn current_native_panel_runtime_backend() -> CurrentNativePanelRuntimeBackend {
    crate::windows_native_panel::current_windows_native_panel_runtime_backend()
}

#[cfg(not(target_os = "macos"))]
#[cfg(not(target_os = "windows"))]
impl NativePanelPlatformRuntimeBackend for CurrentNativePanelRuntimeBackend {
    fn native_ui_enabled(&self) -> bool {
        false
    }

    fn create_panel(&self) -> Result<(), String> {
        Ok(())
    }

    fn hide_legacy_app_window<R: tauri::Runtime>(&self, _: &AppHandle<R>) -> Result<(), String> {
        Ok(())
    }

    fn spawn_platform_loops<R: tauri::Runtime + 'static>(&self, _: AppHandle<R>) {}

    fn update_snapshot<R: tauri::Runtime>(
        &self,
        _: &AppHandle<R>,
        _: &RuntimeSnapshot,
    ) -> Result<(), String> {
        Ok(())
    }

    fn hide_panel<R: tauri::Runtime>(&self, _: &AppHandle<R>) -> Result<(), String> {
        Ok(())
    }

    fn refresh_from_last_snapshot<R: tauri::Runtime>(
        &self,
        _: &AppHandle<R>,
    ) -> Result<(), String> {
        Ok(())
    }

    fn reposition_to_selected_display<R: tauri::Runtime>(
        &self,
        _: &AppHandle<R>,
    ) -> Result<(), String> {
        Ok(())
    }

    fn set_shared_expanded_body_height<R: tauri::Runtime>(
        &self,
        _: &AppHandle<R>,
        _: f64,
    ) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
#[cfg(not(target_os = "windows"))]
pub(crate) fn current_native_panel_runtime_backend() -> CurrentNativePanelRuntimeBackend {
    CurrentNativePanelRuntimeBackend
}
