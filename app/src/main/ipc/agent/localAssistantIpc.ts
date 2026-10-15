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
 * @file localAssistantIpc.ts
 * @description Exposes safe BYO assistant operations to the renderer.
 * @author 鸡哥
 */

import { ipcMain } from 'electron';
import type { FusionAssistantProvider, FusionAssistantSaveConfig } from '../../../preload/types/fusion';
import type { createLocalAssistantService } from '../../system/localAssistantService';

type LocalAssistantService = ReturnType<typeof createLocalAssistantService>;

/**
 * Registers settings and streaming message IPC for BYO AI providers.
 * @param service - Main-process assistant service.
 * @returns No value.
 */
export function registerLocalAssistantIpcHandlers(service: LocalAssistantService): void {
  ipcMain.handle('fusion:assistant:config:get', (_event, provider: FusionAssistantProvider) => service.publicConfig(provider));
  ipcMain.handle('fusion:assistant:config:save', (_event, config: FusionAssistantSaveConfig) => service.saveConfig(config));
  ipcMain.handle('fusion:assistant:send', (event, request: { requestId: string; provider: FusionAssistantProvider; messages: Array<{ role: 'user' | 'assistant'; content: string }> }) => {
    void service.send(event.sender, request).catch((error: unknown) => {
      if (!event.sender.isDestroyed()) event.sender.send('fusion:assistant:stream', {
        requestId: request.requestId,
        done: true,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return true;
  });
  ipcMain.handle('fusion:assistant:cancel', (_event, requestId: string) => {
    service.cancel(requestId);
    return true;
  });
}
