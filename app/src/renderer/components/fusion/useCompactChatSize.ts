/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file useCompactChatSize.ts @description 统一主视口，页面切换不再改变窗口大小。 @author 鸡哥 */
import { useLayoutEffect, type RefObject } from 'react';
let fitSequence = Date.now() * 1000;
/** 所有展开页面保持 760×560；主进程负责屏幕边界与过期请求。 */
export function useAdaptiveView(root: RefObject<HTMLElement | null>, active: boolean, page = 'island'): void {
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || !active) return;
    let disposed = false;
    let frame = 0;
    let generation = 0;
    const fit = (): void => {
      frame = 0;
      if (disposed || !element.getClientRects().length) return;
      const current = ++generation;
      void window.api.fusionFitView({ mode: 'chat', width: 760, height: 560, page, sequence: ++fitSequence }).then(size => {
        if (disposed || current !== generation || !size) return;
        element.closest<HTMLElement>('.island-shell')?.style.setProperty('--fusion-chat-width', `${size.width}px`);
      }).catch(() => {});
    };
    const schedule = (): void => { if (!frame && !disposed) frame = requestAnimationFrame(fit); };
    window.addEventListener('resize', schedule);
    schedule();
    return () => { disposed = true; cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); };
  }, [root, active, page]);
}
/** 语音与工具共用稳定主视口，不随文本或媒体状态跳动。 */
export function useCompactChatSize(root: RefObject<HTMLElement | null>, active: boolean): void {
  useAdaptiveView(root, active);
}
