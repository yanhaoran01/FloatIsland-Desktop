use objc2_foundation::NSRect;

use super::panel_host_adapter::MacosNativePanelHostAdapter;
use super::panel_host_commands::current_native_panel_window_frame;
use super::panel_refs::native_panel_state;
use crate::native_panel_renderer::facade::{
    command::NativePanelPlatformEvent,
    descriptor::{
        NativePanelHostWindowDescriptor, NativePanelHostWindowState, NativePanelPointerRegion,
    },
    host::{NativePanelHost, NativePanelSceneHost, sync_runtime_pointer_regions_in_state},
};

#[allow(dead_code)]
#[derive(Default)]
pub(super) struct MacosNativePanelRuntimeHost {
    pub(super) adapter: MacosNativePanelHostAdapter,
}

impl NativePanelHost for MacosNativePanelRuntimeHost {
    type Error = String;
    type Renderer = <MacosNativePanelHostAdapter as NativePanelHost>::Renderer;

    fn renderer(&mut self) -> &mut Self::Renderer {
        self.adapter.renderer()
    }

    fn host_window_descriptor(&self) -> NativePanelHostWindowDescriptor {
        self.adapter.host_window_descriptor()
    }

    fn host_window_descriptor_mut(&mut self) -> &mut NativePanelHostWindowDescriptor {
        self.adapter.host_window_descriptor_mut()
    }

    fn window_state(&self) -> NativePanelHostWindowState {
        self.adapter.window_state()
    }

    fn show(&mut self) -> Result<(), Self::Error> {
        self.adapter.show()
    }

    fn hide(&mut self) -> Result<(), Self::Error> {
        self.adapter.hide()
    }

    fn sync_pointer_regions(
        &mut self,
        regions: &[NativePanelPointerRegion],
    ) -> Result<(), Self::Error> {
        self.adapter.sync_pointer_regions(regions)?;
        let _ = with_native_runtime_panel_state_mut(|state| {
            sync_runtime_pointer_regions_in_state(state, regions);
        });
        Ok(())
    }

    fn take_platform_events(&mut self) -> Vec<NativePanelPlatformEvent> {
        self.adapter.take_platform_events()
    }
}

impl NativePanelSceneHost for MacosNativePanelRuntimeHost {}

#[allow(dead_code)]
impl MacosNativePanelRuntimeHost {
    pub(super) fn capture() -> Option<Self> {
        let mut host = Self::default();
        host.refresh_from_runtime()?;
        Some(host)
    }

    pub(super) fn refresh_from_runtime(&mut self) -> Option<()> {
        let frame = current_native_panel_frame();
        let state = native_panel_state()?;
        let guard = state.lock().ok()?;
        self.sync_from_native_panel_state(&guard, frame);
        Some(())
    }

    pub(super) fn sync_from_native_panel_state(
        &mut self,
        state: &super::panel_types::NativePanelState,
        frame: Option<NSRect>,
    ) {
        self.adapter.sync_from_native_panel_state(state, frame);
    }
}

pub(super) fn with_native_runtime_panel_state_mut<T>(
    f: impl FnOnce(&mut super::panel_types::NativePanelState) -> T,
) -> Option<T> {
    native_panel_state()
        .and_then(|state_mutex| state_mutex.lock().ok().map(|mut state| f(&mut state)))
}

fn current_native_panel_frame() -> Option<NSRect> {
    unsafe { current_native_panel_window_frame() }
}
