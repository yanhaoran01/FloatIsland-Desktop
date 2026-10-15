use crate::{
    native_panel_core::PanelPoint,
    native_panel_renderer::facade::descriptor::{
        NativePanelInteractionPlan, NativePanelPointerRegion,
    },
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum WindowsNativePanelHitTest {
    Client,
    Transparent,
}

pub(super) fn resolve_windows_native_panel_hit_test(
    regions: &[NativePanelPointerRegion],
    point: PanelPoint,
) -> WindowsNativePanelHitTest {
    if NativePanelInteractionPlan::from_pointer_regions(regions).inside_regions(point) {
        WindowsNativePanelHitTest::Client
    } else {
        WindowsNativePanelHitTest::Transparent
    }
}
