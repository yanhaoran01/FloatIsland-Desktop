use crate::{
    native_panel_core::{ExpandedSurface, PanelLayout, PanelRect, PanelRenderState},
    native_panel_scene::{
        PanelRuntimeRenderState, PanelScene, SceneCard, SceneGlow, SceneMascotPose, SceneText,
    },
};

use super::descriptors::{
    NativePanelEdgeAction, NativePanelPointerRegion, NativePanelPointerRegionInput,
    NativePanelPointerRegionKind, resolve_native_panel_interaction_plan,
};
use super::presentation_model::estimated_scene_content_height_for_card_width;

#[derive(Clone, Debug)]
pub(crate) struct NativePanelRenderCommandBundle {
    pub(crate) scene: PanelScene,
    pub(crate) runtime: PanelRuntimeRenderState,
    pub(crate) layout: PanelLayout,
    pub(crate) render_state: PanelRenderState,
    pub(crate) shell: NativePanelShellCommand,
    pub(crate) compact_bar: NativePanelCompactBarCommand,
    pub(crate) card_stack: NativePanelCardStackCommand,
    pub(crate) mascot: NativePanelMascotCommand,
    pub(crate) glow: Option<NativePanelGlowCommand>,
    pub(crate) action_buttons: Vec<NativePanelActionButtonCommand>,
    pub(crate) pointer_regions: Vec<NativePanelPointerRegion>,
}

#[derive(Clone, Debug)]
pub(crate) struct NativePanelShellCommand {
    pub(crate) surface: ExpandedSurface,
    pub(crate) frame: PanelRect,
    pub(crate) visible: bool,
    pub(crate) separator_visibility: f64,
    pub(crate) shared_visible: bool,
    pub(crate) chrome_transition_progress: f64,
}

#[derive(Clone, Debug)]
pub(crate) struct NativePanelCompactBarCommand {
    pub(crate) frame: PanelRect,
    pub(crate) left_shoulder_frame: PanelRect,
    pub(crate) right_shoulder_frame: PanelRect,
    pub(crate) shoulder_progress: f64,
    pub(crate) headline: SceneText,
    pub(crate) active_count: String,
    pub(crate) total_count: String,
    pub(crate) completion_count: usize,
    pub(crate) headline_emphasized: bool,
    pub(crate) actions_visible: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct NativePanelCardStackCommand {
    pub(crate) frame: PanelRect,
    pub(crate) surface: ExpandedSurface,
    pub(crate) cards: Vec<SceneCard>,
    pub(crate) content_height: f64,
    pub(crate) body_height: f64,
    pub(crate) visible: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct NativePanelMascotCommand {
    pub(crate) pose: SceneMascotPose,
    pub(crate) debug_mode_enabled: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct NativePanelGlowCommand {
    pub(crate) glow: SceneGlow,
}

#[derive(Clone, Debug)]
pub(crate) struct NativePanelActionButtonCommand {
    pub(crate) action: NativePanelEdgeAction,
    pub(crate) frame: PanelRect,
    pub(crate) visible: bool,
}

pub(crate) fn resolve_native_panel_render_command_bundle(
    layout: PanelLayout,
    scene: &PanelScene,
    runtime: PanelRuntimeRenderState,
    render_state: PanelRenderState,
    pointer_region_input: Option<NativePanelPointerRegionInput>,
) -> NativePanelRenderCommandBundle {
    let interaction_plan =
        resolve_native_panel_interaction_plan(layout, scene, pointer_region_input);
    let pointer_regions = interaction_plan.pointer_regions;

    NativePanelRenderCommandBundle {
        scene: scene.clone(),
        runtime,
        layout,
        render_state,
        shell: NativePanelShellCommand {
            surface: scene.surface,
            frame: layout.expanded_frame,
            visible: layout.shell_visible,
            separator_visibility: layout.separator_visibility,
            shared_visible: render_state.shared.visible,
            chrome_transition_progress: render_state.layer_style.chrome_transition_progress,
        },
        compact_bar: native_panel_compact_bar_command(
            scene,
            layout.pill_frame,
            layout.left_shoulder_frame,
            layout.right_shoulder_frame,
            render_state.layer_style.shoulder_progress,
        ),
        card_stack: native_panel_card_stack_command(
            scene,
            layout.cards_frame,
            layout.shell_visible && !scene.cards.is_empty(),
        ),
        mascot: native_panel_mascot_command(scene),
        glow: native_panel_glow_command(scene),
        action_buttons: resolve_action_button_commands(&pointer_regions, scene),
        pointer_regions,
    }
}

pub(crate) fn native_panel_compact_bar_command(
    scene: &PanelScene,
    frame: PanelRect,
    left_shoulder_frame: PanelRect,
    right_shoulder_frame: PanelRect,
    shoulder_progress: f64,
) -> NativePanelCompactBarCommand {
    NativePanelCompactBarCommand {
        frame,
        left_shoulder_frame,
        right_shoulder_frame,
        shoulder_progress,
        headline: scene.compact_bar.headline.clone(),
        active_count: scene.compact_bar.active_count.clone(),
        total_count: scene.compact_bar.total_count.clone(),
        completion_count: scene.compact_bar.completion_count,
        headline_emphasized: scene.compact_bar.headline.emphasized,
        actions_visible: scene.compact_bar.actions_visible,
    }
}

pub(crate) fn native_panel_card_stack_command(
    scene: &PanelScene,
    frame: PanelRect,
    visible: bool,
) -> NativePanelCardStackCommand {
    let content_height = estimated_scene_content_height_for_card_width(scene, frame.width);
    NativePanelCardStackCommand {
        frame,
        surface: scene.surface,
        cards: scene.cards.clone(),
        content_height,
        body_height: content_height.min(crate::native_panel_core::EXPANDED_MAX_BODY_HEIGHT),
        visible,
    }
}

pub(crate) fn native_panel_mascot_command(scene: &PanelScene) -> NativePanelMascotCommand {
    NativePanelMascotCommand {
        pose: scene.mascot_pose,
        debug_mode_enabled: scene.debug_mode_enabled,
    }
}

pub(crate) fn native_panel_glow_command(scene: &PanelScene) -> Option<NativePanelGlowCommand> {
    scene
        .glow
        .clone()
        .map(|glow| NativePanelGlowCommand { glow })
}

fn resolve_action_button_commands(
    pointer_regions: &[NativePanelPointerRegion],
    scene: &PanelScene,
) -> Vec<NativePanelActionButtonCommand> {
    pointer_regions
        .iter()
        .filter_map(|region| match region.kind {
            NativePanelPointerRegionKind::EdgeAction(action) => {
                Some(NativePanelActionButtonCommand {
                    action,
                    frame: region.frame,
                    visible: scene.compact_bar.actions_visible,
                })
            }
            _ => None,
        })
        .collect()
}
