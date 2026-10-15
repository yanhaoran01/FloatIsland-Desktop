use super::host_window::WindowsNativePanelDrawFrame;

#[derive(Clone, Debug, Default)]
pub(super) struct WindowsNativePanelDrawPresenter {
    last_frame: Option<WindowsNativePanelDrawFrame>,
    redraw_requested: bool,
}

impl WindowsNativePanelDrawPresenter {
    pub(super) fn present(&mut self, frame: WindowsNativePanelDrawFrame) {
        self.last_frame = Some(frame);
        self.redraw_requested = true;
    }

    pub(super) fn redraw_requested(&self) -> bool {
        self.redraw_requested
    }

    pub(super) fn last_frame(&self) -> Option<&WindowsNativePanelDrawFrame> {
        self.last_frame.as_ref()
    }

    pub(super) fn take_redraw_frame(&mut self) -> Option<WindowsNativePanelDrawFrame> {
        if !self.redraw_requested {
            return None;
        }
        self.redraw_requested = false;
        self.last_frame.clone()
    }
}
