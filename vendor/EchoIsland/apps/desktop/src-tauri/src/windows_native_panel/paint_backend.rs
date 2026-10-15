use crate::native_panel_renderer::facade::visual::{
    NativePanelVisualColor, NativePanelVisualPlan, NativePanelVisualPrimitive,
    NativePanelVisualTextAlignment, NativePanelVisualTextRole, NativePanelVisualTextWeight,
    resolve_native_panel_visual_plan,
};

use crate::native_panel_core::{PanelPoint, PanelRect};
use crate::native_panel_scene::SceneMascotPose;

use super::{
    d2d_painter::WindowsNativePanelPainter, window_shell::WindowsNativePanelShellPaintJob,
};

#[cfg(all(windows, not(test)))]
thread_local! {
    static DIRECT2D_WINDOWS_NATIVE_PANEL_PAINTER:
        std::cell::RefCell<Option<super::d2d_painter::Direct2DWindowsNativePanelPainter>> =
            const { std::cell::RefCell::new(None) };
}

pub(super) const WINDOWS_NATIVE_PANEL_TRANSPARENT_COLOR_KEY: u32 = 0x00FF00FF;

pub(super) type WindowsNativePanelPaintColor = NativePanelVisualColor;
pub(super) type WindowsNativePanelPaintPlan = NativePanelVisualPlan;
pub(super) type WindowsNativePanelPaintPrimitive = NativePanelVisualPrimitive;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum WindowsNativePanelPainterBackend {
    Direct2D,
    GdiFallback,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) enum WindowsNativePanelPaintOperation {
    PushClip {
        frame: PanelRect,
    },
    PopClip,
    DrawCompletionGlowImage {
        frame: PanelRect,
        opacity: f64,
    },
    DrawMascotSprite {
        sprite_path: String,
        source_rect: PanelRect,
        frame: PanelRect,
        opacity: f64,
    },
    FillHitTestBlocker {
        frame: PanelRect,
        alpha: u8,
    },
    FillRoundRect {
        frame: PanelRect,
        radius: f64,
        color: WindowsNativePanelPaintColor,
        alpha: f64,
    },
    FillRect {
        frame: PanelRect,
        color: WindowsNativePanelPaintColor,
        alpha: f64,
    },
    FillEllipse {
        frame: PanelRect,
        color: WindowsNativePanelPaintColor,
        alpha: f64,
    },
    StrokeLine {
        from: PanelPoint,
        to: PanelPoint,
        color: WindowsNativePanelPaintColor,
        width: i32,
        alpha: f64,
    },
    DrawText {
        role: NativePanelVisualTextRole,
        origin: PanelPoint,
        max_width: f64,
        text: String,
        color: WindowsNativePanelPaintColor,
        size: i32,
        weight: NativePanelVisualTextWeight,
        alignment: NativePanelVisualTextAlignment,
        alpha: f64,
    },
    FillMascotDot {
        frame: PanelRect,
        radius: f64,
        pose: SceneMascotPose,
        color: WindowsNativePanelPaintColor,
        stroke_color: WindowsNativePanelPaintColor,
        stroke_width: f64,
        shadow_opacity: f64,
        shadow_radius: f64,
        alpha: f64,
    },
    FillCompactShoulder {
        frame: PanelRect,
        side: crate::native_panel_renderer::facade::visual::NativePanelVisualShoulderSide,
        progress: f64,
        fill: WindowsNativePanelPaintColor,
        border: WindowsNativePanelPaintColor,
    },
}

const WINDOWS_NATIVE_PANEL_HIT_TEST_BLOCKER_ALPHA: u8 = 1;

pub(super) fn resolve_windows_native_panel_paint_plan(
    job: &WindowsNativePanelShellPaintJob,
) -> WindowsNativePanelPaintPlan {
    resolve_native_panel_visual_plan(job)
}

pub(super) fn windows_native_panel_preferred_painter_backend() -> WindowsNativePanelPainterBackend {
    WindowsNativePanelPainterBackend::Direct2D
}

