/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionDockGeometry.ts @description 屏幕工作区内的停靠几何计算。 @author 鸡哥 */
export type DockEdge = 'top' | 'left' | 'right';
export interface DockRect { x: number; y: number; width: number; height: number; }
/** Fits a retained panel or the tiny handle within a display, including negative origins. */
export function dockRect(area: DockRect, size: {width:number; height:number}, edge: DockEdge, position: number, strip = false): DockRect {
  const margin = strip ? 0 : 12;
  const width = Math.max(1, Math.min(size.width, area.width - (edge === 'top' ? margin * 2 : margin)));
  const height = Math.max(1, Math.min(size.height, area.height - (edge === 'top' ? margin : margin * 2)));
  const fraction = Math.min(1, Math.max(0, position));
  return { width, height, x: Math.round(edge === 'left' ? area.x : edge === 'right' ? area.x + area.width - width : area.x + margin + (area.width - width - 2 * margin) * fraction),
    y: Math.round(edge === 'top' ? area.y : area.y + margin + (area.height - height - 2 * margin) * fraction) };
}
