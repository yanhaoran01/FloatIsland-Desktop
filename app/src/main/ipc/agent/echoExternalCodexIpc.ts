/*
 * FusionIsland - A private Windows companion for local coding agents.
 * https://github.com/JNTMTMTM/eIsland
 *
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See the project license for details.
 */

/**
 * @file echoExternalCodexIpc.ts
 * @description Renderer-safe endpoints for read-only external Codex session snapshots.
 * @author 鸡哥
 */

import { isFusionView } from '../../system/fusionWindows';
import { ipcMain } from 'electron';
import type { EchoExternalCodexService } from '../../types/system/EchoExternalCodexService';

/** Registers the read-only session snapshot endpoint used by the renderer. */
export function registerEchoExternalCodexIpcHandlers(service: EchoExternalCodexService): void {
  ipcMain.handle('fusion:echo:codex-sessions:get', async (event, refresh?: boolean) => {
    if (!isFusionView(event.sender)) throw new Error('untrusted-view');
    if (refresh) await service.rescan?.();
    return service.getSnapshot();
  });
  ipcMain.handle('fusion:echo:focus', (_event, source: string, sessionId: string) => service.focusSession?.(source, sessionId));
  ipcMain.handle('fusion:echo:answer', (_event, requestId: string, action: string, answer?: string) => service.answerRequest?.(requestId, action, answer));
  ipcMain.handle('fusion:echo:codex-focus', () => service.focusCodexApp());
}
