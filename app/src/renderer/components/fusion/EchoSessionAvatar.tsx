/* Copyright (C) 2026 FusionIsland contributors. GPL-3.0.
 * EchoIsland sprite and timing manifest: Copyright (c) 2026 MoLing14725, MIT.
 */
/**
 * @file EchoSessionAvatar.tsx
 * @description Displays the pinned EchoIsland status sprites using their original frame timing.
 * @author 鸡哥
 */
import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react';
import manifest from '../../public/echoisland/mascot/pet.json';

/** Maps live scanner states to upstream poses; restored snapshots remain visibly asleep. */
export function resolveEchoPose(status: string, restored: boolean): keyof typeof manifest.animations {
  if (restored) return 'sleepy';
  const value = status.toLowerCase();
  if (/question|input/.test(value)) return 'question';
  if (/approval|permission|waiting/.test(value)) return 'approval';
  if (/processing|running|working/.test(value)) return 'running';
  if (/complete|finished/.test(value)) return 'complete';
  if (/error|failed/.test(value)) return 'wake_angry';
  if (/disconnected|cancelled|stopped/.test(value)) return 'sleepy';
  return 'idle';
}

/** Renders a small external-session companion without running animations while hidden. */
export function EchoSessionAvatar({ status, restored = false }: { status: string; restored?: boolean }): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const pose = resolveEchoPose(status, restored);
  const animation = manifest.animations[pose];
  useEffect(() => {
    let intersecting = false;
    const update = (): void => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; update(); });
    if (ref.current) observer.observe(ref.current);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  const size = animation.logical_width;
  const style = {
    width: size, height: animation.logical_height,
    backgroundImage: 'url("./echoisland/mascot/spritesheet.png")',
    backgroundSize: `${manifest.sprite.columns * size}px ${manifest.sprite.rows * animation.logical_height}px`,
    backgroundPositionY: -animation.row * animation.logical_height,
    '--echo-frame-end': `${-animation.frames * size}px`,
    animationDuration: `${animation.frame_ms * animation.frames}ms`,
    animationTimingFunction: `steps(${animation.frames})`,
    animationIterationCount: animation.loop ? 'infinite' : 1,
    animationPlayState: visible ? 'running' : 'paused',
  } as CSSProperties;
  return <span ref={ref} className="fusion-echo-avatar no-filter" style={style} aria-hidden="true" data-pose={pose} />;
}
