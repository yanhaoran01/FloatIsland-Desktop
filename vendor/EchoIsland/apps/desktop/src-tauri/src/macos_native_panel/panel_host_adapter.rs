use crate::{
    native_panel_core::{DEFAULT_COMPACT_PILL_WIDTH, DEFAULT_EXPANDED_PILL_WIDTH, PanelRect},
    native_panel_renderer::facade::{
        command::NativePanelPlatformEvent,
        descriptor::{
            NativePanelHostWindowDescriptor, NativePanelHostWindowState, NativePanelPointerRegion,
            NativePanelTimelineDescriptor, native_panel_host_window_frame,
        },
        host::NativePanelHost,
        presentation::NativePanelPresentationModel,
        renderer::{
            NativePanelCachedRendererBackend, NativePanelRenderCommandBundle, NativePanelRenderer,
            NativePanelRuntimeSceneCache, cache_host_window_descriptor_on_renderer,
            cache_host_window_state_on_renderer, cache_pointer_regions_on_renderer,
            cache_render_command_bundle_on_renderer, cache_scene_runtime_on_renderer,
            cache_timeline_descriptor_on_renderer, sync_cached_presentation_model_slot,
            sync_cached_visibility_on_renderer,
        },
    },
    native_panel_scene::{PanelRuntimeRenderState, PanelScene},
};

use super::panel_types::NativePanelState;
use objc2_foundation::NSRect;

#[derive(Default)]
pub(super) struct MacosNativePanelRendererAdapter {
    pub(super) scene_cache: NativePanelRuntimeSceneCache,
    pub(super) last_timeline_descriptor: Option<NativePanelTimelineDescriptor>,
    pub(super) last_host_window_descriptor: Option<NativePanelHostWindowDescriptor>,
    pub(super) last_host_window_state: Option<NativePanelHostWindowState>,
    pub(super) last_pointer_regions: Vec<NativePanelPointerRegion>,
    pub(super) last_presentation_model: Option<NativePanelPresentationModel>,
    pub(super) visible: bool,
}

impl NativePanelCachedRendererBackend for MacosNativePanelRendererAdapter {
    type Error = String;

    fn scene_cache_mut(&mut self) -> &mut NativePanelRuntimeSceneCache {
        &mut self.scene_cache
    }

    fn timeline_descriptor_slot(&mut self) -> &mut Option<NativePanelTimelineDescriptor> {
        &mut self.last_timeline_descriptor
    }

    fn host_window_descriptor_slot(&mut self) -> &mut Option<NativePanelHostWindowDescriptor> {
        &mut self.last_host_window_descriptor
    }

    fn host_window_state_slot(&mut self) -> &mut Option<NativePanelHostWindowState> {
        &mut self.last_host_window_state
    }

    fn pointer_regions_slot(&mut self) -> &mut Vec<NativePanelPointerRegion> {
        &mut self.last_pointer_regions
    }

    fn presentation_model_slot(&mut self) -> Option<&mut Option<NativePanelPresentationModel>> {
        Some(&mut self.last_presentation_model)
    }

    fn set_cached_visible(&mut self, visible: bool) {
        self.visible = visible;
    }
}

impl NativePanelRenderer for MacosNativePanelRendererAdapter {
    type Error = String;

    fn render_scene(
        &mut self,
        scene: &PanelScene,
        runtime: PanelRuntimeRenderState,
    ) -> Result<(), Self::Error> {
        cache_scene_runtime_on_renderer(self, scene, runtime)
    }

    fn apply_timeline_descriptor(
        &mut self,
        descriptor: NativePanelTimelineDescriptor,
    ) -> Result<(), Self::Error> {
        cache_timeline_descriptor_on_renderer(self, descriptor)
    }

    fn sync_host_window_state(
        &mut self,
        state: NativePanelHostWindowState,
    ) -> Result<(), Self::Error> {
        cache_host_window_state_on_renderer(self, state)
    }

    fn sync_shared_body_height(
        &mut self,
        _shared_body_height: Option<f64>,
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    fn record_host_window_descriptor(
        &mut self,
        descriptor: NativePanelHostWindowDescriptor,
    ) -> Result<(), Self::Error> {
        cache_host_window_descriptor_on_renderer(self, descriptor)
    }

    fn sync_pointer_regions(
        &mut self,
        regions: &[NativePanelPointerRegion],
    ) -> Result<(), Self::Error> {
        cache_pointer_regions_on_renderer(self, regions)
    }

    fn record_render_command_bundle(
        &mut self,
        bundle: &NativePanelRenderCommandBundle,
    ) -> Result<(), Self::Error> {
        cache_render_command_bundle_on_renderer(self, bundle)
    }

    fn set_visible(&mut self, visible: bool) -> Result<(), Self::Error> {
        sync_cached_visibility_on_renderer(self, visible)
    }
}

#[derive(Default)]
pub(super) struct MacosNativePanelHostAdapter {
    pub(super) renderer: MacosNativePanelRendererAdapter,
    pub(super) descriptor: NativePanelHostWindowDescriptor,
    pub(super) frame: Option<PanelRect>,
    pending_events: Vec<NativePanelPlatformEvent>,
}

impl NativePanelHost for MacosNativePanelHostAdapter {
    type Error = String;
    type Renderer = MacosNativePanelRendererAdapter;

    fn renderer(&mut self) -> &mut Self::Renderer {
        &mut self.renderer
    }

    fn host_window_descriptor(&self) -> NativePanelHostWindowDescriptor {
        self.descriptor
    }

    fn host_window_descriptor_mut(&mut self) -> &mut NativePanelHostWindowDescriptor {
        &mut self.descriptor
    }

    fn window_state(&self) -> NativePanelHostWindowState {
        self.descriptor
            .window_state(self.resolved_window_frame().or(self.frame))
    }

    fn show(&mut self) -> Result<(), Self::Error> {
        self.descriptor.visible = true;
        self.sync_renderer_host_window_descriptor()
    }

    fn hide(&mut self) -> Result<(), Self::Error> {
        self.descriptor.visible = false;
        self.sync_renderer_host_window_descriptor()
    }

    fn take_platform_events(&mut self) -> Vec<NativePanelPlatformEvent> {
        std::mem::take(&mut self.pending_events)
    }
}

#[allow(dead_code)]
impl MacosNativePanelHostAdapter {
    pub(super) fn sync_from_native_panel_state(
        &mut self,
        state: &NativePanelState,
        frame: Option<NSRect>,
    ) {
        self.descriptor = state.host_window_descriptor;
        self.frame = frame.map(ns_rect_to_panel_rect);
        self.renderer.scene_cache = state.scene_cache.clone();
        if self.renderer.scene_cache.last_snapshot.is_none() {
            self.renderer.scene_cache.last_snapshot = state.last_snapshot.clone();
        }
        sync_cached_presentation_model_slot(
            &mut self.renderer.last_presentation_model,
            &self.renderer.scene_cache,
        );
    }

    fn resolved_window_frame(&self) -> Option<PanelRect> {
        native_panel_host_window_frame(
            self.descriptor,
            self.descriptor.screen_frame?,
            DEFAULT_COMPACT_PILL_WIDTH,
            DEFAULT_EXPANDED_PILL_WIDTH,
        )
    }
}

#[allow(dead_code)]
pub(super) fn ns_rect_to_panel_rect(rect: NSRect) -> PanelRect {
    PanelRect {
        x: rect.origin.x,
        y: rect.origin.y,
        width: rect.size.width,
        height: rect.size.height,
    }
}
