use objc2_app_kit::{NSColor, NSFont, NSTextAlignment, NSTextField, NSView};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
use std::{cell::RefCell, collections::HashMap};

use crate::native_panel_core::{PanelPoint, PanelRect};
use crate::native_panel_renderer::facade::{
    descriptor::NativePanelEdgeAction,
    presentation::NativePanelPresentationModel,
    visual::{
        NativePanelVisualColor, NativePanelVisualPlan, NativePanelVisualPrimitive,
        NativePanelVisualShoulderSide, NativePanelVisualTextRole, NativePanelVisualTextWeight,
        native_panel_visual_compact_shoulder_primitive, native_panel_visual_text_primitive_by_role,
    },
};

use super::super::panel_helpers::ns_color;
use super::super::panel_refs::NativePanelRefs;
use super::super::panel_shoulder::apply_shoulder_path_scale_x;
use super::super::panel_types::NativePanelLayout;
use super::super::text_metrics::{
    centered_child_origin, font_for_visual_weight, macos_action_icon_font_size,
    macos_action_icon_glyph_offset_y, macos_text_frame_height,
    macos_text_frame_origin_for_visual_center,
};

const SETTINGS_VISUAL_ICON_TEXT: &str = "\u{E713}";
const SETTINGS_MACOS_ICON_TEXT: &str = "\u{2699}";
const QUIT_VISUAL_ICON_TEXT: &str = "\u{E7E8}";
const QUIT_MACOS_ICON_TEXT: &str = "\u{23FB}";

