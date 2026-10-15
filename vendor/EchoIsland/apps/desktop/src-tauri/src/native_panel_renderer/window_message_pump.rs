use crate::native_panel_core::PanelRect;

use super::descriptors::{
    NativePanelPlatformEvent, NativePanelPointerInputOutcome,
    NativePanelQueuedRuntimeCommandHandler, NativePanelRuntimeCommandHandler,
    NativePanelRuntimeInputDescriptor, native_panel_runtime_input_descriptor_with_screen_frame,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativePanelPlatformWindowMessage {
    pub(crate) message_id: u32,
    pub(crate) lparam: isize,
}

pub(crate) trait NativePanelPlatformWindowMessagePump {
    fn take_platform_window_messages_for_pump(&mut self) -> Vec<NativePanelPlatformWindowMessage>;

    fn platform_window_message_screen_frame(&self) -> Option<PanelRect>;

    fn record_platform_window_message_processed(&mut self, message_id: u32);

    fn is_platform_paint_message(&self, message_id: u32) -> bool;

    fn dispatch_platform_paint_message(&mut self) -> Result<(), String>;

    fn handle_platform_window_message_with_handler(
        &mut self,
        message_id: u32,
        lparam: isize,
        input: &NativePanelRuntimeInputDescriptor,
        handler: &mut impl NativePanelRuntimeCommandHandler<Error = String>,
    ) -> Result<Option<NativePanelPointerInputOutcome>, String>;

    fn pending_platform_events_mut(&mut self) -> &mut Vec<NativePanelPlatformEvent>;
}

pub(crate) fn pump_native_panel_platform_window_messages<R>(runtime: &mut R) -> Result<(), String>
where
    R: NativePanelPlatformWindowMessagePump,
{
    let queued_messages = runtime.take_platform_window_messages_for_pump();
    if queued_messages.is_empty() {
        return Ok(());
    }

    let input = native_panel_runtime_input_descriptor_with_screen_frame(
        runtime.platform_window_message_screen_frame(),
    );
    let mut handler = NativePanelQueuedRuntimeCommandHandler::default();
    for message in queued_messages {
        runtime.record_platform_window_message_processed(message.message_id);
        if runtime.is_platform_paint_message(message.message_id) {
            runtime.dispatch_platform_paint_message()?;
            continue;
        }
        let _ = runtime.handle_platform_window_message_with_handler(
            message.message_id,
            message.lparam,
            &input,
            &mut handler,
        )?;
    }
    runtime
        .pending_platform_events_mut()
        .extend(handler.take_events());
    Ok(())
}
