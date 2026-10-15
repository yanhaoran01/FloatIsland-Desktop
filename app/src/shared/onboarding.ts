/* FloatIsland - https://github.com/JNTMTMTM/eIsland. Copyright (C) 2026 contributors. GPL-3.0. */
/** @file onboarding.ts @description Validated and versioned first-run preferences. @author 鸡哥 */
export interface OnboardingState {
  version: 1;
  status: 'pending' | 'completed' | 'skipped';
  step: 0 | 1 | 2;
  edge?: 'top' | 'left' | 'right';
  recallShortcut?: string;
  searchShortcut?: string;
}
export type OnboardingPatch = Partial<Pick<OnboardingState, 'step' | 'edge' | 'recallShortcut' | 'searchShortcut'>>;
/** Validates renderer input without accepting arbitrary store keys. @param value - Untrusted patch. @returns A restricted patch. */
export function onboardingPatch(value: unknown): OnboardingPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid-onboarding');
  const patch: OnboardingPatch = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'step' && (item === 0 || item === 1 || item === 2)) patch.step = item;
    else if (key === 'edge' && (item === 'top' || item === 'left' || item === 'right')) patch.edge = item;
    else if ((key === 'recallShortcut' || key === 'searchShortcut') && typeof item === 'string' && item.length <= 100) patch[key] = item;
    else throw Error('invalid-onboarding');
  }
  return patch;
}
/** Restores a draft or respects an older completed first-run marker. @param value - Stored state. @param legacyComplete - Existing marker. @returns Safe state. */
export function restoreOnboarding(value: unknown, legacyComplete: boolean): OnboardingState {
  if (value && typeof value === 'object' && 'version' in value && value.version === 1 && 'status' in value && (value.status === 'pending' || value.status === 'completed' || value.status === 'skipped')) {
    try {
      const {version: _version, status: _status, ...patch} = value;
      return {version: 1, status: value.status, step: 0, ...onboardingPatch(patch)};
    } catch { /* Invalid draft cannot override valid legacy completion. */ }
  }
  return {version: 1, status: legacyComplete ? 'completed' : 'pending', step: 0};
}
