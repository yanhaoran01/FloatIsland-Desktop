use super::{descriptors::NativePanelHostWindowState, shell_command::NativePanelHostShellCommand};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum NativePanelHostShellLifecycle {
    #[default]
    Detached,
    Created,
    Visible,
    Hidden,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct NativePanelHostShellState {
    lifecycle: NativePanelHostShellLifecycle,
    last_window_state: Option<NativePanelHostWindowState>,
    last_ignores_mouse_events: Option<bool>,
    redraw_requests: usize,
    platform_loop_started: bool,
    platform_loop_spawn_count: usize,
    pending_commands: Vec<NativePanelHostShellCommand>,
}

impl NativePanelHostShellState {
    pub(crate) fn lifecycle(&self) -> NativePanelHostShellLifecycle {
        self.lifecycle
    }

    pub(crate) fn redraw_requests(&self) -> usize {
        self.redraw_requests
    }

    pub(crate) fn last_window_state(&self) -> Option<NativePanelHostWindowState> {
        self.last_window_state
    }

    pub(crate) fn last_ignores_mouse_events(&self) -> Option<bool> {
        self.last_ignores_mouse_events
    }

    pub(crate) fn platform_loop_started(&self) -> bool {
        self.platform_loop_started
    }

    pub(crate) fn platform_loop_spawn_count(&self) -> usize {
        self.platform_loop_spawn_count
    }

    pub(crate) fn take_pending_commands(&mut self) -> Vec<NativePanelHostShellCommand> {
        std::mem::take(&mut self.pending_commands)
    }

    pub(crate) fn has_pending_destroy_command(&self) -> bool {
        self.pending_commands
            .iter()
            .any(|command| matches!(command, NativePanelHostShellCommand::Destroy))
    }

    pub(crate) fn create(&mut self) {
        if self.lifecycle == NativePanelHostShellLifecycle::Detached {
            self.lifecycle = NativePanelHostShellLifecycle::Created;
            self.pending_commands
                .push(NativePanelHostShellCommand::Create);
        }
    }

    pub(crate) fn show(&mut self) {
        self.create();
        if self.lifecycle != NativePanelHostShellLifecycle::Visible {
            self.lifecycle = NativePanelHostShellLifecycle::Visible;
            self.pending_commands
                .push(NativePanelHostShellCommand::Show);
        }
    }

    pub(crate) fn hide(&mut self) {
        if !matches!(
            self.lifecycle,
            NativePanelHostShellLifecycle::Detached | NativePanelHostShellLifecycle::Hidden
        ) {
            self.lifecycle = NativePanelHostShellLifecycle::Hidden;
            self.pending_commands
                .push(NativePanelHostShellCommand::Hide);
        }
    }

    pub(crate) fn destroy(&mut self) -> bool {
        if self.lifecycle == NativePanelHostShellLifecycle::Detached {
            return false;
        }

        self.lifecycle = NativePanelHostShellLifecycle::Detached;
        self.last_window_state = None;
        self.pending_commands
            .push(NativePanelHostShellCommand::Destroy);
        true
    }

    pub(crate) fn sync_window_state(&mut self, window_state: NativePanelHostWindowState) {
        self.create();
        if self.last_window_state != Some(window_state) {
            self.last_window_state = Some(window_state);
            self.pending_commands
                .push(NativePanelHostShellCommand::SyncWindowState(window_state));
        }
    }

    pub(crate) fn request_redraw(&mut self) {
        self.redraw_requests += 1;
        self.pending_commands
            .push(NativePanelHostShellCommand::RequestRedraw);
    }

    pub(crate) fn sync_mouse_event_passthrough(&mut self, ignores_mouse_events: bool) {
        if self.last_ignores_mouse_events != Some(ignores_mouse_events) {
            self.last_ignores_mouse_events = Some(ignores_mouse_events);
            self.pending_commands
                .push(NativePanelHostShellCommand::SyncMouseEventPassthrough(
                    ignores_mouse_events,
                ));
        }
    }

    pub(crate) fn record_platform_loop_spawn(&mut self) {
        self.platform_loop_started = true;
        self.platform_loop_spawn_count += 1;
    }
}