pub(super) fn windows_native_panel_composition_mode_for_preferred_painter()
-> super::layered_window::WindowsLayeredWindowCompositionMode {
    match windows_native_panel_preferred_painter_backend() {
        WindowsNativePanelPainterBackend::Direct2D => {
            super::layered_window::WindowsLayeredWindowCompositionMode::PerPixelAlpha
        }
        WindowsNativePanelPainterBackend::GdiFallback => {
            super::layered_window::WindowsLayeredWindowCompositionMode::GdiColorKeyFallback
        }
    }
}

pub(super) fn resolve_windows_native_panel_paint_operations(
    plan: &WindowsNativePanelPaintPlan,
) -> Vec<WindowsNativePanelPaintOperation> {
    if plan.hidden {
        return Vec::new();
    }

    plan.primitives
        .iter()
        .map(windows_native_panel_paint_operation_from_primitive)
        .collect()
}

pub(super) fn resolve_windows_native_panel_hit_test_blocker_operations(
    job: &WindowsNativePanelShellPaintJob,
) -> Vec<WindowsNativePanelPaintOperation> {
    if job.display_mode
        != crate::native_panel_renderer::facade::presentation::NativePanelVisualDisplayMode::Expanded
    {
        return Vec::new();
    }

    let mut operations = Vec::new();
    push_hit_test_blocker_operation(&mut operations, job.shell_frame);

    let content_top = job.content_frame.y + job.content_frame.height;
    let gap_y = job.shell_frame.y + job.shell_frame.height;
    push_hit_test_blocker_operation(
        &mut operations,
        PanelRect {
            x: job.shell_frame.x,
            y: gap_y,
            width: job.shell_frame.width,
            height: (content_top - gap_y).max(0.0),
        },
    );

    operations
}

fn push_hit_test_blocker_operation(
    operations: &mut Vec<WindowsNativePanelPaintOperation>,
    frame: PanelRect,
) {
    if frame.width <= 0.0 || frame.height <= 0.0 {
        return;
    }
    operations.push(WindowsNativePanelPaintOperation::FillHitTestBlocker {
        frame,
        alpha: WINDOWS_NATIVE_PANEL_HIT_TEST_BLOCKER_ALPHA,
    });
}

fn windows_native_panel_paint_operation_from_primitive(
    primitive: &WindowsNativePanelPaintPrimitive,
) -> WindowsNativePanelPaintOperation {
    match primitive {
        WindowsNativePanelPaintPrimitive::ClipStart { frame } => {
            WindowsNativePanelPaintOperation::PushClip { frame: *frame }
        }
        WindowsNativePanelPaintPrimitive::ClipEnd => WindowsNativePanelPaintOperation::PopClip,
        WindowsNativePanelPaintPrimitive::CompletionGlow { frame, opacity } => {
            WindowsNativePanelPaintOperation::DrawCompletionGlowImage {
                frame: *frame,
                opacity: *opacity,
            }
        }
        WindowsNativePanelPaintPrimitive::RoundRect {
            frame,
            radius,
            color,
        } => WindowsNativePanelPaintOperation::FillRoundRect {
            frame: *frame,
            radius: *radius,
            color: *color,
            alpha: 1.0,
        },
        WindowsNativePanelPaintPrimitive::Rect { frame, color } => {
            WindowsNativePanelPaintOperation::FillRect {
                frame: *frame,
                color: *color,
                alpha: 1.0,
            }
        }
        WindowsNativePanelPaintPrimitive::Ellipse { frame, color } => {
            WindowsNativePanelPaintOperation::FillEllipse {
                frame: *frame,
                color: *color,
                alpha: 1.0,
            }
        }
        WindowsNativePanelPaintPrimitive::MascotRoundRect {
            frame,
            radius,
            color,
            alpha,
            ..
        } => WindowsNativePanelPaintOperation::FillRoundRect {
            frame: *frame,
            radius: *radius,
            color: *color,
            alpha: *alpha,
        },
        WindowsNativePanelPaintPrimitive::MascotEllipse {
            frame,
            color,
            alpha,
            ..
        } => WindowsNativePanelPaintOperation::FillEllipse {
            frame: *frame,
            color: *color,
            alpha: *alpha,
        },
        WindowsNativePanelPaintPrimitive::StrokeLine {
            from,
            to,
            color,
            width,
        } => WindowsNativePanelPaintOperation::StrokeLine {
            from: *from,
            to: *to,
            color: *color,
            width: *width,
            alpha: 1.0,
        },
        WindowsNativePanelPaintPrimitive::Text {
            role,
            origin,
            max_width,
            text,
            color,
            size,
            weight,
            alignment,
            alpha,
        } => WindowsNativePanelPaintOperation::DrawText {
            role: *role,
            origin: *origin,
            max_width: *max_width,
            text: text.clone(),
            color: *color,
            size: *size,
            weight: *weight,
            alignment: *alignment,
            alpha: *alpha,
        },
        WindowsNativePanelPaintPrimitive::MascotText {
            origin,
            max_width,
            text,
            color,
            size,
            weight,
            alignment,
            alpha,
            ..
        } => WindowsNativePanelPaintOperation::DrawText {
            role: NativePanelVisualTextRole::Unspecified,
            origin: *origin,
            max_width: *max_width,
            text: text.clone(),
            color: *color,
            size: *size,
            weight: *weight,
            alignment: *alignment,
            alpha: *alpha,
        },
        WindowsNativePanelPaintPrimitive::MascotDot {
            frame,
            corner_radius,
            pose,
            fill,
            stroke,
            stroke_width,
            shadow_opacity,
            shadow_radius,
            alpha,
            ..
        } => WindowsNativePanelPaintOperation::FillMascotDot {
            frame: *frame,
            radius: *corner_radius,
            pose: *pose,
            color: *fill,
            stroke_color: *stroke,
            stroke_width: *stroke_width,
            shadow_opacity: *shadow_opacity,
            shadow_radius: *shadow_radius,
            alpha: *alpha,
        },
        WindowsNativePanelPaintPrimitive::MascotSprite {
            sprite_path,
            source_rect,
            frame,
            opacity,
        } => WindowsNativePanelPaintOperation::DrawMascotSprite {
            sprite_path: sprite_path.clone(),
            source_rect: *source_rect,
            frame: *frame,
            opacity: *opacity,
        },
        WindowsNativePanelPaintPrimitive::CompactShoulder {
            frame,
            side,
            progress,
            fill,
            border,
        } => WindowsNativePanelPaintOperation::FillCompactShoulder {
            frame: *frame,
            side: *side,
            progress: *progress,
            fill: *fill,
            border: *border,
        },
    }
}

