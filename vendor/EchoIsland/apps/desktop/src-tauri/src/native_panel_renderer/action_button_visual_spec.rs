pub(crate) use crate::native_panel_core::{
    ActionButtonVisibilitySpec, ActionButtonVisibilitySpecInput,
    action_button_transition_progress_from_compact_width, action_button_visual_frame_for_phase,
    resolve_action_button_visibility_spec,
};
use crate::native_panel_core::{PanelRect, resolve_compact_action_button_layout};

use super::{
    descriptors::NativePanelEdgeAction,
    visual_primitives::{NativePanelVisualColor, NativePanelVisualTextWeight},
};

const SETTINGS_ACTION_ICON_TEXT: &str = "\u{E713}";
const QUIT_ACTION_ICON_TEXT: &str = "\u{E7E8}";
const ACTION_ICON_SIZE: i32 = 16;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct ActionButtonVisualSpecInput<'a> {
    pub(crate) visible: bool,
    pub(crate) compact_frame: PanelRect,
    pub(crate) buttons: &'a [(NativePanelEdgeAction, PanelRect)],
    pub(crate) debug_mode_enabled: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ActionButtonVisualSpec {
    pub(crate) action: NativePanelEdgeAction,
    pub(crate) frame: PanelRect,
    pub(crate) text: String,
    pub(crate) size: i32,
    pub(crate) weight: NativePanelVisualTextWeight,
    pub(crate) color: NativePanelVisualColor,
}

pub(crate) fn resolve_action_button_visual_specs(
    input: ActionButtonVisualSpecInput<'_>,
) -> Vec<ActionButtonVisualSpec> {
    if !input.visible {
        return Vec::new();
    }
    input
        .buttons
        .iter()
        .map(|(action, frame)| {
            action_button_visual_spec(
                *action,
                *frame,
                input.compact_frame,
                input.debug_mode_enabled,
            )
        })
        .collect()
}

fn action_button_visual_spec(
    action: NativePanelEdgeAction,
    frame: PanelRect,
    compact_frame: PanelRect,
    debug_mode_enabled: bool,
) -> ActionButtonVisualSpec {
    let frame = action_button_icon_frame(action, frame, compact_frame);
    let (text, weight, color) = match action {
        NativePanelEdgeAction::Settings => (
            SETTINGS_ACTION_ICON_TEXT,
            NativePanelVisualTextWeight::Normal,
            settings_action_color(debug_mode_enabled),
        ),
        NativePanelEdgeAction::Quit => (
            QUIT_ACTION_ICON_TEXT,
            NativePanelVisualTextWeight::Bold,
            NativePanelVisualColor::rgb(255, 82, 82),
        ),
    };
    ActionButtonVisualSpec {
        action,
        frame,
        text: text.to_string(),
        size: ACTION_ICON_SIZE,
        weight,
        color,
    }
}

fn settings_action_color(debug_mode_enabled: bool) -> NativePanelVisualColor {
    if debug_mode_enabled {
        NativePanelVisualColor::rgb(102, 222, 145)
    } else {
        NativePanelVisualColor::rgb(245, 247, 252)
    }
}

fn action_button_icon_frame(
    action: NativePanelEdgeAction,
    _frame: PanelRect,
    compact_frame: PanelRect,
) -> PanelRect {
    let local = resolve_compact_action_button_layout(compact_frame);
    match action {
        NativePanelEdgeAction::Settings => local.settings,
        NativePanelEdgeAction::Quit => local.quit,
    }
}
