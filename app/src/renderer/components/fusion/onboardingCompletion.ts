/* FloatIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file onboardingCompletion.ts @description Keep optional shortcut conflicts from blocking first-run completion. @author 鸡哥 */
import type {OnboardingState} from '../../../shared/onboarding';

type OnboardingApi = Pick<Window['api'], 'fusionProductData' | 'fusionProductWrite' | 'fusionDockSave'>;
const shortcutConflict = (reason: unknown): boolean => /(?:shortcut|hotkey)-conflict\b/.test(String(reason));

/** Applies guide preferences and reports unavailable shortcuts; persistence errors still reject. */
export async function configureOnboarding(api: OnboardingApi, state: OnboardingState): Promise<boolean> {
  let deferred = false;
  const data = await api.fusionProductData();
  if (state.searchShortcut !== data.hotkey || data.hotkeyError) {
    try { await api.fusionProductWrite({...data, hotkey: state.searchShortcut || ''}, true); }
    catch (reason) { if (!shortcutConflict(reason)) throw reason; deferred = true; }
  }
  try { await api.fusionDockSave({edge: state.edge, shortcut: state.recallShortcut}); }
  catch (reason) {
    if (!shortcutConflict(reason)) throw reason;
    // Keep the chosen edge without claiming that a rejected shortcut was saved.
    await api.fusionDockSave({edge: state.edge});
    deferred = true;
  }
  return deferred;
}