#[derive(Clone, Debug, PartialEq)]
struct MacosActionIconPrimitive {
    role: NativePanelVisualTextRole,
    origin: PanelPoint,
    max_width: f64,
    text: String,
    color: NativePanelVisualColor,
    size: i32,
    weight: NativePanelVisualTextWeight,
    alpha: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct MacosRoundRectPrimitive {
    frame: PanelRect,
    radius: f64,
    color: NativePanelVisualColor,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct MacosShoulderPrimitive {
    frame: PanelRect,
    side: NativePanelVisualShoulderSide,
    progress: f64,
    fill: NativePanelVisualColor,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct MacosLabelStaticState {
    text: Option<String>,
    color: NativePanelVisualColor,
    font_size_bits: u64,
    weight: NativePanelVisualTextWeight,
    alignment: Option<MacosLabelAlignment>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MacosLabelAlignment {
    Center,
}

thread_local! {
    static MACOS_LABEL_STATIC_STATE: RefCell<HashMap<usize, MacosLabelStaticState>> =
        RefCell::new(HashMap::new());
}

pub(in crate::macos_native_panel) fn apply_macos_visual_plan_compact_primitives(
    refs: &NativePanelRefs,
    layout: &NativePanelLayout,
    presentation: &NativePanelPresentationModel,
    plan: &NativePanelVisualPlan,
) {
    apply_compact_background_primitives(refs, layout, plan);
    apply_compact_bar_text_primitives(refs, layout, presentation, plan);
    apply_action_button_icon_primitive(
        refs.settings_button,
        refs.settings_button_label,
        macos_action_icon_primitive(plan, NativePanelEdgeAction::Settings),
    );
    apply_action_button_icon_primitive(
        refs.quit_button,
        refs.quit_button_label,
        macos_action_icon_primitive(plan, NativePanelEdgeAction::Quit),
    );
}

fn apply_compact_background_primitives(
    refs: &NativePanelRefs,
    layout: &NativePanelLayout,
    plan: &NativePanelVisualPlan,
) {
    if let Some(pill) = compact_pill_primitive(plan, panel_rect_from_ns_rect(layout.pill_frame))
        && let Some(layer) = refs.pill_view.layer()
    {
        layer.setBackgroundColor(Some(&ns_color(visual_color(pill.color)).CGColor()));
    }
    apply_compact_shoulder_primitive(refs.left_shoulder, compact_shoulder_primitive(plan, true));
    apply_compact_shoulder_primitive(refs.right_shoulder, compact_shoulder_primitive(plan, false));
}

fn compact_pill_primitive(
    plan: &NativePanelVisualPlan,
    pill_frame: PanelRect,
) -> Option<MacosRoundRectPrimitive> {
    plan.primitives.iter().find_map(|primitive| {
        let NativePanelVisualPrimitive::RoundRect {
            frame,
            radius,
            color,
        } = primitive
        else {
            return None;
        };
        rects_nearly_equal(*frame, pill_frame).then_some(MacosRoundRectPrimitive {
            frame: *frame,
            radius: *radius,
            color: *color,
        })
    })
}

fn compact_shoulder_primitive(
    plan: &NativePanelVisualPlan,
    left: bool,
) -> Option<MacosShoulderPrimitive> {
    let expected_side = if left {
        NativePanelVisualShoulderSide::Left
    } else {
        NativePanelVisualShoulderSide::Right
    };
    let NativePanelVisualPrimitive::CompactShoulder {
        frame,
        side,
        progress,
        fill,
        ..
    } = native_panel_visual_compact_shoulder_primitive(plan, expected_side)?
    else {
        return None;
    };
    Some(MacosShoulderPrimitive {
        frame: *frame,
        side: *side,
        progress: *progress,
        fill: *fill,
    })
}

fn apply_compact_shoulder_primitive(shoulder: &NSView, primitive: Option<MacosShoulderPrimitive>) {
    let Some(primitive) = primitive else {
        return;
    };
    let anchor_on_right = primitive.side == NativePanelVisualShoulderSide::Left;
    apply_shoulder_path_scale_x(
        shoulder,
        ns_rect_from_panel_rect(primitive.frame),
        primitive.progress,
        anchor_on_right,
    );
    let Some(layer) = shoulder.layer() else {
        return;
    };
    let Ok(shape_layer) = layer.downcast::<objc2_quartz_core::CAShapeLayer>() else {
        return;
    };
    shape_layer.setFillColor(Some(&ns_color(visual_color(primitive.fill)).CGColor()));
}

fn apply_compact_bar_text_primitives(
    refs: &NativePanelRefs,
    layout: &NativePanelLayout,
    presentation: &NativePanelPresentationModel,
    plan: &NativePanelVisualPlan,
) {
    if let Some(headline) = compact_headline_primitive(plan) {
        apply_text_primitive_to_label(refs.headline, layout, &headline);
    } else {
        refs.headline.setHidden(true);
    }
    if let Some(slash) = compact_slash_primitive(plan) {
        apply_metric_text_primitive_to_label(refs.slash, &slash);
    } else {
        refs.slash.setHidden(true);
    }
    if let Some(total) = compact_total_count_primitive(plan, &presentation.compact_bar.total_count)
    {
        apply_metric_text_primitive_to_label(refs.total_count, &total);
    } else {
        refs.total_count.setHidden(true);
    }
    if let Some(active) =
        compact_active_count_primitive(plan, &presentation.compact_bar.active_count)
    {
        refs.active_count_clip.setHidden(false);
        apply_active_count_text_primitive(refs, layout, &active);
    } else {
        refs.active_count_clip.setHidden(true);
        refs.active_count.setHidden(true);
        refs.active_count_next.setHidden(true);
    }
}

fn compact_headline_primitive(plan: &NativePanelVisualPlan) -> Option<MacosActionIconPrimitive> {
    text_primitive_by_role(plan, NativePanelVisualTextRole::CompactHeadline)
}

fn compact_slash_primitive(plan: &NativePanelVisualPlan) -> Option<MacosActionIconPrimitive> {
    text_primitive_by_role(plan, NativePanelVisualTextRole::CompactSlash)
}

fn compact_total_count_primitive(
    plan: &NativePanelVisualPlan,
    total_count: &str,
) -> Option<MacosActionIconPrimitive> {
    (!total_count.is_empty())
        .then(|| text_primitive_by_role(plan, NativePanelVisualTextRole::CompactTotalCount))
        .flatten()
}

fn compact_active_count_primitive(
    plan: &NativePanelVisualPlan,
    active_count: &str,
) -> Option<MacosActionIconPrimitive> {
    (!active_count.is_empty())
        .then(|| text_primitive_by_role(plan, NativePanelVisualTextRole::CompactActiveCount))
        .flatten()
}

fn macos_action_icon_primitive(
    plan: &NativePanelVisualPlan,
    action: NativePanelEdgeAction,
) -> Option<MacosActionIconPrimitive> {
    let role = match action {
        NativePanelEdgeAction::Settings => NativePanelVisualTextRole::ActionButtonSettings,
        NativePanelEdgeAction::Quit => NativePanelVisualTextRole::ActionButtonQuit,
    };

    text_primitive_by_role(plan, role).map(|text| MacosActionIconPrimitive {
        text: macos_action_icon_text(&text.text),
        ..text
    })
}

fn text_primitive_by_role(
    plan: &NativePanelVisualPlan,
    role: NativePanelVisualTextRole,
) -> Option<MacosActionIconPrimitive> {
    text_primitive(native_panel_visual_text_primitive_by_role(plan, role)?)
}

fn text_primitive(primitive: &NativePanelVisualPrimitive) -> Option<MacosActionIconPrimitive> {
    let NativePanelVisualPrimitive::Text {
        role,
        origin,
        max_width,
        text,
        color,
        size,
        weight,
        alpha,
        ..
    } = primitive
    else {
        return None;
    };

    Some(MacosActionIconPrimitive {
        role: *role,
        origin: *origin,
        max_width: *max_width,
        text: text.clone(),
        color: *color,
        size: *size,
        weight: *weight,
        alpha: *alpha,
    })
}

fn macos_action_icon_text(text: &str) -> String {
    if text == SETTINGS_VISUAL_ICON_TEXT {
        // AppKit does not have Windows' Segoe MDL2 glyph; keep the shared semantic icon
        // while drawing with a native macOS fallback glyph.
        SETTINGS_MACOS_ICON_TEXT.to_string()
    } else if text == QUIT_VISUAL_ICON_TEXT {
        QUIT_MACOS_ICON_TEXT.to_string()
    } else {
        text.to_string()
    }
}

fn apply_text_primitive_to_label(
    label: &NSTextField,
    layout: &NativePanelLayout,
    primitive: &MacosActionIconPrimitive,
) {
    let font = font_for_visual_weight(primitive.weight, primitive.size as f64);
    apply_label_static_state(
        label,
        MacosLabelStaticState {
            text: None,
            color: primitive.color,
            font_size_bits: (primitive.size as f64).to_bits(),
            weight: primitive.weight,
            alignment: None,
        },
        &font,
    );
    label.setAlphaValue(primitive.alpha.clamp(0.0, 1.0));
    label.setFrame(text_primitive_label_frame(primitive, layout, &font));
    label.setHidden(primitive.alpha <= 0.001);
}

fn apply_metric_text_primitive_to_label(label: &NSTextField, primitive: &MacosActionIconPrimitive) {
    let font = font_for_visual_weight(primitive.weight, primitive.size as f64);
    apply_label_static_state(
        label,
        MacosLabelStaticState {
            text: None,
            color: primitive.color,
            font_size_bits: (primitive.size as f64).to_bits(),
            weight: primitive.weight,
            alignment: None,
        },
        &font,
    );
    label.setAlphaValue(primitive.alpha.clamp(0.0, 1.0));
    label.setHidden(primitive.alpha <= 0.001);
}

fn apply_active_count_text_primitive(
    refs: &NativePanelRefs,
    _layout: &NativePanelLayout,
    primitive: &MacosActionIconPrimitive,
) {
    let font = font_for_visual_weight(primitive.weight, primitive.size as f64);
    let style = MacosLabelStaticState {
        text: None,
        color: primitive.color,
        font_size_bits: (primitive.size as f64).to_bits(),
        weight: primitive.weight,
        alignment: None,
    };
    apply_label_static_state(refs.active_count, style.clone(), &font);
    apply_label_static_state(refs.active_count_next, style, &font);
    refs.active_count_clip
        .setAlphaValue(primitive.alpha.clamp(0.0, 1.0));
    refs.active_count_clip.setHidden(primitive.alpha <= 0.001);
}

fn apply_action_button_icon_primitive(
    button: &NSView,
    label: &NSTextField,
    primitive: Option<MacosActionIconPrimitive>,
) {
    let Some(primitive) = primitive else {
        label.setHidden(true);
        return;
    };

    clear_action_button_chrome(button);
    let font_size = macos_action_icon_font_size(primitive.role, primitive.size);
    let font = font_for_visual_weight(primitive.weight, font_size);
    let button_frame = button.frame();
    let local_origin = action_icon_local_origin(&primitive, button_frame, &font);
    apply_label_static_state(
        label,
        MacosLabelStaticState {
            text: Some(primitive.text.clone()),
            color: primitive.color,
            font_size_bits: font_size.to_bits(),
            weight: primitive.weight,
            alignment: Some(MacosLabelAlignment::Center),
        },
        &font,
    );
    label.setAlphaValue(1.0);
    label.setHidden(false);
    label.setFrame(NSRect::new(
        local_origin,
        NSSize::new(primitive.max_width.max(1.0), macos_text_frame_height(&font)),
    ));
}

fn apply_label_static_state(label: &NSTextField, state: MacosLabelStaticState, font: &NSFont) {
    let label_key = label as *const NSTextField as usize;
    let unchanged = MACOS_LABEL_STATIC_STATE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if cache.get(&label_key) == Some(&state) {
            true
        } else {
            cache.insert(label_key, state.clone());
            false
        }
    });
    if unchanged {
        return;
    }

    if let Some(text) = &state.text {
        label.setStringValue(&NSString::from_str(text));
    }
    label.setTextColor(Some(&ns_color(visual_color(state.color))));
    label.setFont(Some(font));
    if state.alignment == Some(MacosLabelAlignment::Center) {
        label.setAlignment(NSTextAlignment::Center);
    }
}

fn clear_action_button_chrome(button: &NSView) {
    let Some(layer) = button.layer() else {
        return;
    };
    layer.setCornerRadius(0.0);
    layer.setBackgroundColor(Some(&NSColor::clearColor().CGColor()));
    layer.setBorderWidth(0.0);
    layer.setBorderColor(Some(&NSColor::clearColor().CGColor()));
}

fn action_icon_local_origin(
    primitive: &MacosActionIconPrimitive,
    button_frame: NSRect,
    font: &NSFont,
) -> NSPoint {
    let label_width = primitive.max_width.max(1.0);
    NSPoint::new(
        centered_child_origin(0.0, button_frame.size.width, label_width),
        macos_text_frame_origin_for_visual_center(0.0, button_frame.size.height, font)
            + macos_action_icon_glyph_offset_y(primitive.role),
    )
}

fn text_primitive_label_frame(
    primitive: &MacosActionIconPrimitive,
    layout: &NativePanelLayout,
    font: &NSFont,
) -> NSRect {
    let shared_height = action_icon_text_height(primitive.size);
    let label_height = macos_text_frame_height(font);
    let local_shared_y = primitive.origin.y - layout.pill_frame.origin.y;
    let label_y = macos_text_frame_origin_for_visual_center(local_shared_y, shared_height, font);

    NSRect::new(
        NSPoint::new(primitive.origin.x - layout.pill_frame.origin.x, label_y),
        NSSize::new(primitive.max_width.max(1.0), label_height),
    )
}

fn action_icon_text_height(size: i32) -> f64 {
    if size >= 13 { 24.0 } else { size as f64 + 8.0 }
}

fn visual_color(color: NativePanelVisualColor) -> [f64; 4] {
    [
        color.r as f64 / 255.0,
        color.g as f64 / 255.0,
        color.b as f64 / 255.0,
        1.0,
    ]
}

fn ns_rect_from_panel_rect(rect: PanelRect) -> NSRect {
    NSRect::new(
        NSPoint::new(rect.x, rect.y),
        NSSize::new(rect.width, rect.height),
    )
}

fn panel_rect_from_ns_rect(rect: NSRect) -> PanelRect {
    PanelRect {
        x: rect.origin.x,
        y: rect.origin.y,
        width: rect.size.width,
        height: rect.size.height,
    }
}

fn rects_nearly_equal(left: PanelRect, right: PanelRect) -> bool {
    (left.x - right.x).abs() < 0.001
        && (left.y - right.y).abs() < 0.001
        && (left.width - right.width).abs() < 0.001
        && (left.height - right.height).abs() < 0.001
}
