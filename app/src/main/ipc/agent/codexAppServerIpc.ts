/*
 * FusionIsland - A private Windows companion for local coding agents.
 * https://github.com/JNTMTMTM/eIsland
 *
 * Copyright (C) 2026 JNTMTMTM
 * Copyright (C) 2026 pyisland.com
 * Copyright (C) 2026 FusionIsland contributors
 *
 * Licensed under GPL-3.0 with eIsland's additional terms. See LICENSE.
 */

/**
 * @file codexAppServerIpc.ts
 * @description Main-process IPC endpoints for private Codex sessions.
 * @author 鸡哥
 */

import { dialog, ipcMain } from 'electron';
import type { CodexAppServerService } from '../../types/system/CodexAppServerService';
import type { FusionCodexDecision } from '../../../preload/types/fusion';

/**
 * Registers renderer calls for the isolated Codex App Server connection.
 * @param service - Codex process and session controller.
 */
export function registerCodexAppServerIpcHandlers(service: CodexAppServerService): void {
  ipcMain.handle('fusion:codex:snapshot', () => service.getSnapshot());
  ipcMain.handle('fusion:codex:threads:list', () => service.loadThreads());
  ipcMain.handle('fusion:codex:thread:create', (_event, cwd: string) => service.createThread(cwd));
  ipcMain.handle('fusion:codex:thread:resume', (_event, threadId: string) => service.resumeThread(threadId));
  ipcMain.handle('fusion:codex:message:send', (_event, threadId: string, text: string, model?: import('../../../preload/types/fusionWorkspace').FusionModel) => service.sendMessage(threadId, text, model));
  ipcMain.handle('fusion:codex:turn:interrupt', (_event, sessionId?: string) => service.interrupt(sessionId));
  ipcMain.handle('fusion:codex:request:answer', (_event, requestId: string, decision: FusionCodexDecision, answers?: Record<string, string[]>) => {
    service.answerRequest(requestId, decision, answers);
    return true;
  });
  ipcMain.handle('fusion:project:select', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0] || null;
  });
}
