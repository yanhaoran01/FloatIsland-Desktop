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
 * @file CodexAppServerService.ts
 * @description Main-process operations exposed by the managed Codex adapter.
 * @author 鸡哥
 */

import type {
  FusionCodexDecision,
  FusionCodexSnapshot,
  FusionCodexThread,
} from '../../../preload/types/fusion';

export interface CodexAppServerService {
  loadModels: () => Promise<import('../../../preload/types/fusionWorkspace').FusionModel[]>;
  getSnapshot: () => FusionCodexSnapshot;
  ensureStarted: () => Promise<void>;
  loadThreads: () => Promise<FusionCodexThread[]>;
  createThread: (cwd: string) => Promise<FusionCodexThread>;
  resumeThread: (threadId: string) => Promise<FusionCodexThread>;
  sendMessage: (threadId: string, text: string, model?: import('../../../preload/types/fusionWorkspace').FusionModel) => Promise<void>;
  interrupt: (sessionId?: string) => Promise<void>;
  answerRequest: (requestId: string, decision: FusionCodexDecision, answers?: Record<string, string[]>) => void;
  stop: () => Promise<void>;
}
