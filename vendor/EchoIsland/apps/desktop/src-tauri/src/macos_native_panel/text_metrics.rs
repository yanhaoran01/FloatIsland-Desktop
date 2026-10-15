use objc2::rc::Retained;
use objc2_app_kit::NSFont;
use std::{cell::RefCell, collections::HashMap};

use crate::native_panel_renderer::facade::visual::{
    NativePanelVisualTextRole, NativePanelVisualTextWeight,
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub(in crate::macos_native_panel) struct MacosFontVerticalMetrics {
    pub(in crate::macos_native_panel) ascender: f64,
    pub(in crate::macos_native_panel) descender: f64,
    pub(in crate::macos_native_panel) cap_height: f64,
    pub(in crate::macos_native_panel) leading: f64,
}

pub(in crate::macos_native_panel) fn centered_child_origin(
    container_origin: f64,
    container_size: f64,
    child_size: f64,
) -> f64 {
    container_origin + ((container_size - child_size) / 2.0).max(0.0)
}

pub(in crate::macos_native_panel) fn macos_text_frame_origin_for_visual_center(
    container_origin: f64,
    container_height: f64,
    font: &NSFont,
) -> f64 {
    macos_text_frame_origin_for_visual_center_from_metrics(
        container_origin,
        container_height,
        macos_font_vertical_metrics(font),
    )
}

fn macos_text_frame_origin_for_visual_center_from_metrics(
    container_origin: f64,
    container_height: f64,
    metrics: MacosFontVerticalMetrics,
) -> f64 {
    container_origin + container_height / 2.0 - macos_glyph_center_from_frame_origin(metrics)
}

pub(in crate::macos_native_panel) fn macos_text_frame_height(font: &NSFont) -> f64 {
    macos_text_frame_height_from_metrics(macos_font_vertical_metrics(font))
}

fn macos_text_frame_height_from_metrics(metrics: MacosFontVerticalMetrics) -> f64 {
    (metrics.ascender - metrics.descender + metrics.leading)
        .ceil()
        .max(1.0)
}

pub(in crate::macos_native_panel) fn macos_glyph_center_from_frame_origin(
    metrics: MacosFontVerticalMetrics,
) -> f64 {
    (-metrics.descender + metrics.cap_height / 2.0).max(0.0)
}

pub(in crate::macos_native_panel) fn macos_font_vertical_metrics(
    font: &NSFont,
) -> MacosFontVerticalMetrics {
    MacosFontVerticalMetrics {
        ascender: font.ascender(),
        descender: font.descender(),
        cap_height: font.capHeight(),
        leading: font.leading(),
    }
}

pub(in crate::macos_native_panel) fn macos_action_icon_font_size(
    role: NativePanelVisualTextRole,
    shared_size: i32,
) -> f64 {
    match role {
        NativePanelVisualTextRole::ActionButtonSettings => 20.0,
        _ => shared_size as f64,
    }
}

pub(in crate::macos_native_panel) fn macos_action_icon_glyph_offset_y(
    role: NativePanelVisualTextRole,
) -> f64 {
    match role {
        NativePanelVisualTextRole::ActionButtonQuit => -2.0,
        _ => 0.0,
    }
}

pub(in crate::macos_native_panel) fn font_for_visual_weight(
    weight: NativePanelVisualTextWeight,
    size: f64,
) -> Retained<NSFont> {
    let key = NativeFontCacheKey::new(weight, size);
    NATIVE_FONT_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        cache
            .entry(key)
            .or_insert_with(|| match weight {
                NativePanelVisualTextWeight::Bold | NativePanelVisualTextWeight::Semibold => {
                    NSFont::boldSystemFontOfSize(size)
                }
                NativePanelVisualTextWeight::Normal => NSFont::systemFontOfSize(size),
            })
            .clone()
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
struct NativeFontCacheKey {
    weight: u8,
    size_bits: u64,
}

impl NativeFontCacheKey {
    fn new(weight: NativePanelVisualTextWeight, size: f64) -> Self {
        Self {
            weight: match weight {
                NativePanelVisualTextWeight::Normal => 0,
                NativePanelVisualTextWeight::Semibold => 1,
                NativePanelVisualTextWeight::Bold => 2,
            },
            size_bits: size.to_bits(),
        }
    }
}

thread_local! {
    static NATIVE_FONT_CACHE: RefCell<HashMap<NativeFontCacheKey, Retained<NSFont>>> =
        RefCell::new(HashMap::new());
}
