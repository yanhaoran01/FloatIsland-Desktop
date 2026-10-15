/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file fusionWindows.ts @description Restricted event delivery to FusionIsland views. @author 鸡哥 */
import { app, BrowserWindow, type WebContents } from 'electron';
import { fileURLToPath } from 'url';
import { resolve, relative, isAbsolute } from 'path';

/** Checks that a receiver is one of the application's two trusted views. */
export function isFusionView(contents: WebContents): boolean {
  try {
    const url = new URL(contents.getURL());
    if (!BrowserWindow.fromWebContents(contents) || !/\/(DynamicIslandIndex|DynamicIslandStandalone)\.html$/.test(url.pathname)) return false;
    if (url.protocol === 'file:') {
      const child = relative(resolve(app.getAppPath(), 'out/renderer'), fileURLToPath(url));
      return !child.startsWith('..') && !isAbsolute(child);
    }
    return !app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL) && url.origin === new URL(process.env.ELECTRON_RENDERER_URL!).origin;
  }
  catch { return false; }
}

/** Broadcasts session data to both views, excluding auxiliary/native tool windows. */
export function broadcastFusion(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && isFusionView(window.webContents)) window.webContents.send(channel, payload);
  }
}
