/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionDockGeometry.ts @description 屏幕工作区内的停靠几何计算。 @author 鸡哥 */
export type DockEdge = 'top' | 'bottom' | 'left' | 'right';
export interface DockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const horizontalDock = (edge: DockEdge): boolean =>
  edge === 'top' || edge === 'bottom';
/** Fits a retained panel or the tiny handle within a display, including negative origins. */
export function dockRect(
  area: DockRect,
  size: { width: number; height: number },
  edge: DockEdge,
  position: number,
  strip = false
): DockRect {
  const margin = strip ? 0 : 12;
  const width = Math.max(
    1,
    Math.min(
      size.width,
      area.width - (horizontalDock(edge) ? margin * 2 : margin)
    )
  );
  const height = Math.max(
    1,
    Math.min(
      size.height,
      area.height - (horizontalDock(edge) ? margin : margin * 2)
    )
  );
  const fraction = Math.min(1, Math.max(0, position));
  return {
    width,
    height,
    x: Math.round(
      edge === 'left'
        ? area.x
        : edge === 'right'
          ? area.x + area.width - width
          : area.x + margin + (area.width - width - 2 * margin) * fraction
    ),
    y: Math.round(
      edge === 'top'
        ? area.y
        : edge === 'bottom'
          ? area.y + area.height - height
          : area.y + margin + (area.height - height - 2 * margin) * fraction
    )
  };
}

/** Converts an actual window position to its fraction along the available travel. */
export function dockPosition(
  area: DockRect,
  rect: DockRect,
  edge: DockEdge
): number {
  const horizontal = horizontalDock(edge);
  const range = horizontal
    ? area.width - rect.width - 24
    : area.height - rect.height - 24;
  return range > 0
    ? Math.max(
        0,
        Math.min(
          1,
          ((horizontal ? rect.x - area.x : rect.y - area.y) - 12) / range
        )
      )
    : 0.5;
}

/** Finds the closest edge of a work area, including the bottom and negative origins. */
export function nearestDockEdge(
  area: DockRect,
  point: { x: number; y: number }
): DockEdge {
  return (
    [
      ['top', Math.abs(point.y - area.y)],
      ['bottom', Math.abs(area.y + area.height - point.y)],
      ['left', Math.abs(point.x - area.x)],
      ['right', Math.abs(area.x + area.width - point.x)]
    ] as [DockEdge, number][]
  ).sort((a, b) => a[1] - b[1])[0][0];
}
