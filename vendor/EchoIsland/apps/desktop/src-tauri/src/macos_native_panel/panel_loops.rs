use std::time::Instant;

use echoisland_runtime::RuntimeSnapshot;
use tauri::AppHandle;
use tokio::time::{Duration, MissedTickBehavior};
use tracing::warn;

use super::compact_bar_layout::sync_active_count_marquee;
use super::mascot::sync_native_mascot;
use super::panel_constants::{
    ACTIVE_COUNT_SCROLL_REFRESH_MS, HOVER_POLL_MS, MASCOT_ANIMATION_REFRESH_MS,
    STATUS_QUEUE_REFRESH_MS,
};
use super::panel_entry::native_ui_enabled;
use super::panel_interaction::sync_hover_state_on_main_thread;
use super::panel_refs::{
    native_panel_handles, native_panel_state, panel_from_ptr, resolve_native_panel_refs,
};
use super::panel_snapshot::update_native_island_snapshot;
use super::panel_types::{
    NativePanelState, NativePendingPermissionCard, NativePendingQuestionCard, NativeStatusQueueItem,
};

const STATUS_QUEUE_REFRESH_LOOKAHEAD_MS: u64 = STATUS_QUEUE_REFRESH_MS * 2;

pub(crate) fn spawn_native_hover_loop<R: tauri::Runtime + 'static>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(HOVER_POLL_MS));
        interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

        loop {
            interval.tick().await;
            if !native_ui_enabled() {
                continue;
            }

            let app_for_hover = app.clone();
            let _ = app.run_on_main_thread(move || unsafe {
                sync_hover_state_on_main_thread(app_for_hover);
            });
        }
    });
}

pub(crate) fn spawn_native_count_marquee_loop<R: tauri::Runtime + 'static>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(
            ACTIVE_COUNT_SCROLL_REFRESH_MS.min(MASCOT_ANIMATION_REFRESH_MS),
        ));
        interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

        loop {
            interval.tick().await;
            if !native_ui_enabled() {
                continue;
            }

            let _ = app.run_on_main_thread(move || unsafe {
                let Some(handles) = native_panel_handles() else {
                    return;
                };
                let refs = resolve_native_panel_refs(handles);
                if !native_panel_transitioning() {
                    sync_active_count_marquee(&refs);
                }
                sync_native_mascot(handles);
                panel_from_ptr(handles.panel).setViewsNeedDisplay(true);
            });
        }
    });
}

fn native_panel_transitioning() -> bool {
    native_panel_state()
        .and_then(|state| state.lock().ok().map(|guard| guard.transitioning))
        .unwrap_or(false)
}

pub(crate) fn spawn_native_status_queue_loop<R: tauri::Runtime + 'static>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(STATUS_QUEUE_REFRESH_MS));
        interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

        loop {
            interval.tick().await;
            if !native_ui_enabled() {
                continue;
            }

            let now = Instant::now();
            let snapshot = native_panel_state().and_then(|state| {
                state
                    .lock()
                    .ok()
                    .and_then(|guard| status_queue_refresh_snapshot(&guard, now))
            });
            let Some(snapshot) = snapshot else {
                continue;
            };

            if let Err(error) = update_native_island_snapshot(&app, &snapshot) {
                warn!(error = %error, "failed to refresh native macOS status queue animation");
            }
        }
    });
}

fn status_queue_refresh_snapshot(
    state: &NativePanelState,
    now: Instant,
) -> Option<RuntimeSnapshot> {
    status_queue_refresh_due(
        state.transitioning,
        &state.status_queue,
        state.pending_permission_card.as_ref(),
        state.pending_question_card.as_ref(),
        now,
    )
    .then(|| state.last_raw_snapshot.clone())
    .flatten()
}

fn status_queue_refresh_due(
    transitioning: bool,
    status_queue: &[NativeStatusQueueItem],
    pending_permission_card: Option<&NativePendingPermissionCard>,
    pending_question_card: Option<&NativePendingQuestionCard>,
    now: Instant,
) -> bool {
    if transitioning {
        return false;
    }

    let lookahead = Duration::from_millis(STATUS_QUEUE_REFRESH_LOOKAHEAD_MS);
    status_queue.iter().any(|item| {
        item.is_removing
            || item.expires_at <= now
            || item.expires_at.saturating_duration_since(now) <= lookahead
    }) || pending_permission_card
        .is_some_and(|card| card.visible_until.saturating_duration_since(now) <= lookahead)
        || pending_question_card
            .is_some_and(|card| card.visible_until.saturating_duration_since(now) <= lookahead)
}
