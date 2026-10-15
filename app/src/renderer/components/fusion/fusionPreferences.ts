/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/**
 * @file fusionPreferences.ts
 * @description Shared preferences backed by the main process store and read-after-write.
 * @author 楦″摜
 */
import { initializeAvatarConfiguration } from './avatarConfiguration';
import { create } from 'zustand';

export interface FusionPreferences {
  voiceGlow: boolean;
  voiceOrb: boolean;
  voiceWave: boolean;
  wheelNavigation: boolean;
  muted: boolean;
  reducedMotion: boolean;
  autoDiscover: boolean;
  completionReminders: boolean;
}
const defaults: FusionPreferences = {
  voiceOrb: true, voiceWave: true, voiceGlow: true, wheelNavigation: true, muted: false, reducedMotion: false,
  autoDiscover: true, completionReminders: true,
};
interface PreferencesState {
  value: FusionPreferences;
  ready: boolean;
  save: (patch: Partial<FusionPreferences>) => Promise<void>;
}
let writes = Promise.resolve();
export const useFusionPreferences = create<PreferencesState>((set) => ({
  value: defaults, ready: false,
  save: (patch) => {
    const write = writes.then(async () => {
      const effective = await window.api.fusionPreferencesPatch(patch) as unknown as FusionPreferences;
      set({ value: { ...defaults, ...effective } });
      localStorage.setItem('fusion.pet-muted', String(effective.muted));
    });
    writes = write.catch(() => {});
    return write;
  },
}));
let initialized = false;
/** Loads preferences once and preserves the previous pet mute choice during migration. */
export async function initializeFusionPreferences(): Promise<void> {
  if (initialized) return;
  initialized = true;
  initializeAvatarConfiguration();
  // 让全局样式层也能遵守「减少动效」设置。
  useFusionPreferences.subscribe(state => { document.documentElement.dataset.fiReducedMotion = String(state.value.reducedMotion); });
  window.api.onFusionPreferences(value => {
    useFusionPreferences.setState({ value: { ...defaults, ...value }, ready: true });
    localStorage.setItem('fusion.pet-muted', String(value.muted));
  });
  try {
    const saved = await window.api.storeRead('fusion-preferences') as Partial<FusionPreferences> | null;
    const migrated = { ...defaults, muted: localStorage.getItem('fusion.pet-muted') === 'true', ...saved };
    if (!saved) {
      await window.api.storeWrite('fusion-preferences-migration-backup', { petMuted: localStorage.getItem('fusion.pet-muted') });
      if (!await window.api.storeWrite('fusion-preferences', migrated)) throw new Error('preferences-write-failed');
    }
    useFusionPreferences.setState({ value: migrated, ready: true });
  } catch {
    useFusionPreferences.setState({ ready: true });
  }
}

