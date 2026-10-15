use echoisland_runtime::RuntimeSnapshot;

use crate::native_panel_core::{HoverTransition, PanelAnimationTimeline, PanelSnapshotSyncResult};

use super::descriptors::{
    NativePanelTimelineDescriptor, native_panel_timeline_descriptor_for_animation,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativePanelTransitionRequest {
    Open,
    Close,
    SurfaceSwitch,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct NativePanelPendingTransition {
    pub(crate) request: NativePanelTransitionRequest,
    pub(crate) snapshot: RuntimeSnapshot,
}

pub(crate) trait NativePanelTransitionRequestDispatcher {
    type Error;

    fn dispatch_panel_transition(
        &mut self,
        snapshot: RuntimeSnapshot,
        expanded: bool,
    ) -> Result<(), Self::Error>;

    fn dispatch_surface_transition(&mut self, snapshot: RuntimeSnapshot)
    -> Result<(), Self::Error>;
}

impl NativePanelTransitionRequest {
    pub(crate) fn panel_expanded(self) -> Option<bool> {
        match self {
            Self::Open => Some(true),
            Self::Close => Some(false),
            Self::SurfaceSwitch => None,
        }
    }

    pub(crate) fn is_surface_switch(self) -> bool {
        matches!(self, Self::SurfaceSwitch)
    }
}

pub(crate) fn native_panel_transition_request_for_hover_transition(
    transition: Option<HoverTransition>,
) -> Option<NativePanelTransitionRequest> {
    match transition {
        Some(HoverTransition::Expand) => Some(NativePanelTransitionRequest::Open),
        Some(HoverTransition::Collapse) => Some(NativePanelTransitionRequest::Close),
        None => None,
    }
}

pub(crate) fn native_panel_transition_request_for_snapshot_sync(
    sync: &PanelSnapshotSyncResult,
) -> Option<NativePanelTransitionRequest> {
    match sync.panel_transition {
        Some(true) => Some(NativePanelTransitionRequest::Open),
        Some(false) => Some(NativePanelTransitionRequest::Close),
        None if sync.surface_transition => Some(NativePanelTransitionRequest::SurfaceSwitch),
        None => None,
    }
}

pub(crate) fn native_panel_transition_request_for_surface_change(
    changed: bool,
    expanded: bool,
    transitioning: bool,
) -> Option<NativePanelTransitionRequest> {
    (changed && expanded && !transitioning).then_some(NativePanelTransitionRequest::SurfaceSwitch)
}

pub(crate) fn dispatch_native_panel_transition_request_with_snapshot<D>(
    dispatcher: &mut D,
    request: Option<NativePanelTransitionRequest>,
    snapshot: Option<RuntimeSnapshot>,
) -> Result<bool, D::Error>
where
    D: NativePanelTransitionRequestDispatcher,
{
    dispatch_native_panel_transition_request_with_snapshot_via(
        request,
        snapshot,
        |request, snapshot| match request {
            NativePanelTransitionRequest::Open => {
                dispatcher.dispatch_panel_transition(snapshot, true)
            }
            NativePanelTransitionRequest::Close => {
                dispatcher.dispatch_panel_transition(snapshot, false)
            }
            NativePanelTransitionRequest::SurfaceSwitch => {
                dispatcher.dispatch_surface_transition(snapshot)
            }
        },
    )
}

pub(crate) fn dispatch_native_panel_transition_request_with_snapshot_via<E>(
    request: Option<NativePanelTransitionRequest>,
    snapshot: Option<RuntimeSnapshot>,
    dispatch: impl FnOnce(NativePanelTransitionRequest, RuntimeSnapshot) -> Result<(), E>,
) -> Result<bool, E> {
    let (Some(request), Some(snapshot)) = (request, snapshot) else {
        return Ok(false);
    };

    dispatch(request, snapshot)?;

    Ok(true)
}

pub(crate) fn pending_native_panel_transition_if_active(
    transitioning: bool,
    request: NativePanelTransitionRequest,
    snapshot: RuntimeSnapshot,
) -> Option<NativePanelPendingTransition> {
    transitioning.then_some(NativePanelPendingTransition { request, snapshot })
}

pub(crate) fn take_pending_native_panel_transition_after_completed(
    pending: &mut Option<NativePanelPendingTransition>,
    completed_request: NativePanelTransitionRequest,
) -> Option<NativePanelPendingTransition> {
    let pending_transition = pending.take()?;
    (pending_transition.request != completed_request).then_some(pending_transition)
}

pub(crate) fn clear_pending_native_panel_transition_request(
    pending: &mut Option<NativePanelPendingTransition>,
    request: NativePanelTransitionRequest,
) -> bool {
    if pending
        .as_ref()
        .is_some_and(|pending| pending.request == request)
    {
        pending.take();
        true
    } else {
        false
    }
}

pub(crate) fn dispatch_native_panel_transition_request_or_fallback<D>(
    dispatcher: &mut D,
    request: Option<NativePanelTransitionRequest>,
    snapshot: Option<RuntimeSnapshot>,
    fallback: impl FnOnce() -> Result<(), D::Error>,
) -> Result<(), D::Error>
where
    D: NativePanelTransitionRequestDispatcher,
{
    dispatch_native_panel_transition_request_or_fallback_via(
        request,
        snapshot,
        |request, snapshot| match request {
            NativePanelTransitionRequest::Open => {
                dispatcher.dispatch_panel_transition(snapshot, true)
            }
            NativePanelTransitionRequest::Close => {
                dispatcher.dispatch_panel_transition(snapshot, false)
            }
            NativePanelTransitionRequest::SurfaceSwitch => {
                dispatcher.dispatch_surface_transition(snapshot)
            }
        },
        fallback,
    )
}

pub(crate) fn dispatch_native_panel_transition_request_or_fallback_via<E>(
    request: Option<NativePanelTransitionRequest>,
    snapshot: Option<RuntimeSnapshot>,
    dispatch: impl FnOnce(NativePanelTransitionRequest, RuntimeSnapshot) -> Result<(), E>,
    fallback: impl FnOnce() -> Result<(), E>,
) -> Result<(), E> {
    if dispatch_native_panel_transition_request_with_snapshot_via(request, snapshot, dispatch)? {
        return Ok(());
    }

    fallback()
}

pub(crate) fn resolve_native_panel_animation_timeline(
    request: NativePanelTransitionRequest,
    start_height: f64,
    target_height: f64,
    card_count: usize,
) -> PanelAnimationTimeline {
    match request {
        NativePanelTransitionRequest::Open => {
            PanelAnimationTimeline::open(start_height, target_height, card_count)
        }
        NativePanelTransitionRequest::Close => {
            PanelAnimationTimeline::close(start_height, card_count)
        }
        NativePanelTransitionRequest::SurfaceSwitch => {
            PanelAnimationTimeline::surface_switch(start_height, target_height, card_count)
        }
    }
}

pub(crate) fn resolve_native_panel_terminal_timeline_descriptor(
    request: NativePanelTransitionRequest,
    start_height: f64,
    target_height: f64,
    card_count: usize,
) -> NativePanelTimelineDescriptor {
    let timeline =
        resolve_native_panel_animation_timeline(request, start_height, target_height, card_count);
    native_panel_timeline_descriptor_for_animation(timeline.sample(timeline.total_ms()))
}
