use crate::{
    app_settings::AppSettings,
    display_settings::DisplayOption,
    native_panel_core::resolve_preferred_panel_display_index,
    native_panel_core::{PanelRect, PanelSettingsState},
    native_panel_renderer::facade::descriptor::{
        NativePanelRuntimeInputContext, NativePanelRuntimeInputDescriptor,
    },
    native_panel_scene::{
        PanelDisplayOptionState, PanelSceneBuildInput, fallback_panel_display_option,
        panel_display_option_state_with_width_support,
    },
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct NativePanelDisplaySelectionUpdate {
    pub(crate) selected_display_index: usize,
    pub(crate) selected_display_key: String,
}

pub(crate) fn panel_scene_build_input_from_app_settings(
    display_options: Vec<PanelDisplayOptionState>,
    selected_display_index: usize,
    settings: &AppSettings,
) -> PanelSceneBuildInput {
    PanelSceneBuildInput {
        display_options: sanitize_panel_display_options(display_options),
        settings: panel_settings_state_from_app_settings(selected_display_index, settings),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        update_status: crate::updater_service::current_update_status(),
    }
}

pub(crate) fn panel_settings_state_from_app_settings(
    selected_display_index: usize,
    settings: &AppSettings,
) -> PanelSettingsState {
    PanelSettingsState {
        selected_display_index,
        island_width_preset: settings.island_width_preset,
        completion_sound_enabled: settings.completion_sound_enabled,
        mascot_enabled: settings.mascot_enabled,
        debug_mode_enabled: settings.debug_mode_enabled,
    }
}

pub(crate) fn native_panel_runtime_input_descriptor_from_app_settings(
    display_options: Vec<PanelDisplayOptionState>,
    selected_display_index: usize,
    settings: &AppSettings,
    screen_frame: Option<crate::native_panel_core::PanelRect>,
) -> NativePanelRuntimeInputDescriptor {
    NativePanelRuntimeInputDescriptor {
        scene_input: panel_scene_build_input_from_app_settings(
            display_options,
            selected_display_index,
            settings,
        ),
        screen_frame,
        screen_scale_factor: None,
    }
}

pub(crate) fn native_panel_runtime_input_descriptor_from_context(
    settings: &AppSettings,
    context: NativePanelRuntimeInputContext,
) -> NativePanelRuntimeInputDescriptor {
    native_panel_runtime_input_descriptor_from_app_settings(
        context.display_options,
        context.selected_display_index,
        settings,
        context.screen_frame,
    )
}

pub(crate) fn panel_scene_build_input_from_display_options(
    displays: &[DisplayOption],
    settings: &AppSettings,
    fallback_index: Option<usize>,
) -> PanelSceneBuildInput {
    let selected_display_index =
        resolve_selected_display_index_from_display_options(displays, settings, fallback_index);
    panel_scene_build_input_from_app_settings(
        panel_display_options_from_display_options(displays),
        selected_display_index,
        settings,
    )
}

pub(crate) fn native_panel_runtime_input_descriptor_from_display_options_with_screen_frame(
    displays: &[DisplayOption],
    settings: &AppSettings,
    fallback_index: Option<usize>,
    screen_frame_for_selected_index: impl FnOnce(usize) -> Option<PanelRect>,
) -> NativePanelRuntimeInputDescriptor {
    let context = native_panel_runtime_input_context_from_display_options_with_screen_frame(
        panel_display_options_from_display_options(displays),
        settings,
        fallback_index,
        screen_frame_for_selected_index,
    );
    native_panel_runtime_input_descriptor_from_context(settings, context)
}

pub(crate) fn native_panel_runtime_input_context_from_display_options(
    display_options: Vec<PanelDisplayOptionState>,
    settings: &AppSettings,
    fallback_index: Option<usize>,
    screen_frame: Option<PanelRect>,
) -> NativePanelRuntimeInputContext {
    let selected_display_index = resolve_panel_selected_display_index(
        &display_options
            .iter()
            .map(|display| display.key.clone())
            .collect::<Vec<_>>(),
        settings,
        fallback_index,
    );

    NativePanelRuntimeInputContext {
        display_options,
        selected_display_index,
        screen_frame,
    }
}

pub(crate) fn native_panel_runtime_input_context_from_display_options_with_screen_frame(
    display_options: Vec<PanelDisplayOptionState>,
    settings: &AppSettings,
    fallback_index: Option<usize>,
    screen_frame_for_selected_index: impl FnOnce(usize) -> Option<PanelRect>,
) -> NativePanelRuntimeInputContext {
    let mut context = native_panel_runtime_input_context_from_display_options(
        display_options,
        settings,
        fallback_index,
        None,
    );
    context.screen_frame = screen_frame_for_selected_index(context.selected_display_index);
    context
}

pub(crate) fn panel_display_options_from_display_options(
    displays: &[DisplayOption],
) -> Vec<PanelDisplayOptionState> {
    displays
        .iter()
        .map(|display| {
            panel_display_option_state_with_width_support(
                display.index,
                display.key.clone(),
                &display.name,
                display.width,
                display.height,
                display.supports_wide_island,
            )
        })
        .collect()
}

pub(crate) fn resolve_selected_display_index_from_display_options(
    displays: &[DisplayOption],
    settings: &AppSettings,
    fallback_index: Option<usize>,
) -> usize {
    if displays.is_empty() {
        return fallback_index.unwrap_or(settings.preferred_display_index);
    }
    resolve_panel_selected_display_index(
        &displays
            .iter()
            .map(|display| display.key.clone())
            .collect::<Vec<_>>(),
        settings,
        fallback_index,
    )
}

pub(crate) fn resolve_next_display_selection_update_from_display_options(
    displays: &[DisplayOption],
    settings: &AppSettings,
) -> Option<NativePanelDisplaySelectionUpdate> {
    if displays.is_empty() {
        return None;
    }
    let current = resolve_selected_display_index_from_display_options(displays, settings, Some(0));
    let selected = displays.get((current + 1) % displays.len())?;
    Some(NativePanelDisplaySelectionUpdate {
        selected_display_index: selected.index,
        selected_display_key: selected.key.clone(),
    })
}

pub(crate) fn resolve_panel_selected_display_index(
    display_keys: &[String],
    settings: &AppSettings,
    fallback_index: Option<usize>,
) -> usize {
    resolve_preferred_panel_display_index(
        display_keys,
        settings.preferred_display_key.as_deref(),
        settings.preferred_display_index,
        fallback_index,
    )
    .unwrap_or(0)
}

fn sanitize_panel_display_options(
    display_options: Vec<PanelDisplayOptionState>,
) -> Vec<PanelDisplayOptionState> {
    if display_options.is_empty() {
        vec![fallback_panel_display_option()]
    } else {
        display_options
    }
}
