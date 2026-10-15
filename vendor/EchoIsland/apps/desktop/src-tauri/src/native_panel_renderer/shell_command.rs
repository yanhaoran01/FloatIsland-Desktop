use super::descriptors::NativePanelHostWindowState;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum NativePanelHostShellCommand {
    Create,
    Show,
    Hide,
    Destroy,
    SyncWindowState(NativePanelHostWindowState),
    SyncMouseEventPassthrough(bool),
    RequestRedraw,
}

pub(crate) trait NativePanelHostShellCommandBackend {
    type RawWindowHandle: Copy;
    type Error;

    fn create_shell_window(
        &mut self,
        raw_window_handle: Option<Self::RawWindowHandle>,
    ) -> Result<Option<Self::RawWindowHandle>, Self::Error>;

    fn destroy_shell_window(
        &mut self,
        raw_window_handle: Option<Self::RawWindowHandle>,
    ) -> Result<Option<Self::RawWindowHandle>, Self::Error>;

    fn set_shell_window_visible(
        &mut self,
        raw_window_handle: Option<Self::RawWindowHandle>,
        visible: bool,
    ) -> Result<(), Self::Error>;

    fn sync_shell_window_state(
        &mut self,
        raw_window_handle: Option<Self::RawWindowHandle>,
        window_state: NativePanelHostWindowState,
    ) -> Result<(), Self::Error>;

    fn sync_shell_mouse_event_passthrough(
        &mut self,
        raw_window_handle: Option<Self::RawWindowHandle>,
        ignores_mouse_events: bool,
    ) -> Result<(), Self::Error>;

    fn request_shell_redraw(
        &mut self,
        raw_window_handle: Option<Self::RawWindowHandle>,
    ) -> Result<(), Self::Error>;

    fn record_shell_command_applied(&mut self, raw_window_handle: Option<Self::RawWindowHandle>);
}

pub(crate) fn apply_native_panel_host_shell_command<B>(
    backend: &mut B,
    raw_window_handle: &mut Option<B::RawWindowHandle>,
    command: NativePanelHostShellCommand,
) -> Result<(), B::Error>
where
    B: NativePanelHostShellCommandBackend,
{
    match command {
        NativePanelHostShellCommand::Create => {
            *raw_window_handle = backend.create_shell_window(*raw_window_handle)?;
        }
        NativePanelHostShellCommand::Show => {
            backend.set_shell_window_visible(*raw_window_handle, true)?;
        }
        NativePanelHostShellCommand::Hide => {
            backend.set_shell_window_visible(*raw_window_handle, false)?;
        }
        NativePanelHostShellCommand::Destroy => {
            *raw_window_handle = backend.destroy_shell_window(*raw_window_handle)?;
        }
        NativePanelHostShellCommand::SyncWindowState(window_state) => {
            backend.sync_shell_window_state(*raw_window_handle, window_state)?;
        }
        NativePanelHostShellCommand::SyncMouseEventPassthrough(ignores_mouse_events) => {
            backend.sync_shell_mouse_event_passthrough(*raw_window_handle, ignores_mouse_events)?;
        }
        NativePanelHostShellCommand::RequestRedraw => {
            backend.request_shell_redraw(*raw_window_handle)?;
        }
    }
    backend.record_shell_command_applied(*raw_window_handle);
    Ok(())
}
