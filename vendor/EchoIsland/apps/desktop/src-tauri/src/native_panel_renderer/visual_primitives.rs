use crate::{
    native_panel_core::{PanelPoint, PanelRect},
    native_panel_scene::SceneMascotPose,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativePanelVisualColor {
    pub(crate) r: u8,
    pub(crate) g: u8,
    pub(crate) b: u8,
}

impl NativePanelVisualColor {
    pub(crate) const fn rgb(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b }
    }
}

pub(crate) fn native_panel_visual_text_box_height(text: &str, size: i32) -> f64 {
    let line_count = text.lines().count().max(1) as f64;
    let line_height = if size >= 13 { 24.0 } else { size as f64 + 8.0 };
    line_count * line_height
}

pub(crate) fn native_panel_visual_text_box_height_for_role(
    role: NativePanelVisualTextRole,
    text: &str,
    size: i32,
) -> f64 {
    let line_count = text.lines().count().max(1) as f64;
    let line_height = match role {
        NativePanelVisualTextRole::CardBodyText | NativePanelVisualTextRole::CardBodyPrefix => {
            crate::native_panel_core::CARD_CHAT_LINE_HEIGHT
        }
        NativePanelVisualTextRole::CardStatusBadge
        | NativePanelVisualTextRole::CardSourceBadge
        | NativePanelVisualTextRole::CardToolName
        | NativePanelVisualTextRole::CardToolDescription
        | NativePanelVisualTextRole::CardActionHint
        | NativePanelVisualTextRole::CardSettingsValue => size as f64 + 3.0,
        _ => {
            return native_panel_visual_text_box_height(text, size);
        }
    };
    line_count * line_height.max(1.0)
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum NativePanelVisualPrimitive {
    ClipStart {
        frame: PanelRect,
    },
    ClipEnd,
    CompletionGlow {
        frame: PanelRect,
        opacity: f64,
    },
    RoundRect {
        frame: PanelRect,
        radius: f64,
        color: NativePanelVisualColor,
    },
    Rect {
        frame: PanelRect,
        color: NativePanelVisualColor,
    },
    Ellipse {
        frame: PanelRect,
        color: NativePanelVisualColor,
    },
    StrokeLine {
        from: PanelPoint,
        to: PanelPoint,
        color: NativePanelVisualColor,
        width: i32,
    },
    Text {
        role: NativePanelVisualTextRole,
        origin: PanelPoint,
        max_width: f64,
        text: String,
        color: NativePanelVisualColor,
        size: i32,
        weight: NativePanelVisualTextWeight,
        alignment: NativePanelVisualTextAlignment,
        alpha: f64,
    },
    MascotRoundRect {
        role: NativePanelVisualMascotRoundRectRole,
        frame: PanelRect,
        radius: f64,
        color: NativePanelVisualColor,
        alpha: f64,
    },
    MascotEllipse {
        role: NativePanelVisualMascotEllipseRole,
        frame: PanelRect,
        color: NativePanelVisualColor,
        alpha: f64,
    },
    MascotText {
        role: NativePanelVisualMascotTextRole,
        origin: PanelPoint,
        max_width: f64,
        text: String,
        color: NativePanelVisualColor,
        size: i32,
        weight: NativePanelVisualTextWeight,
        alignment: NativePanelVisualTextAlignment,
        alpha: f64,
    },
    MascotSprite {
        sprite_path: String,
        source_rect: PanelRect,
        frame: PanelRect,
        opacity: f64,
    },
    MascotDot {
        center: PanelPoint,
        frame: PanelRect,
        radius: f64,
        corner_radius: f64,
        scale_x: f64,
        scale_y: f64,
        pose: SceneMascotPose,
        debug_mode_enabled: bool,
        fill: NativePanelVisualColor,
        stroke: NativePanelVisualColor,
        stroke_width: f64,
        shadow_opacity: f64,
        shadow_radius: f64,
        alpha: f64,
    },
    CompactShoulder {
        frame: PanelRect,
        side: NativePanelVisualShoulderSide,
        progress: f64,
        fill: NativePanelVisualColor,
        border: NativePanelVisualColor,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativePanelVisualTextWeight {
    Normal,
    Semibold,
    Bold,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativePanelVisualTextAlignment {
    Left,
    Center,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativePanelVisualTextRole {
    Unspecified,
    CompactHeadline,
    CompactActiveCount,
    CompactActiveCountNext,
    CompactSlash,
    CompactTotalCount,
    ActionButtonSettings,
    ActionButtonQuit,
    CardTitle,
    CardSubtitle,
    CardStatusBadge,
    CardSourceBadge,
    CardBodyPrefix,
    CardBodyText,
    CardToolName,
    CardToolDescription,
    CardActionHint,
    CardSettingsTitle,
    CardSettingsValue,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativePanelVisualMascotRoundRectRole {
    Mouth,
    MessageBubble,
    CompletionBadgeOutline,
    CompletionBadgeFill,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativePanelVisualMascotEllipseRole {
    LeftEye,
    RightEye,
    MessageBubbleDot,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativePanelVisualMascotTextRole {
    SleepLabel,
    CompletionBadgeLabel,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativePanelVisualShoulderSide {
    Left,
    Right,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct NativePanelVisualPlan {
    pub(crate) hidden: bool,
    pub(crate) primitives: Vec<NativePanelVisualPrimitive>,
}

pub(crate) fn native_panel_visual_text_primitive_by_role(
    plan: &NativePanelVisualPlan,
    expected_role: NativePanelVisualTextRole,
) -> Option<&NativePanelVisualPrimitive> {
    plan.primitives.iter().find(|primitive| {
        matches!(
            primitive,
            NativePanelVisualPrimitive::Text { role, .. } if *role == expected_role
        )
    })
}

pub(crate) fn native_panel_visual_text_primitive_by_text<'a>(
    plan: &'a NativePanelVisualPlan,
    expected_text: &str,
) -> Option<&'a NativePanelVisualPrimitive> {
    plan.primitives.iter().find(|primitive| {
        matches!(
            primitive,
            NativePanelVisualPrimitive::Text { text, .. } if text == expected_text
        )
    })
}

pub(crate) fn native_panel_visual_completion_glow_primitive(
    plan: &NativePanelVisualPlan,
) -> Option<&NativePanelVisualPrimitive> {
    plan.primitives
        .iter()
        .find(|primitive| matches!(primitive, NativePanelVisualPrimitive::CompletionGlow { .. }))
}

pub(crate) fn native_panel_visual_compact_shoulder_primitive(
    plan: &NativePanelVisualPlan,
    expected_side: NativePanelVisualShoulderSide,
) -> Option<&NativePanelVisualPrimitive> {
    plan.primitives.iter().find(|primitive| {
        matches!(
            primitive,
            NativePanelVisualPrimitive::CompactShoulder { side, .. } if *side == expected_side
        )
    })
}

pub(crate) fn native_panel_visual_mascot_body_primitive(
    plan: &NativePanelVisualPlan,
) -> Option<&NativePanelVisualPrimitive> {
    plan.primitives
        .iter()
        .find(|primitive| matches!(primitive, NativePanelVisualPrimitive::MascotDot { .. }))
}

pub(crate) fn native_panel_visual_mascot_sprite_primitive(
    plan: &NativePanelVisualPlan,
) -> Option<&NativePanelVisualPrimitive> {
    plan.primitives
        .iter()
        .find(|primitive| matches!(primitive, NativePanelVisualPrimitive::MascotSprite { .. }))
}

pub(crate) fn native_panel_visual_mascot_round_rect_primitive(
    plan: &NativePanelVisualPlan,
    expected_role: NativePanelVisualMascotRoundRectRole,
) -> Option<&NativePanelVisualPrimitive> {
    plan.primitives.iter().find(|primitive| {
        matches!(
            primitive,
            NativePanelVisualPrimitive::MascotRoundRect { role, .. } if *role == expected_role
        )
    })
}

pub(crate) fn native_panel_visual_mascot_ellipse_primitive(
    plan: &NativePanelVisualPlan,
    expected_role: NativePanelVisualMascotEllipseRole,
) -> Option<&NativePanelVisualPrimitive> {
    plan.primitives.iter().find(|primitive| {
        matches!(
            primitive,
            NativePanelVisualPrimitive::MascotEllipse { role, .. } if *role == expected_role
        )
    })
}

pub(crate) fn native_panel_visual_mascot_ellipse_primitives_by_role(
    plan: &NativePanelVisualPlan,
    expected_role: NativePanelVisualMascotEllipseRole,
) -> impl Iterator<Item = &NativePanelVisualPrimitive> {
    plan.primitives.iter().filter(move |primitive| {
        matches!(
            primitive,
            NativePanelVisualPrimitive::MascotEllipse { role, .. } if *role == expected_role
        )
    })
}

pub(crate) fn native_panel_visual_mascot_text_primitive(
    plan: &NativePanelVisualPlan,
    expected_role: NativePanelVisualMascotTextRole,
) -> Option<&NativePanelVisualPrimitive> {
    plan.primitives.iter().find(|primitive| {
        matches!(
            primitive,
            NativePanelVisualPrimitive::MascotText { role, .. } if *role == expected_role
        )
    })
}
