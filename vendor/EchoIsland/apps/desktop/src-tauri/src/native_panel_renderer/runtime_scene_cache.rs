use echoisland_runtime::RuntimeSnapshot;

use crate::{
    native_panel_core::{ExpandedSurface, PanelLayout, PanelRect, PanelRenderState, PanelState},
    native_panel_scene::{
        PanelRuntimeRenderState, PanelRuntimeSceneBundle, PanelScene, PanelSceneBuildInput,
        build_panel_scene, resolve_panel_runtime_render_state,
    },
};

use super::descriptors::{
    NativePanelPointerRegion, NativePanelPointerRegionInput, NativePanelRuntimeInputDescriptor,
};
use super::host_runtime_facade::{
    native_panel_host_display_reposition,
    native_panel_host_display_reposition_from_input_descriptor,
};
use super::presentation_model::{
    NativePanelPresentationModel, NativePanelResolvedPresentation, NativePanelSnapshotRenderPlan,
    resolve_native_panel_presentation, resolve_native_panel_presentation_model_for_scene,
    resolve_native_panel_snapshot_render_plan_for_scene,
};
use super::render_commands::NativePanelRenderCommandBundle;
use super::runtime_interaction::NativePanelCoreStateBridge;
use super::traits::NativePanelSceneHost;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct NativePanelRuntimeSceneCacheKey {
    pub(crate) expanded: bool,
    pub(crate) transitioning: bool,
    pub(crate) surface_mode: ExpandedSurface,
    pub(crate) scene_input: PanelSceneBuildInput,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct NativePanelRuntimeSceneCache {
    pub(crate) last_snapshot: Option<RuntimeSnapshot>,
    pub(crate) last_cache_key: Option<NativePanelRuntimeSceneCacheKey>,
    pub(crate) last_scene: Option<PanelScene>,
    pub(crate) last_runtime_render_state: Option<PanelRuntimeRenderState>,
    pub(crate) last_render_command_bundle: Option<NativePanelRenderCommandBundle>,
}

pub(crate) trait NativePanelRuntimeSceneStateBridge: NativePanelCoreStateBridge {
    fn runtime_scene_cache(&self) -> &NativePanelRuntimeSceneCache;

    fn runtime_scene_current_snapshot(&self) -> Option<&RuntimeSnapshot>;
}

pub(crate) trait NativePanelRuntimeSceneMutableStateBridge:
    NativePanelRuntimeSceneStateBridge
{
    fn runtime_scene_cache_mut(&mut self) -> &mut NativePanelRuntimeSceneCache;

    fn runtime_pointer_regions_mut(&mut self) -> &mut Vec<NativePanelPointerRegion>;
}

pub(crate) fn native_panel_runtime_scene_cache_key(
    panel_state: &PanelState,
    input: &NativePanelRuntimeInputDescriptor,
) -> NativePanelRuntimeSceneCacheKey {
    NativePanelRuntimeSceneCacheKey {
        expanded: panel_state.expanded,
        transitioning: panel_state.transitioning,
        surface_mode: panel_state.surface_mode,
        scene_input: input.scene_input.clone(),
    }
}

pub(crate) fn native_panel_runtime_scene_cache_key_for_state_bridge<S>(
    state: &S,
    input: &NativePanelRuntimeInputDescriptor,
) -> NativePanelRuntimeSceneCacheKey
where
    S: NativePanelCoreStateBridge,
{
    native_panel_runtime_scene_cache_key(&state.snapshot_core_panel_state(), input)
}

pub(crate) fn build_native_panel_scene_for_state_bridge_with_input<S>(
    state: &S,
    snapshot: &RuntimeSnapshot,
    input: &NativePanelRuntimeInputDescriptor,
) -> PanelScene
where
    S: NativePanelCoreStateBridge,
{
    build_panel_scene(
        &state.snapshot_core_panel_state(),
        snapshot,
        &input.scene_input,
    )
}

pub(crate) fn resolve_native_panel_runtime_render_state_for_state_bridge_with_input<S>(
    state: &S,
    input: &NativePanelRuntimeInputDescriptor,
) -> PanelRuntimeRenderState
where
    S: NativePanelRuntimeSceneStateBridge,
{
    let cache_key = native_panel_runtime_scene_cache_key_for_state_bridge(state, input);
    cached_runtime_render_state_for_key(state.runtime_scene_cache(), &cache_key).unwrap_or_else(
        || {
            resolve_panel_runtime_render_state(
                &state.snapshot_core_panel_state(),
                state.runtime_scene_current_snapshot(),
                &input.scene_input,
            )
        },
    )
}

fn runtime_scene_snapshot_matches_state_or_cache<S>(state: &S, snapshot: &RuntimeSnapshot) -> bool
where
    S: NativePanelRuntimeSceneStateBridge,
{
    state.runtime_scene_current_snapshot() == Some(snapshot)
        || state.runtime_scene_cache().last_snapshot.as_ref() == Some(snapshot)
}

pub(crate) fn resolve_native_panel_scene_for_state_bridge_with_input<S>(
    state: &S,
    input: &NativePanelRuntimeInputDescriptor,
) -> Option<PanelScene>
where
    S: NativePanelRuntimeSceneStateBridge,
{
    let cache_key = native_panel_runtime_scene_cache_key_for_state_bridge(state, input);
    cached_scene_for_key(state.runtime_scene_cache(), &cache_key).or_else(|| {
        state.runtime_scene_current_snapshot().map(|snapshot| {
            build_native_panel_scene_for_state_bridge_with_input(state, snapshot, input)
        })
    })
}

pub(crate) fn resolve_native_panel_scene_for_state_bridge_and_snapshot_with_input<S>(
    state: &S,
    snapshot: &RuntimeSnapshot,
    input: &NativePanelRuntimeInputDescriptor,
) -> Option<PanelScene>
where
    S: NativePanelRuntimeSceneStateBridge,
{
    let cache_key = native_panel_runtime_scene_cache_key_for_state_bridge(state, input);
    if runtime_scene_snapshot_matches_state_or_cache(state, snapshot)
        && let Some(scene) = cached_scene_for_key(state.runtime_scene_cache(), &cache_key)
    {
        return Some(scene);
    }

    Some(build_native_panel_scene_for_state_bridge_with_input(
        state, snapshot, input,
    ))
}

pub(crate) fn resolve_native_panel_render_command_bundle_for_state_bridge_and_snapshot_with_input<
    S,
>(
    state: &S,
    snapshot: &RuntimeSnapshot,
    input: &NativePanelRuntimeInputDescriptor,
) -> Option<NativePanelRenderCommandBundle>
where
    S: NativePanelRuntimeSceneStateBridge,
{
    let cache_key = native_panel_runtime_scene_cache_key_for_state_bridge(state, input);
    runtime_scene_snapshot_matches_state_or_cache(state, snapshot)
        .then(|| cached_render_command_bundle_for_key(state.runtime_scene_cache(), &cache_key))
        .flatten()
}

pub(crate) fn resolve_current_native_panel_render_command_bundle_for_state_bridge_with_input<S>(
    state: &S,
    input: &NativePanelRuntimeInputDescriptor,
) -> Option<NativePanelRenderCommandBundle>
where
    S: NativePanelRuntimeSceneStateBridge,
{
    state.runtime_scene_current_snapshot().and_then(|snapshot| {
        resolve_native_panel_render_command_bundle_for_state_bridge_and_snapshot_with_input(
            state, snapshot, input,
        )
    })
}

pub(crate) fn resolve_native_panel_presentation_model_for_state_bridge_and_snapshot_with_input<S>(
    state: &S,
    snapshot: &RuntimeSnapshot,
    input: &NativePanelRuntimeInputDescriptor,
) -> Option<NativePanelPresentationModel>
where
    S: NativePanelRuntimeSceneStateBridge,
{
    let cache_key = native_panel_runtime_scene_cache_key_for_state_bridge(state, input);

    if runtime_scene_snapshot_matches_state_or_cache(state, snapshot)
        && let Some(model) =
            cached_presentation_model_for_key(state.runtime_scene_cache(), &cache_key)
    {
        return Some(model);
    }

    let render_command_bundle =
        resolve_native_panel_render_command_bundle_for_state_bridge_and_snapshot_with_input(
            state, snapshot, input,
        );
    let scene = render_command_bundle
        .as_ref()
        .map(|bundle| bundle.scene.clone())
        .or_else(|| {
            resolve_native_panel_scene_for_state_bridge_and_snapshot_with_input(
                state, snapshot, input,
            )
        })?;
    Some(resolve_native_panel_presentation_model_for_scene(
        &scene,
        render_command_bundle.as_ref(),
    ))
}

pub(crate) fn resolve_current_native_panel_presentation_model_for_state_bridge_with_input<S>(
    state: &S,
    input: &NativePanelRuntimeInputDescriptor,
) -> Option<NativePanelPresentationModel>
where
    S: NativePanelRuntimeSceneStateBridge,
{
    state.runtime_scene_current_snapshot().and_then(|snapshot| {
        resolve_native_panel_presentation_model_for_state_bridge_and_snapshot_with_input(
            state, snapshot, input,
        )
    })
}

pub(crate) fn resolve_and_cache_native_panel_presentation_for_state_bridge_with_input<S>(
    state: &mut S,
    input: &NativePanelRuntimeInputDescriptor,
    layout: PanelLayout,
    render_state: PanelRenderState,
    pointer_region_input: Option<NativePanelPointerRegionInput>,
) -> Option<NativePanelResolvedPresentation>
where
    S: NativePanelRuntimeSceneMutableStateBridge,
{
    let scene = resolve_native_panel_scene_for_state_bridge_with_input(state, input)?;
    let runtime =
        resolve_native_panel_runtime_render_state_for_state_bridge_with_input(state, input);
    let resolved = resolve_native_panel_presentation(
        layout,
        &scene,
        runtime,
        render_state,
        pointer_region_input,
    );
    cache_render_command_bundle_for_state_bridge_with_input(state, input, &resolved.bundle);
    Some(resolved)
}

pub(crate) fn resolve_native_panel_snapshot_render_plan_for_state_bridge_snapshot_with_input<S>(
    state: &S,
    snapshot: &RuntimeSnapshot,
    input: &NativePanelRuntimeInputDescriptor,
) -> NativePanelSnapshotRenderPlan
where
    S: NativePanelRuntimeSceneStateBridge,
{
    let render_command_bundle =
        resolve_native_panel_render_command_bundle_for_state_bridge_and_snapshot_with_input(
            state, snapshot, input,
        );
    let scene = render_command_bundle
        .as_ref()
        .map(|bundle| bundle.scene.clone())
        .or_else(|| {
            resolve_native_panel_scene_for_state_bridge_and_snapshot_with_input(
                state, snapshot, input,
            )
        })
        .expect("scene");
    resolve_native_panel_snapshot_render_plan_for_scene(scene, render_command_bundle)
}

pub(crate) fn cache_runtime_scene(
    cache: &mut NativePanelRuntimeSceneCache,
    snapshot: RuntimeSnapshot,
    scene: PanelScene,
    runtime_render_state: PanelRuntimeRenderState,
) {
    cache_runtime_scene_with_key(cache, snapshot, None, scene, runtime_render_state);
}

pub(crate) fn cache_runtime_scene_with_key(
    cache: &mut NativePanelRuntimeSceneCache,
    snapshot: RuntimeSnapshot,
    cache_key: Option<NativePanelRuntimeSceneCacheKey>,
    scene: PanelScene,
    runtime_render_state: PanelRuntimeRenderState,
) {
    cache.last_snapshot = Some(snapshot);
    cache_scene_runtime_with_key(cache, cache_key, scene, runtime_render_state);
}

pub(crate) fn cache_scene_runtime(
    cache: &mut NativePanelRuntimeSceneCache,
    scene: PanelScene,
    runtime_render_state: PanelRuntimeRenderState,
) {
    cache_scene_runtime_with_key(cache, None, scene, runtime_render_state);
}

pub(crate) fn cache_scene_runtime_with_key(
    cache: &mut NativePanelRuntimeSceneCache,
    cache_key: Option<NativePanelRuntimeSceneCacheKey>,
    scene: PanelScene,
    runtime_render_state: PanelRuntimeRenderState,
) {
    cache.last_cache_key = cache_key;
    cache.last_scene = Some(scene);
    cache.last_runtime_render_state = Some(runtime_render_state);
    cache.last_render_command_bundle = None;
}

pub(crate) fn cache_render_command_bundle(
    cache: &mut NativePanelRuntimeSceneCache,
    bundle: &NativePanelRenderCommandBundle,
) {
    cache_render_command_bundle_with_key(cache, None, bundle);
}

pub(crate) fn cache_render_command_bundle_with_key(
    cache: &mut NativePanelRuntimeSceneCache,
    cache_key: Option<NativePanelRuntimeSceneCacheKey>,
    bundle: &NativePanelRenderCommandBundle,
) {
    cache_scene_runtime_with_key(cache, cache_key, bundle.scene.clone(), bundle.runtime);
    cache.last_render_command_bundle = Some(bundle.clone());
}

pub(crate) fn cache_render_command_bundle_for_state_bridge_with_input<S>(
    state: &mut S,
    input: &NativePanelRuntimeInputDescriptor,
    bundle: &NativePanelRenderCommandBundle,
) where
    S: NativePanelRuntimeSceneMutableStateBridge,
{
    let cache_key = native_panel_runtime_scene_cache_key_for_state_bridge(state, input);
    let snapshot = state.runtime_scene_current_snapshot().cloned();
    cache_render_command_bundle_with_key(state.runtime_scene_cache_mut(), Some(cache_key), bundle);
    if let Some(snapshot) = snapshot {
        state.runtime_scene_cache_mut().last_snapshot = Some(snapshot);
    }
    *state.runtime_pointer_regions_mut() = bundle.pointer_regions.clone();
}

pub(crate) fn cached_scene(cache: &NativePanelRuntimeSceneCache) -> Option<PanelScene> {
    cache
        .last_render_command_bundle
        .as_ref()
        .map(|bundle| bundle.scene.clone())
        .or_else(|| cache.last_scene.clone())
}

pub(crate) fn cached_runtime_render_state(
    cache: &NativePanelRuntimeSceneCache,
) -> Option<PanelRuntimeRenderState> {
    cache
        .last_render_command_bundle
        .as_ref()
        .map(|bundle| bundle.runtime)
        .or(cache.last_runtime_render_state)
}

pub(crate) fn cached_scene_for_key(
    cache: &NativePanelRuntimeSceneCache,
    cache_key: &NativePanelRuntimeSceneCacheKey,
) -> Option<PanelScene> {
    (cache.last_cache_key.as_ref() == Some(cache_key))
        .then(|| cached_scene(cache))
        .flatten()
}

pub(crate) fn cached_runtime_render_state_for_key(
    cache: &NativePanelRuntimeSceneCache,
    cache_key: &NativePanelRuntimeSceneCacheKey,
) -> Option<PanelRuntimeRenderState> {
    (cache.last_cache_key.as_ref() == Some(cache_key))
        .then(|| cached_runtime_render_state(cache))
        .flatten()
}

pub(crate) fn cached_render_command_bundle_for_key(
    cache: &NativePanelRuntimeSceneCache,
    cache_key: &NativePanelRuntimeSceneCacheKey,
) -> Option<NativePanelRenderCommandBundle> {
    (cache.last_cache_key.as_ref() == Some(cache_key))
        .then(|| cache.last_render_command_bundle.clone())
        .flatten()
}

pub(crate) fn cached_presentation_model(
    cache: &NativePanelRuntimeSceneCache,
) -> Option<NativePanelPresentationModel> {
    cache.last_scene.as_ref().map(|scene| {
        resolve_native_panel_presentation_model_for_scene(
            scene,
            cache.last_render_command_bundle.as_ref(),
        )
    })
}

pub(crate) fn cached_presentation_model_for_key(
    cache: &NativePanelRuntimeSceneCache,
    cache_key: &NativePanelRuntimeSceneCacheKey,
) -> Option<NativePanelPresentationModel> {
    (cache.last_cache_key.as_ref() == Some(cache_key))
        .then(|| cached_presentation_model(cache))
        .flatten()
}

pub(crate) fn apply_runtime_scene_bundle_to_host<H: NativePanelSceneHost>(
    host: &mut H,
    cache: &mut NativePanelRuntimeSceneCache,
    bundle: PanelRuntimeSceneBundle,
    preferred_display_index: usize,
    screen_frame: Option<PanelRect>,
) -> Result<(), H::Error> {
    host.sync_scene_with_payload(
        &bundle.scene,
        bundle.runtime_render_state,
        native_panel_host_display_reposition(preferred_display_index, screen_frame),
    )?;
    cache_runtime_scene(
        cache,
        bundle.displayed_snapshot,
        bundle.scene,
        bundle.runtime_render_state,
    );
    Ok(())
}

pub(crate) fn rerender_runtime_scene_cache_to_host<H: NativePanelSceneHost>(
    host: &mut H,
    cache: &mut NativePanelRuntimeSceneCache,
    preferred_display_index: usize,
    screen_frame: Option<PanelRect>,
    rebuild_bundle: impl FnOnce(&RuntimeSnapshot) -> PanelRuntimeSceneBundle,
) -> Result<bool, H::Error> {
    let Some(snapshot) = cache.last_snapshot.clone() else {
        return Ok(false);
    };
    let bundle = rebuild_bundle(&snapshot);
    apply_runtime_scene_bundle_to_host(host, cache, bundle, preferred_display_index, screen_frame)?;
    Ok(true)
}

pub(crate) fn rerender_runtime_scene_cache_to_host_with_input_descriptor<
    H: NativePanelSceneHost,
>(
    host: &mut H,
    cache: &mut NativePanelRuntimeSceneCache,
    input: &NativePanelRuntimeInputDescriptor,
    rebuild_bundle: impl FnOnce(&RuntimeSnapshot) -> PanelRuntimeSceneBundle,
) -> Result<bool, H::Error> {
    let Some(snapshot) = cache.last_snapshot.clone() else {
        return Ok(false);
    };
    let bundle = rebuild_bundle(&snapshot);
    host.sync_scene_with_payload(
        &bundle.scene,
        bundle.runtime_render_state,
        native_panel_host_display_reposition_from_input_descriptor(input),
    )?;
    cache_runtime_scene(
        cache,
        bundle.displayed_snapshot,
        bundle.scene,
        bundle.runtime_render_state,
    );
    Ok(true)
}

pub(crate) fn rerender_runtime_scene_cache_to_host_on_transition<H, T>(
    host: &mut H,
    cache: &mut NativePanelRuntimeSceneCache,
    transition: Option<T>,
    preferred_display_index: usize,
    screen_frame: Option<PanelRect>,
    rebuild_bundle: impl FnOnce(&RuntimeSnapshot) -> PanelRuntimeSceneBundle,
) -> Result<Option<T>, H::Error>
where
    H: NativePanelSceneHost,
{
    if transition.is_some() {
        rerender_runtime_scene_cache_to_host(
            host,
            cache,
            preferred_display_index,
            screen_frame,
            rebuild_bundle,
        )?;
    }
    Ok(transition)
}

pub(crate) fn rerender_runtime_scene_cache_to_host_on_transition_with_input_descriptor<H, T>(
    host: &mut H,
    cache: &mut NativePanelRuntimeSceneCache,
    transition: Option<T>,
    input: &NativePanelRuntimeInputDescriptor,
    rebuild_bundle: impl FnOnce(&RuntimeSnapshot) -> PanelRuntimeSceneBundle,
) -> Result<Option<T>, H::Error>
where
    H: NativePanelSceneHost,
{
    if transition.is_some() {
        let _ = rerender_runtime_scene_cache_to_host_with_input_descriptor(
            host,
            cache,
            input,
            rebuild_bundle,
        )?;
    }
    Ok(transition)
}
