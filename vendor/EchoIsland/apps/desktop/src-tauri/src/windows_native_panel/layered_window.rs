use crate::native_panel_core::PanelRect;

use super::dpi::WindowsDpiScale;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum WindowsLayeredWindowCompositionMode {
    PerPixelAlpha,
    GdiColorKeyFallback,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct WindowsLayeredBitmapSize {
    pub(super) width: i32,
    pub(super) height: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct WindowsLayeredAlphaBitmap {
    size: WindowsLayeredBitmapSize,
    pixels: Vec<u8>,
}

impl WindowsLayeredBitmapSize {
    pub(super) fn from_logical_frame(frame: PanelRect, dpi_scale: WindowsDpiScale) -> Self {
        let physical = dpi_scale.rect_to_physical(frame);
        Self {
            width: physical.width.max(1),
            height: physical.height.max(1),
        }
    }

    pub(super) fn stride(self) -> usize {
        self.width.max(1) as usize * 4
    }

    pub(super) fn byte_len(self) -> usize {
        self.stride() * self.height.max(1) as usize
    }
}

impl WindowsLayeredAlphaBitmap {
    pub(super) fn new(size: WindowsLayeredBitmapSize) -> Self {
        Self {
            size,
            pixels: vec![0; size.byte_len()],
        }
    }

    pub(super) fn resize_for_frame(
        &mut self,
        frame: PanelRect,
        dpi_scale: WindowsDpiScale,
    ) -> bool {
        let next_size = WindowsLayeredBitmapSize::from_logical_frame(frame, dpi_scale);
        if next_size == self.size {
            return false;
        }
        self.size = next_size;
        self.pixels.resize(next_size.byte_len(), 0);
        true
    }

    pub(super) fn clear_transparent(&mut self) {
        self.pixels.fill(0);
    }

    pub(super) fn size(&self) -> WindowsLayeredBitmapSize {
        self.size
    }

    pub(super) fn pixels(&self) -> &[u8] {
        &self.pixels
    }
}

pub(super) fn windows_layered_window_composition_mode_for_painter(
    per_pixel_alpha_ready: bool,
) -> WindowsLayeredWindowCompositionMode {
    if per_pixel_alpha_ready {
        WindowsLayeredWindowCompositionMode::PerPixelAlpha
    } else {
        WindowsLayeredWindowCompositionMode::GdiColorKeyFallback
    }
}

#[cfg(all(windows, not(test)))]
pub(super) fn apply_windows_layered_window_initial_attributes(
    hwnd: windows_sys::Win32::Foundation::HWND,
    mode: WindowsLayeredWindowCompositionMode,
    transparent_color_key: u32,
) -> Result<(), String> {
    match mode {
        WindowsLayeredWindowCompositionMode::PerPixelAlpha => Ok(()),
        WindowsLayeredWindowCompositionMode::GdiColorKeyFallback => {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                LWA_ALPHA, LWA_COLORKEY, SetLayeredWindowAttributes,
            };

            unsafe {
                let _ = SetLayeredWindowAttributes(
                    hwnd,
                    transparent_color_key,
                    255,
                    LWA_ALPHA | LWA_COLORKEY,
                );
            }
            Ok(())
        }
    }
}

#[cfg(any(not(windows), test))]
pub(super) fn apply_windows_layered_window_initial_attributes(
    _hwnd: isize,
    _mode: WindowsLayeredWindowCompositionMode,
    _transparent_color_key: u32,
) -> Result<(), String> {
    Ok(())
}
