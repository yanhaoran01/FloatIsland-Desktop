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
 * @file dshAcpIpc.ts
 * @description IPC handlers for local DeepSeek Harness sessions over ACP.
 * @author 鸡哥
 */

import { ipcMain } from 'electron';
import type { DshAcpService } from '../../types/system/DshAcpService';

/**
 * Registers renderer operations for the dsh ACP adapter.
 * @param service - DSH process and session controller.
 */
export function registerDshAcpIpcHandlers(service: DshAcpService): void {
  ipcMain.handle('fusion:dsh:snapshot', () => service.getSnapshot());
  ipcMain.handle('fusion:dsh:sessions:list', () => service.loadSessions());
  ipcMain.handle('fusion:dsh:session:create', (_event, cwd: string) => service.createSession(cwd));
  ipcMain.handle('fusion:dsh:session:resume', (_event, sessionId: string) => service.resumeSession(sessionId));
  ipcMain.handle('fusion:dsh:prompt', (_event, sessionId: string, text: string, model?: import('../../../preload/types/fusionWorkspace').FusionModel) => service.prompt(sessionId, text, model));
  ipcMain.handle('fusion:dsh:cancel', (_event, sessionId?: string) => service.cancel(sessionId));
  ipcMain.handle('fusion:dsh:questions:answer', (_event, id: string, answers: unknown) => service.answerQuestions?.(id, answers));
  ipcMain.handle('fusion:dsh:permission:answer', async (_event, requestId: string, optionId: string | null) => {
    await service.answerPermission(requestId, optionId);
    return true;
  });
}
