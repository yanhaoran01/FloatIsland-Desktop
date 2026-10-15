use crate::{
    native_panel_core::{PanelAnimationDescriptor, PanelRect, resolve_native_panel_host_frame},
    native_panel_renderer::facade::{
        descriptor::{
            NativePanelComputedHostWindow, NativePanelHostWindowDescriptor,
            NativePanelHostWindowState, NativePanelPointerRegion, NativePanelTimelineDescriptor,
        },
        presentation::NativePanelPresentationModel,
    },
};

const FALLBACK_SCREEN_FRAME: PanelRect = PanelRect {
    x: 0.0,
    y: 0.0,
    width: 1440.0,
    height: 900.0,
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) enum WindowsNativePanelWindowLifecycle {
    #[default]
    NotCreated,
    Created,
}

#[derive(Clone, Debug, Default)]
pub(super) struct WindowsNativePanelHostWindow {
    pub(super) lifecycle: WindowsNativePanelWindowLifecycle,
    pub(super) descriptor: NativePanelHostWindowDescriptor,
    pub(super) last_frame: Option<PanelRect>,
    pub(super) presented_window_state: Option<NativePanelHostWindowState>,
    pub(super) presented_pointer_regions: Vec<NativePanelPointerRegion>,
    pub(super) presented_presentation_model: Option<NativePanelPresentationModel>,
    pub(super) pending_redraw: bool,
}

#[derive(Clone, Debug)]
pub(super) struct WindowsNativePanelDrawFrame {
    pub(super) window_state: NativePanelHostWindowState,
    pub(super) pointer_regions: Vec<NativePanelPointerRegion>,
    pub(super) presentation_model: Option<NativePanelPresentationModel>,
}

impl WindowsNativePanelHostWindow {
    pub(super) fn create(&mut self) {
        self.host_window_create();
    }

    pub(super) fn show(&mut self) {
        self.host_window_show();
    }

    pub(super) fn hide(&mut self) {
        self.host_window_hide();
    }

    pub(super) fn reposition_to_display(
        &mut self,
        preferred_display_index: usize,
        screen_frame: Option<PanelRect>,
    ) {
        self.host_window_reposition_to_display(preferred_display_index, screen_frame);
    }

    pub(super) fn set_shared_body_height(&mut self, body_height: f64) {
        self.host_window_set_shared_body_height(body_height);
    }

    pub(super) fn apply_timeline_descriptor(&mut self, descriptor: NativePanelTimelineDescriptor) {
        self.host_window_apply_timeline_descriptor(descriptor);
    }

    pub(super) fn refresh_frame_from_descriptor(&mut self) {
        self.refresh_host_window_frame_from_descriptor();
    }

    pub(super) fn window_state(&self) -> NativePanelHostWindowState {
        self.computed_host_window_state()
    }

    pub(super) fn present(
        &mut self,
        window_state: NativePanelHostWindowState,
        pointer_regions: &[NativePanelPointerRegion],
        presentation_model: Option<NativePanelPresentationModel>,
    ) {
        self.presented_window_state = Some(window_state);
        self.presented_pointer_regions = windows_client_pointer_regions(
            window_state.frame,
            self.descriptor.screen_frame,
            pointer_regions,
        );
        self.presented_presentation_model = presentation_model;
        self.pending_redraw = true;
    }

    pub(super) fn take_pending_draw_frame(&mut self) -> Option<WindowsNativePanelDrawFrame> {
        if !self.pending_redraw {
            return None;
        }
        self.pending_redraw = false;
        self.presented_window_state
            .map(|window_state| WindowsNativePanelDrawFrame {
                window_state,
                pointer_regions: self.presented_pointer_regions.clone(),
                presentation_model: self.presented_presentation_model.clone(),
            })
    }

    pub(super) fn pointer_regions<'a>(
        &'a self,
        fallback: &'a [NativePanelPointerRegion],
    ) -> &'a [NativePanelPointerRegion] {
        if self.presented_pointer_regions.is_empty() {
            fallback
        } else {
            &self.presented_pointer_regions
        }
    }
}

