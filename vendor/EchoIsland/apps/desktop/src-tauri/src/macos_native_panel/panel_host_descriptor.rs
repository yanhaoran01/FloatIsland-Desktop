use objc2_foundation::NSRect;

use crate::native_panel_renderer::facade::descriptor::{
    NativePanelHostWindowDescriptor, NativePanelTimelineDescriptor,
    native_panel_host_window_descriptor as shared_native_panel_host_window_descriptor,
};

pub(super) fn native_panel_host_window_descriptor(
    visible: bool,
    preferred_display_index: usize,
    screen_frame: Option<NSRect>,
    shared_body_height: Option<f64>,
    timeline: Option<NativePanelTimelineDescriptor>,
) -> NativePanelHostWindowDescriptor {
    shared_native_panel_host_window_descriptor(
        visible,
        preferred_display_index,
        screen_frame.map(ns_rect_to_panel_rect),
        shared_body_height,
        timeline,
    )
}

fn ns_rect_to_panel_rect(rect: NSRect) -> crate::native_panel_core::PanelRect {
    crate::native_panel_core::PanelRect {
        x: rect.origin.x,
        y: rect.origin.y,
        width: rect.size.width,
        height: rect.size.height,
    }
}
