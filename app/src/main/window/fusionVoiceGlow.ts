/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file fusionVoiceGlow.ts @description eIsland edge effect bound to a recording owner. @author 鸡哥 */
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'path';
import { isFusionView } from '../system/fusionWindows';

/** Reuses the original eIsland effect without triggering its legacy speech state. */
export function registerFusionVoiceGlow(getIsland: () => BrowserWindow | null): void {
  let glow: BrowserWindow | null = null;
  let owner: number | null = null;
  let request: string | undefined;
  const hide = (): void => {
    const previous = glow; glow = null; owner = null;
    if (!previous || previous.isDestroyed()) return;
    void previous.webContents.executeJavaScript('startFadeOut()').catch(() => {});
    setTimeout(() => { if (!previous.isDestroyed()) previous.close(); }, 450);
  };
  ipcMain.handle('fusion:voice:glow', (event, active: boolean, reducedMotion = false, requestId?: string) => {
    if (!isFusionView(event.sender)) throw new Error('untrusted-view');
    if (!active) { if (owner === event.sender.id && request === requestId) hide(); return; }
    if (owner && owner !== event.sender.id) throw new Error('microphone-in-use');
    if (glow && !glow.isDestroyed()) return;
    owner = event.sender.id; request = requestId;
    const island = getIsland();
    const display = island ? screen.getDisplayMatching(island.getBounds()) : screen.getPrimaryDisplay();
    const window = new BrowserWindow({
      ...display.bounds, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true,
      resizable: false, focusable: false, hasShadow: false, show: false, type: 'toolbar',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    glow = window;
    window.setIgnoreMouseEvents(true); window.setAlwaysOnTop(true, 'screen-saver'); window.removeMenu();
    const closed = (): void => { if (owner === event.sender.id) hide(); };
    event.sender.once('destroyed', closed);
    window.once('closed', () => { event.sender.removeListener('destroyed', closed); if (glow === window) { glow = null; owner = null; } });
    window.once('ready-to-show', () => {
      if (glow !== window || window.isDestroyed()) return;
      if (reducedMotion) void window.webContents.insertCSS('* { animation: none !important; }');
      window.showInactive();
    });
    void window.loadFile(join(__dirname, app.isPackaged ? '../renderer/DynamicIslandAibackground.html' : '../../src/renderer/DynamicIslandAibackground.html'),
      { query: { reducedMotion: reducedMotion ? '1' : '0' } });
  });
}
