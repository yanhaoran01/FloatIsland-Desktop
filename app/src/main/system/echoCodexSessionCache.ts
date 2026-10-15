/*
 * FusionIsland - A private Windows companion for local coding agents.
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See the project license for details.
 */

/**
 * @file echoCodexSessionCache.ts
 * @description Stores encrypted read-only Codex session snapshots for startup recovery.
 * @author 鸡哥
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { FusionEchoCodexSession, FusionEchoCodexSessionsSnapshot } from '../../preload/types/fusion';

const CACHE_VERSION = 1;
const MAX_CACHE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const MAX_CACHED_SESSIONS = 48;

interface PersistedSessionSnapshot {
  version: number;
  savedAt: string;
  updatedAt: string;
  sessions: FusionEchoCodexSession[];
}

export interface EchoCodexSessionCacheOptions {
  getFilePath: () => string;
  isEncryptionAvailable: () => boolean;
  encryptString: (value: string) => string;
  decryptString: (value: string) => string;
  now?: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSession(value: unknown): value is FusionEchoCodexSession {
  if (!isRecord(value)) return false;
  const nullableStrings = [value.cwd, value.projectName, value.model, value.currentTool, value.lastUserPrompt,
    value.lastAssistantMessage, value.lastActivity, value.windowTitle];
  return typeof value.sessionId === 'string'
    && typeof value.source === 'string'
    && typeof value.status === 'string'
    && nullableStrings.every((field) => field === null || typeof field === 'string');
}

/** Creates an encrypted, atomic cache for read-only external Codex session summaries. */
export function createEchoCodexSessionCache(options: EchoCodexSessionCacheOptions) {
  const now = options.now ?? Date.now;

  const load = (): FusionEchoCodexSessionsSnapshot | null => {
    if (!options.isEncryptionAvailable()) return null;
    const filePath = options.getFilePath();
    try {
      if (!existsSync(filePath) || statSync(filePath).size > MAX_CACHE_BYTES) return null;
      const encrypted = readFileSync(filePath, 'utf8');
      const stored = JSON.parse(options.decryptString(encrypted)) as Partial<PersistedSessionSnapshot>;
      const savedAt = typeof stored.savedAt === 'string' ? Date.parse(stored.savedAt) : Number.NaN;
      const updatedAt = typeof stored.updatedAt === 'string' ? Date.parse(stored.updatedAt) : Number.NaN;
      const currentTime = now();
      if (stored.version !== CACHE_VERSION || !Number.isFinite(savedAt) || !Number.isFinite(updatedAt)
        || savedAt > currentTime + 5 * 60 * 1000 || currentTime - savedAt > MAX_CACHE_AGE_MS
        || !Array.isArray(stored.sessions)) return null;

      return {
        state: 'restored',
        updatedAt: new Date(updatedAt).toISOString(),
        sessions: stored.sessions.filter(isSession).slice(0, MAX_CACHED_SESSIONS),
      };
    } catch {
      return null;
    }
  };

  const save = (snapshot: FusionEchoCodexSessionsSnapshot): void => {
    if (snapshot.state !== 'ready' || !options.isEncryptionAvailable()) return;
    const filePath = options.getFilePath();
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    try {
      const savedAt = new Date(now()).toISOString();
      const updatedAt = snapshot.updatedAt ?? savedAt;
      const serialized = JSON.stringify({
        version: CACHE_VERSION,
        savedAt,
        updatedAt,
        sessions: snapshot.sessions.slice(0, MAX_CACHED_SESSIONS),
      } satisfies PersistedSessionSnapshot);
      const encrypted = options.encryptString(serialized);
      if (Buffer.byteLength(encrypted, 'utf8') > MAX_CACHE_BYTES) return;
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(temporaryPath, encrypted, { encoding: 'utf8', mode: 0o600 });
      renameSync(temporaryPath, filePath);
    } catch {
      // A cache failure must never interrupt live Codex session discovery.
    }
  };

  return { load, save };
}
