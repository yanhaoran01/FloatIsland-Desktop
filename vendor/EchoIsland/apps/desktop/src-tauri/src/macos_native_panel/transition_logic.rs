use super::panel_host_runtime::with_native_runtime_panel_state_mut;
use super::panel_types::NativePanelState;
use crate::native_panel_renderer::facade::{
    descriptor::NativePanelTimelineDescriptor, host::sync_runtime_host_timeline_in_state,
};

fn with_native_panel_state_mut<T>(f: impl FnOnce(&mut NativePanelState) -> T) -> Option<T> {
    with_native_runtime_panel_state_mut(f)
}

pub(super) fn take_skip_close_card_exit_and_begin_transition(expanded: bool) -> bool {
    with_native_panel_state_mut(|state| {
        state.transitioning = true;
        if expanded {
            false
        } else {
            let skip_close_card_exit = state.skip_next_close_card_exit;
            state.skip_next_close_card_exit = false;
            skip_close_card_exit
        }
    })
    .unwrap_or(false)
}

pub(super) fn set_transition_cards_state(progress: f64, entering: bool) {
    let _ = with_native_panel_state_mut(|state| {
        state.transition_cards_progress = progress;
        state.transition_cards_entering = entering;
    });
}

pub(super) fn finish_transition_state(progress: f64, entering: bool) {
    let _ = with_native_panel_state_mut(|state| {
        state.transitioning = false;
        state.transition_cards_progress = progress;
        state.transition_cards_entering = entering;
        state.transition_collapsed_chrome_alpha = None;
    });
}

pub(super) fn update_timeline_transition_state_from_descriptor(
    descriptor: NativePanelTimelineDescriptor,
) {
    let _ = with_native_panel_state_mut(|state| {
        state.transition_cards_progress = descriptor.animation.cards_progress.clamp(0.0, 1.0);
        state.transition_cards_entering = descriptor.cards_entering;
        sync_runtime_host_timeline_in_state(state, descriptor);
    });
}
