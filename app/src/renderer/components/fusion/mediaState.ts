/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file mediaState.ts @description 保留媒体状态订阅和统一播放器导航。 @author 鸡哥 */
import { useEffect, useSyncExternalStore } from 'react';
import type { WebSnapshot } from '../../../preload/types/fusionTools';
let state: WebSnapshot[] = [];
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;
let generation = 0;
const update = (value: WebSnapshot[]): void => { state = value; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => listeners.delete(listener); };
/** 全局共享状态，页面隐藏仍持续收到实际播放位置。 */
export function useMediaState(): WebSnapshot[] {
  useEffect(() => {
    if (!stop) {
      stop = window.api.onFusionWebState(value => { generation++; update(value); });
      const start = generation;
      void window.api.fusionWebState().then(value => { if (start === generation) update(value); }).catch(() => {});
    }
  }, []);
  return useSyncExternalStore(subscribe, () => state);
}
/** 在当前窗口恢复同一播放器实例。 */
export function openMedia(): void { window.dispatchEvent(new CustomEvent('fusion-open-tool', { detail: 'video' })); }
