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
 * @file DshAcpService.ts
 * @description Main-process operations exposed by the local dsh ACP adapter.
 * @author 鸡哥
 */

import type { FusionDshSession, FusionDshSnapshot } from '../../../preload/types/fusion';

export interface DshAcpService {
  loadModels: () => Promise<import('../../../preload/types/fusionWorkspace').FusionModel[]>;
  getSnapshot: () => FusionDshSnapshot;
  ensureStarted: () => Promise<void>;
  loadSessions: () => Promise<FusionDshSession[]>;
  createSession: (cwd: string) => Promise<FusionDshSession>;
  resumeSession: (sessionId: string) => Promise<FusionDshSession>;
  prompt: (sessionId: string, text: string, model?: import('../../../preload/types/fusionWorkspace').FusionModel) => Promise<void>;
  cancel: (sessionId?: string) => Promise<void>;
  answerPermission: (requestId: string, optionId: string | null) => void | Promise<void>;
  answerQuestions?: (requestId: string, answers: unknown) => Promise<void>;
  stop: () => Promise<void>;
}
