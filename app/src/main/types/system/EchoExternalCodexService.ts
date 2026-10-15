/*
 * FusionIsland - A private Windows companion for local coding agents.
 * https://github.com/JNTMTMTM/eIsland
 *
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See the project license for details.
 */

/**
 * @file EchoExternalCodexService.ts
 * @description Read-only API shared by the EchoIsland session service and its IPC bridge.
 * @author 鸡哥
 */

import type { FusionEchoCodexSessionsSnapshot } from '../../../preload/types/fusion';

export interface EchoCodexSessionCache {
  load: () => FusionEchoCodexSessionsSnapshot | null;
  save: (snapshot: FusionEchoCodexSessionsSnapshot) => void;
}

export interface EchoExternalCodexService {
  start: () => void;
  stop: () => void;
  getSnapshot: () => FusionEchoCodexSessionsSnapshot;
  rescan?: () => Promise<void>;
  focusSession?: (source: string, sessionId: string) => Promise<boolean>;
  answerRequest?: (requestId: string, action: string, answer?: string) => Promise<boolean>;
  focusCodexApp: () => Promise<boolean>;
}
