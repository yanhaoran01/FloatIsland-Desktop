/* FloatIsland - https://github.com/JNTMTMTM/eIsland. Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionOnboardingService.ts @description Restricted resumable guide using the original data directory. @author 鸡哥 */
import {app, BrowserWindow, ipcMain} from 'electron';
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {onboardingPatch, restoreOnboarding, type OnboardingState} from '../../shared/onboarding';
import {readFirstLaunchConfig, writeFirstLaunchConfig} from '../config/storeConfig';
import {broadcastFusion, isFusionView} from './fusionWindows';
let state: OnboardingState;
/** Registers the guide for trusted application views only. @returns No value. */
export function registerFusionOnboarding(): void {
  const directory = join(app.getPath('userData'), 'eIsland_store'), file = join(directory, 'float-onboarding.json');
  let saved: unknown;
  try { saved = JSON.parse(readFileSync(file, 'utf8')); } catch { /* First run or recoverable malformed state. */ }
  let legacyComplete = !readFirstLaunchConfig();
  try { legacyComplete ||= existsSync(join(directory, 'guide-shown-version.json')); } catch { /* No newer legacy marker. */ }
  state = restoreOnboarding(saved, legacyComplete);
  const persist = (next: OnboardingState): OnboardingState => {
    mkdirSync(directory, {recursive: true});
    writeFileSync(file + '.tmp', JSON.stringify(next), 'utf8');
    renameSync(file + '.tmp', file);
    state = next;
    broadcastFusion('fusion:onboarding:state', state);
    return state;
  };
  const trusted = (event: Electron.IpcMainInvokeEvent): void => { if (!isFusionView(event.sender)) throw Error('untrusted-view'); };
  ipcMain.handle('fusion:onboarding:get', event => { trusted(event); return state; });
  ipcMain.handle('fusion:onboarding:save', (event, patch: unknown) => { trusted(event); return persist({...state, ...onboardingPatch(patch)}); });
  ipcMain.handle('fusion:onboarding:finish', (event, status: unknown) => {
    trusted(event);
    if (status !== 'completed' && status !== 'skipped') throw Error('invalid-onboarding');
    const next = persist({...state, status});
    if (!writeFirstLaunchConfig()) throw Error('onboarding-marker-write-failed');
    return next;
  });
  ipcMain.handle('fusion:onboarding:reopen', event => {
    trusted(event);
    const next = persist({...state, status: 'pending', step: 0});
    const main = BrowserWindow.getAllWindows().find(win => /\/DynamicIslandIndex\.html(?:$|\?)/.test(win.webContents.getURL()));
    main?.show(); main?.focus();
    return next;
  });
}