pub(super) fn paint_windows_native_panel_job(
    raw_window_handle: Option<isize>,
    job: &WindowsNativePanelShellPaintJob,
) -> Result<WindowsNativePanelPaintPlan, String> {
    #[cfg(all(windows, not(test)))]
    {
        match windows_native_panel_preferred_painter_backend() {
            WindowsNativePanelPainterBackend::Direct2D => {
                paint_windows_native_panel_job_with_direct2d(raw_window_handle, job)
            }
            WindowsNativePanelPainterBackend::GdiFallback => {
                let mut painter =
                    super::d2d_painter::GdiWindowsNativePanelPainter::new(raw_window_handle);
                painter.paint(job)
            }
        }
    }

    #[cfg(any(not(windows), test))]
    {
        let _ = raw_window_handle;
        let mut painter = super::d2d_painter::PlanOnlyWindowsNativePanelPainter;
        painter.paint(job)
    }
}

#[cfg(all(windows, not(test)))]
fn paint_windows_native_panel_job_with_direct2d(
    raw_window_handle: Option<isize>,
    job: &WindowsNativePanelShellPaintJob,
) -> Result<WindowsNativePanelPaintPlan, String> {
    DIRECT2D_WINDOWS_NATIVE_PANEL_PAINTER.with(|slot| {
        let mut slot = slot.borrow_mut();
        if slot.is_none() {
            *slot = Some(super::d2d_painter::Direct2DWindowsNativePanelPainter::new(
                raw_window_handle,
            )?);
        }
        let painter = slot
            .as_mut()
            .expect("Direct2D painter initialized when slot is Some");
        painter.set_raw_window_handle(raw_window_handle);
        painter.paint(job)
    })
}

