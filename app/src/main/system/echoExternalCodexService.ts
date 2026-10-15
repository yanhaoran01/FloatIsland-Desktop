/*
 * FusionIsland - A private Windows companion for local coding agents.
 * https://github.com/JNTMTMTM/eIsland
 *
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See the project license for details.
 */

/**
 * @file echoExternalCodexService.ts
 * @description Read-only external Codex session snapshots from the pinned EchoIsland scanner.
 * @author 鸡哥
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import type { BrowserWindow } from 'electron';
import type { FusionEchoCodexSessionsSnapshot, FusionEchoCodexSession } from '../../preload/types/fusion';
import type { EchoCodexSessionCache, EchoExternalCodexService } from '../types/system/EchoExternalCodexService';

const DEFAULT_POLL_INTERVAL_MS = 12_000;
const SCAN_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

interface EchoExternalCodexServiceOptions {
  binaryPath: string;
  getMainWindow: () => BrowserWindow | null;
  cache?: EchoCodexSessionCache;
  pollIntervalMs?: number;
}

const FOCUS_CODEX_POWERSHELL = [
  "$source = @'",
  'using System;',
  'using System.Runtime.InteropServices;',
  'public static class FusionWindowFocus {',
  '  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(System.IntPtr window, int command);',
  '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr window);',
  '}',
  "'@",
  'Add-Type -TypeDefinition $source',
  "$window = Get-Process -Name 'Codex' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1",
  'if (-not $window) { exit 1 }',
  '[FusionWindowFocus]::ShowWindowAsync($window.MainWindowHandle, 9) | Out-Null',
  '[FusionWindowFocus]::SetForegroundWindow($window.MainWindowHandle) | Out-Null',
  'exit 0',
].join('\n');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSessions(raw: string): FusionEchoCodexSession[] {
  const payload: unknown = JSON.parse(raw);
  if (!Array.isArray(payload)) throw new Error('invalid-session-payload');

  return payload.filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.session_id === 'string')
    .slice(0, 48)
    .map((item) => ({
      sessionId: item.session_id as string,
      source: typeof item.source === 'string' ? item.source : 'codex',
      cwd: typeof item.cwd === 'string' ? item.cwd : null,
      projectName: typeof item.project_name === 'string' ? item.project_name : null,
      model: typeof item.model === 'string' ? item.model : null,
      status: typeof item.status === 'string' ? item.status : 'Unknown',
      currentTool: typeof item.current_tool === 'string' ? item.current_tool : null,
      lastUserPrompt: typeof item.last_user_prompt === 'string' ? item.last_user_prompt : null,
      lastAssistantMessage: typeof item.last_assistant_message === 'string' ? item.last_assistant_message : null,
      lastActivity: typeof item.last_activity === 'string' ? item.last_activity : null,
      windowTitle: typeof item.window_title === 'string' ? item.window_title : null,
    }));
}

/** Creates a local, read-only poller for external Codex desktop and CLI session files. */
export function createEchoExternalCodexService(options: EchoExternalCodexServiceOptions): EchoExternalCodexService {
  const intervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let timer: NodeJS.Timeout | null = null;
  let child: ChildProcess | null = null;
  let scanInFlight = false;
  let lastFingerprint = '';
  let snapshot: FusionEchoCodexSessionsSnapshot = { state: 'unavailable', updatedAt: null, sessions: [] };

  const publish = (
    state: FusionEchoCodexSessionsSnapshot['state'],
    sessions: FusionEchoCodexSession[],
    updatedAt = new Date().toISOString(),
  ): void => {
    const fingerprint = JSON.stringify({ state, sessions });
    if (fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;
    snapshot = { state, updatedAt, sessions };
    if (state === 'ready') options.cache?.save(snapshot);
    const window = options.getMainWindow();
    if (window && !window.isDestroyed()) window.webContents.send('fusion:echo:codex-sessions:updated', snapshot);
  };

  const scan = async (): Promise<void> => {
    if (scanInFlight) return;
    if (!existsSync(options.binaryPath)) {
      if (snapshot.state === 'restored' && snapshot.sessions.length > 0) return;
      publish('unavailable', []);
      return;
    }
    scanInFlight = true;
    try {
      const sessions = await new Promise<FusionEchoCodexSession[]>((resolve, reject) => {
        const process = spawn(options.binaryPath, ['codex-scan'], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        child = process;
        let output = '';
        let outputBytes = 0;
        const timeout = setTimeout(() => {
          process.kill();
          reject(new Error('scan-timeout'));
        }, SCAN_TIMEOUT_MS);

        process.stdout?.setEncoding('utf8');
        process.stdout?.on('data', (chunk: string) => {
          outputBytes += Buffer.byteLength(chunk, 'utf8');
          if (outputBytes > MAX_OUTPUT_BYTES) {
            process.kill();
            reject(new Error('scan-output-too-large'));
            return;
          }
          output += chunk;
        });
        process.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        process.once('close', (code) => {
          clearTimeout(timeout);
          if (code !== 0) {
            reject(new Error('scan-failed'));
            return;
          }
          try {
            resolve(parseSessions(output));
          } catch {
            reject(new Error('invalid-session-payload'));
          }
        });
      });
      publish('ready', sessions);
    } catch {
      if (snapshot.sessions.length > 0) publish('restored', snapshot.sessions, snapshot.updatedAt ?? undefined);
      else publish('error', []);
    } finally {
      child = null;
      scanInFlight = false;
    }
  };

  const focusCodexApp = async (): Promise<boolean> => new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(false);
      return;
    }
    const encodedScript = Buffer.from(FOCUS_CODEX_POWERSHELL, 'utf16le').toString('base64');
    const focusProcess = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encodedScript], {
      windowsHide: true,
      stdio: 'ignore',
    });
    focusProcess.once('error', () => resolve(false));
    focusProcess.once('close', (code) => resolve(code === 0));
  });

  return {
    start: () => {
      if (timer) clearInterval(timer);
      const restored = options.cache?.load();
      if (restored) {
        snapshot = restored;
        lastFingerprint = JSON.stringify({ state: restored.state, sessions: restored.sessions });
      }
      void scan();
      timer = setInterval(() => { void scan(); }, intervalMs);
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
      child?.kill();
      child = null;
    },
    getSnapshot: () => snapshot,
    focusCodexApp,
  };
}
