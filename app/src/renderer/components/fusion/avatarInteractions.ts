/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0.
 * Poke timing adapted from mortspace/feral-blob (MIT), pinned 3a5feee7.
 * See resources/licenses/character-interactions/ for upstream notices. */
/** @file avatarInteractions.ts @description Local character feedback and shuffled reactions without click tilt. @author 鸡哥 */
import type { StateId } from '../../vendor/bloub/states';

export const CLICK_ACTIONS: readonly StateId[] = ['wink', 'wide', 'notify', 'orbit', 'burst', 'comet'];
const POKE_WINDOW = 2.5, POKE_LIMIT = 6, WAKE_POKES = 3;
export interface GestureFrame { scale: number; rotation: number; }

/** Samples the upstream poke/shake gestures without another renderer or wall-clock timers. */
export class AvatarInteractions {
  private clicks: number[] = [];
  private sleepPokes = 0;
  private actionIndex = 0;

  /** Records one accepted click. Returns whether a sleep preview should be released. */
  tap(now: number, sleeping: boolean): { wake: boolean; overpoke: boolean } {
    this.clicks = this.clicks.filter(time => now - time <= POKE_WINDOW);
    this.clicks.push(now);
    const overpoke = this.clicks.length >= POKE_LIMIT;
    if (overpoke) this.clicks = [];
    this.sleepPokes = sleeping ? this.sleepPokes + 1 : 0;
    const wake = sleeping && this.sleepPokes >= WAKE_POKES;
    if (wake) this.sleepPokes = 0;
    return { wake, overpoke };
  }

  /** 按固定顺序轮换原生动作，保持回应可预期且不会连续重复。 */
  nextAction(): StateId {
    const state = CLICK_ACTIONS[this.actionIndex % CLICK_ACTIONS.length];
    this.actionIndex++;
    return state;
  }

  /** Clicks keep the character at its original size and angle, including rapid pokes. */
  sample(_now: number, _reduced = false): GestureFrame {
    return { scale: 1, rotation: 0 };
  }

  /** Drops old gestures at a session boundary or a higher-priority state. */
  clear(): void { this.clicks = []; this.sleepPokes = 0; }
}