#[cfg(all(windows, not(test)))]
pub(super) fn paint_windows_native_panel_job_with_gdi(
    raw_window_handle: Option<isize>,
    job: &WindowsNativePanelShellPaintJob,
) -> Result<WindowsNativePanelPaintPlan, String> {
    use std::iter;
    use windows_sys::Win32::{
        Foundation::RECT,
        Graphics::Gdi::{
            CreatePen, CreateSolidBrush, DT_END_ELLIPSIS, DT_SINGLELINE, DT_VCENTER, DeleteObject,
            DrawTextW, Ellipse, FillRect, GetDC, GetStockObject, IntersectClipRect, LineTo,
            MoveToEx, NULL_PEN, PS_SOLID, ReleaseDC, RestoreDC, RoundRect, SaveDC, SelectObject,
            SetBkMode, SetTextColor, TRANSPARENT,
        },
        UI::WindowsAndMessaging::GetClientRect,
    };

    let plan = resolve_windows_native_panel_paint_plan(job);
    let operations = resolve_windows_native_panel_paint_operations(&plan);
    let Some(hwnd) = raw_window_handle else {
        return Ok(plan);
    };

    unsafe {
        let hdc = GetDC(hwnd as _);
        if hdc.is_null() {
            return Err(std::io::Error::last_os_error().to_string());
        }

        let clear_brush = CreateSolidBrush(WINDOWS_NATIVE_PANEL_TRANSPARENT_COLOR_KEY);
        let mut client_rect = std::mem::zeroed::<RECT>();
        if GetClientRect(hwnd as _, &mut client_rect) != 0 {
            let _ = FillRect(hdc, &client_rect, clear_brush);
        }
        let _ = DeleteObject(clear_brush as _);

        for operation in &operations {
            match operation {
                WindowsNativePanelPaintOperation::PushClip { frame } => {
                    let _ = SaveDC(hdc);
                    let _ = IntersectClipRect(
                        hdc,
                        frame.x.round() as i32,
                        frame.y.round() as i32,
                        (frame.x + frame.width).round() as i32,
                        (frame.y + frame.height).round() as i32,
                    );
                }
                WindowsNativePanelPaintOperation::PopClip => {
                    let _ = RestoreDC(hdc, -1);
                }
                WindowsNativePanelPaintOperation::DrawCompletionGlowImage { .. } => {}
                WindowsNativePanelPaintOperation::DrawMascotSprite { .. } => {}
                WindowsNativePanelPaintOperation::FillHitTestBlocker { .. } => {}
                WindowsNativePanelPaintOperation::FillRoundRect {
                    frame,
                    radius,
                    color,
                    ..
                } => {
                    let brush = CreateSolidBrush(color_ref(*color));
                    let pen = GetStockObject(NULL_PEN);
                    let previous = SelectObject(hdc, brush as _);
                    let previous_pen = SelectObject(hdc, pen);
                    let _ = RoundRect(
                        hdc,
                        frame.x.round() as i32,
                        frame.y.round() as i32,
                        (frame.x + frame.width).round() as i32,
                        (frame.y + frame.height).round() as i32,
                        (radius * 2.0).round() as i32,
                        (radius * 2.0).round() as i32,
                    );
                    let _ = SelectObject(hdc, previous_pen);
                    let _ = SelectObject(hdc, previous);
                    let _ = DeleteObject(brush as _);
                }
                WindowsNativePanelPaintOperation::FillRect { frame, color, .. } => {
                    let brush = CreateSolidBrush(color_ref(*color));
                    let rect = rect_from_panel_rect(*frame);
                    let _ = FillRect(hdc, &rect, brush);
                    let _ = DeleteObject(brush as _);
                }
                WindowsNativePanelPaintOperation::FillEllipse { frame, color, .. } => {
                    let brush = CreateSolidBrush(color_ref(*color));
                    let pen = GetStockObject(NULL_PEN);
                    let previous = SelectObject(hdc, brush as _);
                    let previous_pen = SelectObject(hdc, pen);
                    let _ = Ellipse(
                        hdc,
                        frame.x.round() as i32,
                        frame.y.round() as i32,
                        (frame.x + frame.width).round() as i32,
                        (frame.y + frame.height).round() as i32,
                    );
                    let _ = SelectObject(hdc, previous_pen);
                    let _ = SelectObject(hdc, previous);
                    let _ = DeleteObject(brush as _);
                }
                WindowsNativePanelPaintOperation::StrokeLine {
                    from,
                    to,
                    color,
                    width,
                    ..
                } => {
                    let pen = CreatePen(PS_SOLID, *width, color_ref(*color));
                    let previous = SelectObject(hdc, pen as _);
                    let _ = MoveToEx(
                        hdc,
                        from.x.round() as i32,
                        from.y.round() as i32,
                        std::ptr::null_mut(),
                    );
                    let _ = LineTo(hdc, to.x.round() as i32, to.y.round() as i32);
                    let _ = SelectObject(hdc, previous);
                    let _ = DeleteObject(pen as _);
                }
                WindowsNativePanelPaintOperation::DrawText {
                    role,
                    origin,
                    max_width,
                    text,
                    color,
                    size,
                    alignment,
                    ..
                } => {
                    let _ = SetBkMode(hdc, TRANSPARENT as i32);
                    let _ = SetTextColor(hdc, color_ref(*color));
                    let mut wide: Vec<u16> = text.encode_utf16().chain(iter::once(0)).collect();
                    let mut rect = RECT {
                        left: origin.x.round() as i32,
                        top: origin.y.round() as i32,
                        right: (origin.x + max_width).round() as i32,
                        bottom: (origin.y
                            + crate::native_panel_renderer::facade::visual::native_panel_visual_text_box_height_for_role(
                                *role, text, *size,
                            ))
                        .round() as i32,
                    };
                    let _ = DrawTextW(
                        hdc,
                        wide.as_mut_ptr(),
                        -1,
                        &mut rect,
                        DT_SINGLELINE
                            | DT_VCENTER
                            | gdi_text_alignment(*alignment)
                            | DT_END_ELLIPSIS,
                    );
                }
                WindowsNativePanelPaintOperation::FillMascotDot {
                    frame,
                    radius,
                    color,
                    stroke_color,
                    stroke_width,
                    ..
                } => {
                    let brush = CreateSolidBrush(color_ref(*color));
                    let pen = CreatePen(
                        PS_SOLID,
                        stroke_width.round().max(1.0) as i32,
                        color_ref(*stroke_color),
                    );
                    let previous = SelectObject(hdc, brush as _);
                    let previous_pen = SelectObject(hdc, pen as _);
                    let _ = RoundRect(
                        hdc,
                        frame.x.round() as i32,
                        frame.y.round() as i32,
                        (frame.x + frame.width).round() as i32,
                        (frame.y + frame.height).round() as i32,
                        (radius * 2.0).round() as i32,
                        (radius * 2.0).round() as i32,
                    );
                    let _ = SelectObject(hdc, previous_pen);
                    let _ = SelectObject(hdc, previous);
                    let _ = DeleteObject(pen as _);
                    let _ = DeleteObject(brush as _);
                }
                WindowsNativePanelPaintOperation::FillCompactShoulder { frame, fill, .. } => {
                    let brush = CreateSolidBrush(color_ref(*fill));
                    let rect = rect_from_panel_rect(*frame);
                    let _ = FillRect(hdc, &rect, brush);
                    let _ = DeleteObject(brush as _);
                }
            }
        }

        let _ = ReleaseDC(hwnd as _, hdc);
    }

    Ok(plan)
}

#[cfg(all(windows, not(test)))]
fn color_ref(color: WindowsNativePanelPaintColor) -> u32 {
    color.r as u32 | ((color.g as u32) << 8) | ((color.b as u32) << 16)
}

#[cfg(all(windows, not(test)))]
fn rect_from_panel_rect(rect: PanelRect) -> windows_sys::Win32::Foundation::RECT {
    windows_sys::Win32::Foundation::RECT {
        left: rect.x.round() as i32,
        top: rect.y.round() as i32,
        right: (rect.x + rect.width).round() as i32,
        bottom: (rect.y + rect.height).round() as i32,
    }
}

#[cfg(all(windows, not(test)))]
fn gdi_text_alignment(alignment: NativePanelVisualTextAlignment) -> u32 {
    use windows_sys::Win32::Graphics::Gdi::{DT_CENTER, DT_LEFT, DT_RIGHT};

    match alignment {
        NativePanelVisualTextAlignment::Left => DT_LEFT,
        NativePanelVisualTextAlignment::Center => DT_CENTER,
        NativePanelVisualTextAlignment::Right => DT_RIGHT,
    }
}
