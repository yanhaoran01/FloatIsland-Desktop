pub(crate) fn native_panel_enabled_from_env_value(
    default_enabled: bool,
    value: Option<String>,
) -> bool {
    value
        .map(|value| {
            let value = value.trim();
            !(value == "0"
                || value.eq_ignore_ascii_case("false")
                || value.eq_ignore_ascii_case("off"))
        })
        .unwrap_or(default_enabled)
}

pub(crate) fn native_panel_feature_enabled_from_env_value(value: Option<String>) -> bool {
    value
        .map(|value| {
            let value = value.trim();
            value == "1" || value.eq_ignore_ascii_case("true") || value.eq_ignore_ascii_case("yes")
        })
        .unwrap_or(false)
}
