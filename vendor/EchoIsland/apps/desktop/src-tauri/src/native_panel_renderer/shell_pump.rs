use super::shell_command::NativePanelHostShellCommand;

pub(crate) trait NativePanelHostShellRuntimePump {
    type RawWindowHandle: Copy + PartialEq;
    type Error;

    fn has_pending_shell_destroy_command(&self) -> bool;

    fn consume_presenter_into_shell_for_pump(&mut self);

    fn raw_shell_window_handle(&self) -> Option<Self::RawWindowHandle>;

    fn take_pending_shell_commands_for_pump(&mut self) -> Vec<NativePanelHostShellCommand>;

    fn apply_shell_command_for_pump(
        &mut self,
        raw_window_handle: &mut Option<Self::RawWindowHandle>,
        command: NativePanelHostShellCommand,
    ) -> Result<(), Self::Error>;

    fn sync_raw_shell_window_handle(&mut self, raw_window_handle: Option<Self::RawWindowHandle>);

    fn pump_platform_window_messages(&mut self) -> Result<(), Self::Error>;
}

pub(crate) fn pump_native_panel_host_shell_runtime<R>(runtime: &mut R) -> Result<(), R::Error>
where
    R: NativePanelHostShellRuntimePump,
{
    if !runtime.has_pending_shell_destroy_command() {
        runtime.consume_presenter_into_shell_for_pump();
    }

    let mut raw_window_handle = runtime.raw_shell_window_handle();
    for command in runtime.take_pending_shell_commands_for_pump() {
        runtime.apply_shell_command_for_pump(&mut raw_window_handle, command)?;
    }

    if runtime.raw_shell_window_handle() != raw_window_handle {
        runtime.sync_raw_shell_window_handle(raw_window_handle);
    }

    runtime.pump_platform_window_messages()
}
