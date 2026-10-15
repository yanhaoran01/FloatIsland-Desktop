/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/**
 * @file navigation.ts
 * @description Bounded navigation with one transition per wheel gesture.
 * @author 鸡哥
 */
export const PRIMARY_TABS = ['fusionSessions', 'aiChat', 'toolbox'] as const;

/** Keeps native scrolling in text, form controls and tool lists, including at their scroll boundaries. */
export function isIslandWheelContent(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"], .fusion-settings, .fusion-chat-feed, .fusion-focus-reply, .fusion-chat-error, .fusion-inline-notice, .fusion-chat-attachments, .fusion-tool-content, .fusion-tool-directory, .fusion-web-slot, .fusion-session-popover'));
}

/** Accumulates normalized wheel input until a fresh gesture may switch a page. */
export class NavigationWheel {
  private lastAt = -Infinity;
  private total = 0;
  private consumed = false;

  /** Returns one bounded adjacent index, preserving the current index at either end. */
  move(index: number, count: number, delta: number, now: number): number {
    if (now - this.lastAt >= 220) {
      this.total = 0;
      this.consumed = false;
    }
    this.lastAt = now;
    if (this.consumed || !Number.isFinite(delta)) return index;
    if (Math.sign(delta) !== Math.sign(this.total)) this.total = 0;
    this.total += delta;
    if (Math.abs(this.total) < 60) return index;
    this.consumed = true;
    return Math.max(0, Math.min(count - 1, index + Math.sign(this.total)));
  }
}
