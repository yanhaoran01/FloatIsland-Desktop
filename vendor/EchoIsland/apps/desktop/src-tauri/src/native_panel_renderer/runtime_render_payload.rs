use echoisland_runtime::RuntimeSnapshot;
use tauri::AppHandle;

use super::animation_plan::NativePanelAnimationPlan;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct NativePanelRuntimeRenderPayloadState {
    pub(crate) expanded: bool,
    pub(crate) shared_body_height: Option<f64>,
    pub(crate) transitioning: bool,
    pub(crate) transition_cards_progress: f64,
    pub(crate) transition_cards_entering: bool,
}

pub(crate) trait NativePanelRuntimeRenderPayloadStateBridge {
    fn runtime_render_payload_snapshot(&self) -> Option<RuntimeSnapshot>;

    fn runtime_render_payload_state(&self) -> NativePanelRuntimeRenderPayloadState;
}

pub(crate) fn resolve_native_panel_runtime_render_payload_for_state<S, P>(
    state: &S,
    build: impl FnOnce(RuntimeSnapshot, NativePanelRuntimeRenderPayloadState) -> P,
) -> Option<P>
where
    S: NativePanelRuntimeRenderPayloadStateBridge,
{
    let snapshot = state.runtime_render_payload_snapshot()?;
    Some(build(snapshot, state.runtime_render_payload_state()))
}

pub(crate) fn native_panel_runtime_render_payload_state_from_animation_plan(
    expanded: bool,
    shared_body_height: Option<f64>,
    transitioning: bool,
    animation: NativePanelAnimationPlan,
) -> NativePanelRuntimeRenderPayloadState {
    NativePanelRuntimeRenderPayloadState {
        expanded,
        shared_body_height,
        transitioning,
        transition_cards_progress: animation.card_stack.transition_progress,
        transition_cards_entering: animation.card_stack.entering,
    }
}

pub(crate) fn dispatch_native_panel_runtime_render_payload_if_available<R, P>(
    app: &AppHandle<R>,
    payload: Option<P>,
    dispatch: impl FnOnce(&AppHandle<R>, P) -> Result<(), String>,
) -> Result<bool, String>
where
    R: tauri::Runtime,
{
    let Some(payload) = payload else {
        return Ok(false);
    };

    dispatch(app, payload)?;
    Ok(true)
}
