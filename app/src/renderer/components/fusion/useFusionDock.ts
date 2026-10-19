/* FloatIsland contributors. GPL-3.0. */
/** @file useFusionDock.ts @description Cancellable pointer dragging and retained dock state. @author 鸡哥 */
import { useProductStore } from './productStore';
import { useFusionActivity } from './fusionActivity';
import { useEffect, useRef, useState } from 'react';
import type { FusionDockState } from '../../../preload/types/fusionWorkspace';
import useIslandStore from '../../store/isLandStore';

/** Coordinates preferences, protected activity and pointer capture cleanup. */
export function useFusionDock(state: string) {
  const [dock, setDock] = useState<FusionDockState | null>(null);
  const record = useProductStore((s) => s.record),
    jobs = useProductStore((s) => s.jobs),
    activity = useFusionActivity();
  const keepVisible =
    Boolean(
      record &&
        ['starting', 'recording', 'paused', 'finishing'].includes(record.state)
    ) ||
    Object.values(jobs).some((j) => j.state === 'waiting') ||
    Boolean(
      activity.codex?.pendingRequests.length ||
        activity.dsh?.pendingRequests.length ||
        activity.echo?.pendingRequests?.length
    ) ||
    Boolean(
      activity.echo?.sessions.some((s) => s.status === 'WaitingApproval')
    );
  const gesture = useRef<{
    x: number;
    y: number;
    target: HTMLDivElement;
    pointer: number;
    started: Promise<unknown>;
  } | null>(null);
  const moved = useRef(false),
    frame = useRef(0),
    pending = useRef(false);
  const finish = (cancel = false): void => {
    const current = gesture.current;
    if (!current) return;
    const didMove = moved.current;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (current.target.hasPointerCapture(current.pointer))
      current.target.releasePointerCapture(current.pointer);
    delete document.documentElement.dataset.floatGesture;
    window.dispatchEvent(new Event('float-layout-gesture'));
    void current.started
      .then(async () => {
        if (!cancel && didMove) await window.api.fusionDockDrag('move');
        return window.api.fusionDockDrag(cancel ? 'cancel' : 'end');
      })
      .catch(() => {});
  };
  useEffect(() => {
    const cancel = () => finish(true);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
      cancel();
    };
  }, []);
  useEffect(() => {
    let active = true;
    void window.api
      .fusionDockGet()
      .then((s) => {
        if (active) setDock(s);
      })
      .catch(() => {});
    const off = window.api.onFusionDock(setDock),
      reveal = window.api.onFusionReveal(() =>
        useIslandStore.getState().setMaxExpand()
      );
    return () => {
      active = false;
      off();
      reveal();
    };
  }, []);
  useEffect(() => {
    void window.api
      .fusionDockActivity(
        !['idle', 'hover', 'expanded'].includes(state),
        keepVisible
      )
      .catch(() => {});
  }, [state, keepVisible]);
  useEffect(() => {
    document.documentElement.dataset.fusionDockStrip = String(
      Boolean(dock?.strip)
    );
    document.documentElement.dataset.fusionHudMode =
      dock?.config.mode ?? 'island';
    return () => {
      delete document.documentElement.dataset.fusionDockStrip;
      delete document.documentElement.dataset.fusionHudMode;
    };
  }, [dock?.strip, dock?.config.mode]);
  const move = (): void => {
    frame.current = 0;
    if (!gesture.current || pending.current) return;
    const current = gesture.current;
    pending.current = true;
    void current.started
      .then(() =>
        gesture.current === current
          ? window.api.fusionDockDrag('move')
          : undefined
      )
      .catch(() => finish(true))
      .finally(() => {
        pending.current = false;
      });
  };
  return {
    dock,
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        document.documentElement.dataset.floatGesture ||
        event.button !== 0 ||
        (event.target as Element).closest(
          'button,select,input,textarea,a,[role=button]:not(.fusion-compact),[contenteditable],.float-resize-handle,[data-no-drag],.agent-hud-scroll'
        ) ||
        (state === 'maxExpand' &&
          !(event.target as Element).closest('.fusion-chat-header'))
      )
        return;
      event.preventDefault();
      moved.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = {
        x: event.screenX,
        y: event.screenY,
        target: event.currentTarget,
        pointer: event.pointerId,
        started: window.api.fusionDockDrag('start')
      };
      document.documentElement.dataset.floatGesture = 'drag';
      window.dispatchEvent(new Event('float-layout-gesture'));
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      if (!g) return;
      if (Math.hypot(event.screenX - g.x, event.screenY - g.y) > 6)
        moved.current = true;
      if (moved.current && !frame.current)
        frame.current = requestAnimationFrame(move);
    },
    onPointerUp: () => finish(false),
    onPointerCancel: () => finish(true),
    onLostPointerCapture: () => finish(true),
    onClickCapture: (event: React.MouseEvent) => {
      if (moved.current) {
        event.preventDefault();
        event.stopPropagation();
        moved.current = false;
      }
    }
  };
}
