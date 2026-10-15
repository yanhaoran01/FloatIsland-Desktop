# FloatIsland application mark

Original design, 2026-10-11, FloatIsland contributors; GPL-3.0.

The mark is the companion itself: a white floating capsule tilted eight degrees on a graphite tile, with two slanted eyes looking up and to the right and a soft shadow beneath instead of a coloured hover line. A faint top sheen and hairline edge give depth without extra colour, so the mark stays legible from 16px to 1024px. No external logo or font is included; existing third-party character licenses remain unchanged.

`scripts/generate-float-icons.cjs` is the source of truth. Run `node scripts/generate-float-icons.cjs` with the locked Electron dependency to reproduce SVG, transparent PNG, the nine-resolution Windows ICO (16–256px) and monochrome tray variants. PNGs and ICO layers use the same rendered geometry; the light tray uses a light foreground on a dark taskbar, and the dark tray uses a dark foreground on a light taskbar. Eye cutouts are transparent in both tray variants.

The main, settings, guide and splash windows share `float-island.ico`. Windows executable and installer/uninstaller build configuration uses the same resource; the renderer uses the matching SVG. Internal application ID, profile directories and persistence keys are preserved.

Application assets and build configuration are updated. Previously distributed executables keep their embedded icon until rebuilt; installer shell integration and Windows icon-cache behavior require final packaged-build acceptance.
