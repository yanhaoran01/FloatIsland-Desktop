use crate::native_panel_core::{
    PanelAnimationDescriptor, PanelAnimationKind, resolve_panel_cards_visibility_progress,
};

use super::{
    card_visual_spec::{CardVisualStackRevealFrameSpec, card_visual_stack_reveal_frame},
    descriptors::NativePanelTimelineDescriptor,
    transition_controller::NativePanelTransitionRequest,
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct NativePanelAnimationPlan {
    pub(crate) timeline: NativePanelTimelineDescriptor,
    pub(crate) card_stack: NativePanelCardStackAnimationPlan,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct NativePanelCardStackAnimationPlan {
    pub(crate) card_count: usize,
    pub(crate) entering: bool,
    pub(crate) transition_progress: f64,
    pub(crate) visibility_progress: f64,
    pub(crate) separator_visibility: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct NativePanelTransitionCardPhase {
    pub(crate) progress: f64,
    pub(crate) entering: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct NativePanelTransitionLifecyclePlan {
    pub(crate) request: NativePanelTransitionRequest,
    pub(crate) initial_card_phase: NativePanelTransitionCardPhase,
    pub(crate) final_card_phase: NativePanelTransitionCardPhase,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct NativePanelStatusClosePreservationInput {
    pub(crate) last_transition_request: Option<NativePanelTransitionRequest>,
    pub(crate) skip_next_close_card_exit: bool,
    pub(crate) transitioning: bool,
    pub(crate) last_animation: Option<PanelAnimationDescriptor>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct NativePanelStatusClosePreservationPlan {
    pub(crate) active_close: bool,
    pub(crate) pending_close: bool,
    pub(crate) should_store_pending_stack: bool,
    pub(crate) should_preserve_frame_after_refresh: bool,
    pub(crate) should_prepare_close_animation_stack: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativePanelCloseTrigger {
    Hover,
    StatusAuto,
    MessageAuto,
    Explicit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativePanelClosePresentationInput {
    pub(crate) trigger: NativePanelCloseTrigger,
    pub(crate) status_close: NativePanelStatusClosePreservationPlan,
    pub(crate) has_preserved_cards: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct NativePanelClosePresentationPlan {
    pub(crate) should_capture_card_stack: bool,
    pub(crate) should_apply_preserved_card_stack: bool,
    pub(crate) preserve_any_surface: bool,
    pub(crate) preserve_status_surface_only: bool,
    pub(crate) should_suppress_edge_actions: bool,
    pub(crate) should_remove_edge_action_hit_targets: bool,
    pub(crate) should_clear_pending_stack: bool,
}

impl NativePanelCardStackAnimationPlan {
    pub(crate) fn reveal_frame(self, card_index: usize) -> CardVisualStackRevealFrameSpec {
        card_visual_stack_reveal_frame(self.separator_visibility, self.card_count, card_index)
    }
}

pub(crate) fn resolve_native_panel_status_close_preservation_plan(
    input: NativePanelStatusClosePreservationInput,
) -> NativePanelStatusClosePreservationPlan {
    let pending_close = input.last_transition_request == Some(NativePanelTransitionRequest::Close)
        && input.skip_next_close_card_exit;
    let active_close = input.transitioning
        && input
            .last_animation
            .is_some_and(|descriptor| descriptor.kind == PanelAnimationKind::Close);

    NativePanelStatusClosePreservationPlan {
        active_close,
        pending_close,
        should_store_pending_stack: pending_close,
        should_preserve_frame_after_refresh: active_close || pending_close,
        should_prepare_close_animation_stack: pending_close,
    }
}

pub(crate) fn resolve_native_panel_close_presentation_plan(
    input: NativePanelClosePresentationInput,
) -> NativePanelClosePresentationPlan {
    let close_frame_active = input.status_close.active_close || input.status_close.pending_close;
    let should_capture_card_stack = input.has_preserved_cards
        && match input.trigger {
            NativePanelCloseTrigger::Hover => true,
            NativePanelCloseTrigger::StatusAuto | NativePanelCloseTrigger::MessageAuto => {
                input.status_close.should_store_pending_stack || close_frame_active
            }
            NativePanelCloseTrigger::Explicit => false,
        };
    let should_apply_preserved_card_stack = input.has_preserved_cards
        && match input.trigger {
            NativePanelCloseTrigger::Hover => true,
            NativePanelCloseTrigger::StatusAuto | NativePanelCloseTrigger::MessageAuto => {
                input.status_close.should_preserve_frame_after_refresh
                    || input.status_close.should_prepare_close_animation_stack
            }
            NativePanelCloseTrigger::Explicit => close_frame_active,
        };
    let preserve_any_surface = input.trigger == NativePanelCloseTrigger::Hover;
    let preserve_status_surface_only = matches!(
        input.trigger,
        NativePanelCloseTrigger::StatusAuto | NativePanelCloseTrigger::MessageAuto
    );
    let should_suppress_edge_actions = should_apply_preserved_card_stack
        && matches!(
            input.trigger,
            NativePanelCloseTrigger::StatusAuto | NativePanelCloseTrigger::MessageAuto
        );

    NativePanelClosePresentationPlan {
        should_capture_card_stack,
        should_apply_preserved_card_stack,
        preserve_any_surface,
        preserve_status_surface_only,
        should_suppress_edge_actions,
        should_remove_edge_action_hit_targets: should_suppress_edge_actions,
        should_clear_pending_stack: !close_frame_active,
    }
}

pub(crate) fn resolve_native_panel_animation_plan(
    timeline: NativePanelTimelineDescriptor,
    card_count: usize,
) -> NativePanelAnimationPlan {
    let transition_progress = timeline.animation.cards_progress.clamp(0.0, 1.0);
    let visibility_progress = resolve_panel_cards_visibility_progress(timeline.animation);
    NativePanelAnimationPlan {
        timeline,
        card_stack: NativePanelCardStackAnimationPlan {
            card_count,
            entering: timeline.cards_entering,
            transition_progress,
            visibility_progress,
            separator_visibility: visibility_progress * 0.88,
        },
    }
}

pub(crate) fn resolve_native_panel_transition_lifecycle_plan(
    request: NativePanelTransitionRequest,
) -> NativePanelTransitionLifecyclePlan {
    match request {
        NativePanelTransitionRequest::Open => NativePanelTransitionLifecyclePlan {
            request,
            initial_card_phase: NativePanelTransitionCardPhase {
                progress: 0.0,
                entering: true,
            },
            final_card_phase: NativePanelTransitionCardPhase {
                progress: 1.0,
                entering: true,
            },
        },
        NativePanelTransitionRequest::Close => NativePanelTransitionLifecyclePlan {
            request,
            initial_card_phase: NativePanelTransitionCardPhase {
                progress: 0.0,
                entering: false,
            },
            final_card_phase: NativePanelTransitionCardPhase {
                progress: 0.0,
                entering: false,
            },
        },
        NativePanelTransitionRequest::SurfaceSwitch => NativePanelTransitionLifecyclePlan {
            request,
            initial_card_phase: NativePanelTransitionCardPhase {
                progress: crate::native_panel_core::PANEL_SURFACE_SWITCH_INITIAL_CARD_PROGRESS,
                entering: true,
            },
            final_card_phase: NativePanelTransitionCardPhase {
                progress: 1.0,
                entering: true,
            },
        },
    }
}
