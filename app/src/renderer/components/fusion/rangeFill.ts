// FloatIsland - https://github.com/JNTMTMTM/eIsland. Copyright (C) 2026 FloatIsland contributors. GPL-3.0.
/**
 * @file rangeFill.ts
 * @description 为所有 range 输入同步 --p（已填充比例），使样式表能绘制实心进度轨道。
 * @author 鸡哥
 */

/** 根据当前值计算填充百分比。 */
export function rangePercent(input: HTMLInputElement): string {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value);
  if (!(max > min) || !Number.isFinite(value)) return '0%';
  return `${Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))}%`;
}

function sync(input: HTMLInputElement): void {
  const next = rangePercent(input);
  if (input.style.getPropertyValue('--p') !== next) input.style.setProperty('--p', next);
}

/** 监听 root 内的 range 输入；受控值由 React 写入 value 属性，用帧轮询兜底捕获。返回清理函数。 */
export function installRangeFill(root: ParentNode = document): () => void {
  const onInput = (event: Event): void => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'range') sync(event.target);
  };
  let frame = 0;
  const tick = (): void => {
    root.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(sync);
    frame = window.setTimeout(tick, 250);
  };
  document.addEventListener('input', onInput, true);
  tick();
  return () => {
    document.removeEventListener('input', onInput, true);
    window.clearTimeout(frame);
  };
}