fn windows_client_pointer_regions(
    panel_frame: Option<PanelRect>,
    screen_frame: Option<PanelRect>,
    regions: &[NativePanelPointerRegion],
) -> Vec<NativePanelPointerRegion> {
    let Some(panel_frame) = panel_frame else {
        return regions.to_vec();
    };
    let shared_panel_frame = windows_shared_pointer_region_panel_frame(panel_frame, screen_frame);

    regions
        .iter()
        .map(|region| NativePanelPointerRegion {
            frame: windows_client_pointer_region_frame(shared_panel_frame, region.frame),
            kind: region.kind.clone(),
        })
        .collect()
}

fn windows_shared_pointer_region_panel_frame(
    panel_frame: PanelRect,
    screen_frame: Option<PanelRect>,
) -> PanelRect {
    let Some(screen_frame) = screen_frame else {
        return panel_frame;
    };
    PanelRect {
        y: screen_frame.y + screen_frame.height - panel_frame.height,
        ..panel_frame
    }
}

fn windows_client_pointer_region_frame(panel_frame: PanelRect, frame: PanelRect) -> PanelRect {
    let local_x = frame.x - panel_frame.x;
    let local_bottom_y = frame.y - panel_frame.y;
    PanelRect {
        x: local_x,
        y: panel_frame.height - local_bottom_y - frame.height,
        width: frame.width,
        height: frame.height,
    }
}

impl NativePanelComputedHostWindow for WindowsNativePanelHostWindow {
    fn host_window_descriptor(&self) -> NativePanelHostWindowDescriptor {
        self.descriptor
    }

    fn host_window_descriptor_mut(&mut self) -> &mut NativePanelHostWindowDescriptor {
        &mut self.descriptor
    }

    fn host_window_last_frame_mut(&mut self) -> &mut Option<PanelRect> {
        &mut self.last_frame
    }

    fn host_window_frame(&self) -> Option<PanelRect> {
        self.last_frame
    }

    fn set_host_window_created(&mut self) {
        self.lifecycle = WindowsNativePanelWindowLifecycle::Created;
    }

    fn fallback_screen_frame(&self) -> PanelRect {
        FALLBACK_SCREEN_FRAME
    }

    fn compact_width(&self) -> f64 {
        crate::native_panel_core::island_width_spec(
            crate::app_settings::current_app_settings().island_width_preset,
        )
        .canvas_width
    }

    fn expanded_width(&self) -> f64 {
        crate::native_panel_core::island_width_spec(
            crate::app_settings::current_app_settings().island_width_preset,
        )
        .canvas_width
    }

    fn refresh_host_window_frame_from_descriptor(&mut self) {
        let Some(animation) = self.descriptor.animation_descriptor() else {
            return;
        };
        self.last_frame = Some(resolve_windows_panel_window_frame(
            animation,
            self.descriptor
                .screen_frame
                .unwrap_or(FALLBACK_SCREEN_FRAME),
            self.compact_width(),
            self.expanded_width(),
        ));
    }
}

pub(super) fn resolve_windows_panel_window_frame(
    descriptor: PanelAnimationDescriptor,
    screen_frame: PanelRect,
    compact_width: f64,
    expanded_width: f64,
) -> PanelRect {
    let host_compact_width =
        compact_width.max(crate::native_panel_core::DEFAULT_PANEL_CANVAS_WIDTH);
    let host_expanded_width =
        expanded_width.max(crate::native_panel_core::DEFAULT_PANEL_CANVAS_WIDTH);
    let mut frame = resolve_native_panel_host_frame(
        descriptor,
        screen_frame,
        host_compact_width,
        host_expanded_width,
    );
    // Shared native layout uses AppKit's bottom-left coordinate semantics.
    // Windows screen coordinates are top-left, so top alignment is the
    // monitor frame's y origin rather than maxY - height.
    frame.y = screen_frame.y.round();
    frame
}
