use objc2::MainThreadMarker;

use crate::{
    native_panel_renderer::facade::descriptor::{
        NativePanelRuntimeInputContext, NativePanelRuntimeInputDescriptor,
    },
    native_panel_scene_input::{
        native_panel_runtime_input_descriptor_from_context,
        native_panel_runtime_input_descriptor_from_display_options_with_screen_frame,
    },
};

use super::panel_display_source::{
    native_panel_screen_catalog, native_panel_screen_for_selected_index, native_panel_screen_frame,
};

pub(super) fn native_panel_runtime_input_descriptor() -> NativePanelRuntimeInputDescriptor {
    let settings = crate::app_settings::current_app_settings();
    native_panel_runtime_display_descriptor(&settings).unwrap_or_else(|| {
        native_panel_runtime_input_descriptor_from_context(
            &settings,
            NativePanelRuntimeInputContext::default(),
        )
    })
}

fn native_panel_runtime_display_descriptor(
    settings: &crate::app_settings::AppSettings,
) -> Option<NativePanelRuntimeInputDescriptor> {
    let mtm = MainThreadMarker::new()?;
    let catalog = native_panel_screen_catalog(mtm);

    Some(
        native_panel_runtime_input_descriptor_from_display_options_with_screen_frame(
            &catalog.displays,
            settings,
            catalog.fallback_index,
            |selected_display_index| {
                native_panel_screen_for_selected_index(&catalog, selected_display_index, mtm)
                    .map(|screen| native_panel_screen_frame(&screen))
            },
        ),
    )
}
