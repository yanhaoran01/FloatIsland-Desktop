/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file fusionViewLayout.ts @description 按工作区限制固定与内容驱动窗口尺寸。 @author 鸡哥 */
import type { FitRequest, WebRect } from '../../preload/types/fusionTools';
/** 计算屏幕内的舒适尺寸。
 * @param request - 当前页面布局与目标尺寸。
 * @param area - 显示器可用工作区。
 * @returns 保留十二像素边距的宽高。
 */
export function fitViewSize(request: FitRequest, area: Pick<WebRect, 'width' | 'height'>, preferred = {width:760,height:560}): { width: number; height: number } {
  // All expanded pages share one viewport; only the collapsed strip changes size.
  let width = preferred.width;
  let height = preferred.height;
  if (request.mode === 'strip') { width = 360; height = 72; }
  return {
    width: Math.max(1, Math.min(area.width - 24, Math.max(320, Math.ceil(width)))),
    height: Math.max(1, Math.min(area.height - 24, Math.max(request.mode === 'strip' ? 72 : 280, Math.ceil(height)))),
  };
}
