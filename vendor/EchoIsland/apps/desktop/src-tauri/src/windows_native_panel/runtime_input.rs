use tauri::AppHandle;

use crate::{
    app_settings::current_app_settings,
    display_settings::{display_options_from_monitors, panel_rect_from_monitor},
    native_panel_renderer::facade::descriptor::NativePanelRuntimeInputDescriptor,
    native_panel_scene_input::native_panel_runtime_input_descriptor_from_display_options_with_screen_frame,
};

pub(super) fn windows_runtime_input_descriptor<R: tauri::Runtime>(
    app: &AppHandle<R>,
) -> NativePanelRuntimeInputDescriptor {
    let settings = current_app_settings();
    let monitors = app.available_monitors().unwrap_or_default();
    let displays = display_options_from_monitors(&monitors);
    let mut descriptor =
        native_panel_runtime_input_descriptor_from_display_options_with_screen_frame(
            &displays,
            &settings,
            Some(0),
            |selected_display_index| {
                monitors
                    .get(selected_display_index)
                    .or_else(|| monitors.first())
                    .map(panel_rect_from_monitor)
            },
        );
    descriptor.screen_scale_factor = monitors
        .get(descriptor.selected_display_index())
        .or_else(|| monitors.first())
        .map(|monitor| monitor.scale_factor());
    descriptor
}
