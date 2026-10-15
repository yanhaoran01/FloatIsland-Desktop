/* FloatIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FloatIsland contributors. GPL-3.0. */
/**
 * @file useSlidingIndicator.ts
 * @description 为分段导航提供跟随选中项滑动的指示器几何。
 * @author 鸡哥
 */
import { useLayoutEffect, type RefObject } from 'react';

/**
 * 把当前选中按钮的位置写入容器 CSS 变量，样式层据此绘制滑动胶囊。
 * @param container - 分段导航容器。
 * @param selector - 选中项选择器，例如 `[aria-pressed=true]`。
 * @param key - 选中项变化时的依赖值。
 */
export function useSlidingIndicator(container: RefObject<HTMLElement | null>, selector: string, key: unknown): void {
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    let pending = 0;
    const place = (): void => {
      pending = 0;
      const active = element.querySelector<HTMLElement>(selector);
      if (!active || !active.getClientRects().length) { element.style.setProperty('--indicator-o', '0'); return; }
      element.style.setProperty('--indicator-x', `${active.offsetLeft}px`);
      element.style.setProperty('--indicator-y', `${active.offsetTop}px`);
      element.style.setProperty('--indicator-w', `${active.offsetWidth}px`);
      element.style.setProperty('--indicator-h', `${active.offsetHeight}px`);
      element.style.setProperty('--indicator-o', '1');
      const scroll = element.closest<HTMLElement>('.fusion-tool-modes, .fusion-island-tabs, .fusion-navigation');
      if (scroll && scroll.scrollWidth > scroll.clientWidth) {
        const bounds = active.getBoundingClientRect(), viewport = scroll.getBoundingClientRect();
        if (bounds.left < viewport.left || bounds.right > viewport.right) {
          scroll.scrollTo({left: scroll.scrollLeft + bounds.left - viewport.left - (scroll.clientWidth - bounds.width) / 2, behavior: 'instant'});
        }
      }
    };
    place();
    // 首次定位不做过渡，避免指示器从左上角滑入。
    const frame = requestAnimationFrame(() => { element.dataset.indicator = 'ready'; });
    const schedule = (): void => { if (!pending) pending = requestAnimationFrame(place); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    element.querySelectorAll('button').forEach(button => observer.observe(button));
    const changes = new MutationObserver(schedule);
    changes.observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-current', 'hidden'] });
    document.fonts.addEventListener('loadingdone', schedule);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(pending);
      observer.disconnect();
      changes.disconnect();
      document.fonts.removeEventListener('loadingdone', schedule);
    };
  }, [container, selector, key]);
}
