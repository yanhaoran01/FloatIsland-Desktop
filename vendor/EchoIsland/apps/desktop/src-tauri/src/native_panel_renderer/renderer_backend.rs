use crate::{
    native_panel_core::{PanelLayout, PanelRenderState},
    native_panel_scene::{PanelRuntimeRenderState, PanelScene},
};

use super::descriptors::{
    NativePanelHostWindowDescriptor, NativePanelHostWindowState, NativePanelPointerRegion,
    NativePanelPointerRegionInput, NativePanelTimelineDescriptor,
};
use super::presentation_model::{
    NativePanelPresentationModel, NativePanelResolvedPresentation,
    resolve_native_panel_presentation, resolve_native_panel_presentation_model,
};
use super::render_commands::NativePanelRenderCommandBundle;
use super::runtime_scene_cache::{
    NativePanelRuntimeSceneCache, cache_render_command_bundle, cache_scene_runtime,
    cached_presentation_model, cached_runtime_render_state, cached_scene,
};

pub(crate) trait NativePanelCachedRendererBackend {
    type Error;

    fn scene_cache_mut(&mut self) -> &mut NativePanelRuntimeSceneCache;

    fn timeline_descriptor_slot(&mut self) -> &mut Option<NativePanelTimelineDescriptor>;

    fn host_window_descriptor_slot(&mut self) -> &mut Option<NativePanelHostWindowDescriptor>;

    fn host_window_state_slot(&mut self) -> &mut Option<NativePanelHostWindowState>;

    fn pointer_regions_slot(&mut self) -> &mut Vec<NativePanelPointerRegion>;

    fn presentation_model_slot(&mut self) -> Option<&mut Option<NativePanelPresentationModel>> {
        None
    }

    fn set_cached_visible(&mut self, _visible: bool) {}

    fn after_scene_runtime_cached(&mut self) -> Result<(), Self::Error> {
        Ok(())
    }

    fn after_timeline_descriptor_cached(
        &mut self,
        _descriptor: NativePanelTimelineDescriptor,
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    fn after_render_command_bundle_cached(
        &mut self,
        _bundle: &NativePanelRenderCommandBundle,
    ) -> Result<(), Self::Error> {
        Ok(())
    }
}

pub(crate) fn cache_scene_runtime_on_renderer<R>(
    renderer: &mut R,
    scene: &PanelScene,
    runtime: PanelRuntimeRenderState,
) -> Result<(), R::Error>
where
    R: NativePanelCachedRendererBackend,
{
    cache_scene_runtime(renderer.scene_cache_mut(), scene.clone(), runtime);
    if let Some(slot) = renderer.presentation_model_slot() {
        *slot = None;
    }
    renderer.after_scene_runtime_cached()
}

pub(crate) fn cache_timeline_descriptor_on_renderer<R>(
    renderer: &mut R,
    descriptor: NativePanelTimelineDescriptor,
) -> Result<(), R::Error>
where
    R: NativePanelCachedRendererBackend,
{
    *renderer.timeline_descriptor_slot() = Some(descriptor);
    renderer.after_timeline_descriptor_cached(descriptor)
}

pub(crate) fn cache_host_window_state_on_renderer<R>(
    renderer: &mut R,
    state: NativePanelHostWindowState,
) -> Result<(), R::Error>
where
    R: NativePanelCachedRendererBackend,
{
    *renderer.host_window_state_slot() = Some(state);
    Ok(())
}

pub(crate) fn cache_host_window_descriptor_on_renderer<R>(
    renderer: &mut R,
    descriptor: NativePanelHostWindowDescriptor,
) -> Result<(), R::Error>
where
    R: NativePanelCachedRendererBackend,
{
    *renderer.host_window_descriptor_slot() = Some(descriptor);
    Ok(())
}

pub(crate) fn cache_pointer_regions_on_renderer<R>(
    renderer: &mut R,
    regions: &[NativePanelPointerRegion],
) -> Result<(), R::Error>
where
    R: NativePanelCachedRendererBackend,
{
    *renderer.pointer_regions_slot() = regions.to_vec();
    Ok(())
}

pub(crate) fn cache_render_command_bundle_on_renderer<R>(
    renderer: &mut R,
    bundle: &NativePanelRenderCommandBundle,
) -> Result<(), R::Error>
where
    R: NativePanelCachedRendererBackend,
{
    cache_render_command_bundle(renderer.scene_cache_mut(), bundle);
    *renderer.pointer_regions_slot() = bundle.pointer_regions.clone();
    if let Some(slot) = renderer.presentation_model_slot() {
        *slot = Some(resolve_native_panel_presentation_model(bundle));
    }
    renderer.after_render_command_bundle_cached(bundle)
}

pub(crate) fn cache_resolved_presentation_on_renderer<R>(
    renderer: &mut R,
    resolved: NativePanelResolvedPresentation,
) -> Result<(), R::Error>
where
    R: NativePanelCachedRendererBackend,
{
    cache_render_command_bundle(renderer.scene_cache_mut(), &resolved.bundle);
    *renderer.pointer_regions_slot() = resolved.bundle.pointer_regions.clone();
    if let Some(slot) = renderer.presentation_model_slot() {
        *slot = Some(resolved.presentation);
    }
    renderer.after_render_command_bundle_cached(&resolved.bundle)
}

pub(crate) fn resolve_and_cache_presentation_from_scene_cache_on_renderer<R>(
    renderer: &mut R,
    layout: PanelLayout,
    render_state: PanelRenderState,
    pointer_region_input: Option<NativePanelPointerRegionInput>,
) -> Result<bool, R::Error>
where
    R: NativePanelCachedRendererBackend,
{
    let (scene, runtime) = {
        let cache = renderer.scene_cache_mut();
        (
            cached_scene(cache),
            cached_runtime_render_state(cache).unwrap_or_default(),
        )
    };
    let Some(scene) = scene else {
        return Ok(false);
    };
    let resolved = resolve_native_panel_presentation(
        layout,
        &scene,
        runtime,
        render_state,
        pointer_region_input,
    );
    cache_resolved_presentation_on_renderer(renderer, resolved)?;
    Ok(true)
}

pub(crate) fn sync_cached_presentation_model_slot(
    slot: &mut Option<NativePanelPresentationModel>,
    cache: &NativePanelRuntimeSceneCache,
) {
    *slot = cached_presentation_model(cache);
}

pub(crate) fn resolve_cached_presentation_model(
    slot: Option<&NativePanelPresentationModel>,
    cache: &NativePanelRuntimeSceneCache,
) -> Option<NativePanelPresentationModel> {
    slot.cloned().or_else(|| cached_presentation_model(cache))
}

pub(crate) fn native_panel_presentation_cards_visible(
    primary: Option<&NativePanelPresentationModel>,
    fallback: Option<&NativePanelPresentationModel>,
) -> bool {
    primary
        .or(fallback)
        .is_some_and(NativePanelPresentationModel::card_stack_visible)
}

pub(crate) fn sync_cached_visibility_on_renderer<R>(
    renderer: &mut R,
    visible: bool,
) -> Result<(), R::Error>
where
    R: NativePanelCachedRendererBackend,
{
    renderer.set_cached_visible(visible);
    Ok(())
}
