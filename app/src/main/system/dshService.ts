/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file dshService.ts @description Native dsh routing with mutually exclusive ACP compatibility. @author 鸡哥 */
import { app, ipcMain, BrowserWindow } from 'electron';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createLocalSpeechService } from './localSpeechService';
import { createDshAcpService } from './dshAcpService';
import { createDshNativeService } from './dshNativeService';
import { broadcastFusion, isFusionView } from './fusionWindows';
import {claimProductMicrophone,releaseProductMicrophone} from './productMicrophone';
import { pauseFusionMedia } from './fusionBrowserService';
import type { FusionDshSnapshot } from '../../preload/types/fusion';

/** Pins each controlled session to one transport and exposes only native Agent voice. */
export function createDshService(options: { getMainWindow: () => BrowserWindow | null }) {
  const localSpeech = createLocalSpeechService();
  const speechStatus = async () => { const local = localSpeech.status(); return local.ready ? local : native.speechStatus(); };
  const owners = new Map<string, 'native' | 'acp'>();
  const publish = (): void => broadcastFusion('fusion:dsh:updated', getSnapshot());
  const acp = createDshAcpService({ ...options, onSnapshot: publish });
  const native = createDshNativeService(publish, undefined, status => broadcastFusion('fusion:speech:updated', { provider: 'dsh', status }));
  const getSnapshot = (): FusionDshSnapshot => {
    const a = acp.getSnapshot(), n = native.getSnapshot();
    const active = n.activeSessionId ? n : a;
    const acpIds = new Set(a.sessions.map(s => s.id));
    return {
      ...active, state: n.state === 'ready' || a.state === 'ready' ? 'ready' : active.state,
      sessions: [...n.sessions.filter(s => !acpIds.has(s.id)), ...a.sessions],
      sessionStates: { ...n.sessionStates, ...a.sessionStates },
      pendingRequests: [...n.pendingRequests.filter(r => owners.get(r.sessionId) !== 'acp'), ...a.pendingRequests],
    };
  };
  const choose = async () => {
    try { await native.ensureStarted(); return native; }
    catch { return acp; }
  };
  const forId = (id: string) => owners.get(id) === 'acp' ? acp : native;
  let discovery: NodeJS.Timeout | null = null;
  const start = (): void => {
    if (discovery) return;
    const apply = (): void => {
      let enabled = true;
      try { enabled = JSON.parse(readFileSync(join(app.getPath('userData'), 'eIsland_store', 'fusion-preferences.json'), 'utf8')).autoDiscover !== false; } catch {}
      if (enabled) native.start(); else void native.stop();
    };
    discovery = setInterval(apply, 2000); apply();
  };
  const recordings = new Map<string, { owner: number; abort: AbortController }>();
  let microphone: { owner: number; requestId: string; cleanup: () => void } | null = null;
  let mutedViews = new Map<Electron.WebContents, boolean>();
  const silenceView = (contents: Electron.WebContents): void => {
    if (!microphone || !isFusionView(contents) || mutedViews.has(contents)) return;
    mutedViews.set(contents, contents.isAudioMuted()); contents.setAudioMuted(true);
  };
  app.on('browser-window-created', (_event, window) => { window.webContents.once('did-finish-load', () => silenceView(window.webContents)); });
  ipcMain.handle('fusion:voice:claim', async (event, requestId: string) => {
    if (!isFusionView(event.sender) || typeof requestId !== 'string' || requestId.length > 128) throw new Error('invalid-recording');
    if (microphone) throw new Error('microphone-in-use');
    const media = await pauseFusionMedia();
    if (!media.paused && !media.muted) throw new Error('media-not-quiet');
    if (event.sender.isDestroyed()) throw new Error('invalid-recording');
    if (microphone) throw new Error('microphone-in-use');
    const cleanup = (): void => {
      event.sender.removeListener('destroyed', cleanup);
      if (microphone?.requestId === requestId) {
        releaseProductMicrophone(requestId);
        microphone = null;
        mutedViews.forEach((muted, contents) => { if (!contents.isDestroyed()) contents.setAudioMuted(muted); });
        mutedViews.clear();
      }
    };
    claimProductMicrophone(requestId);
    microphone = { owner: event.sender.id, requestId, cleanup };
    BrowserWindow.getAllWindows().forEach(window => silenceView(window.webContents));
    event.sender.once('destroyed', cleanup);
  });
  ipcMain.handle('fusion:voice:release', (event, requestId: string) => {
    if (microphone?.owner === event.sender.id && microphone.requestId === requestId) microphone.cleanup();
  });
  ipcMain.handle('fusion:speech:status', (event, _provider: string) => {
    if (!isFusionView(event.sender)) throw new Error('untrusted-view');
    return speechStatus();
  });
  ipcMain.handle('fusion:speech:transcribe', async (event, _provider: string, id: string, audioBase64: string, selection: { providerId?: string; language?: string } = {}) => {
    if (!isFusionView(event.sender)) throw new Error('agent-voice-unavailable');
    if (typeof id !== 'string' || recordings.has(id) || typeof audioBase64 !== 'string' || audioBase64.length > 6 * 1024 * 1024) throw new Error('invalid-recording');
    const abort = new AbortController(); recordings.set(id, { owner: event.sender.id, abort });
    const close = (): void => abort.abort(); event.sender.once('destroyed', close);
    try {
      if (selection.providerId === 'floatisland-local-sensevoice') return await localSpeech.transcribe(audioBase64, selection.language, AbortSignal.any([abort.signal, AbortSignal.timeout(180_000)]));
      const result = await native.rpc('speech/transcribe', {
        audioBase64, providerId: typeof selection.providerId === 'string' ? selection.providerId : undefined,
        language: typeof selection.language === 'string' ? selection.language : undefined,
      }, AbortSignal.any([abort.signal, AbortSignal.timeout(180_000)]));
      return String(result.text || '');
    } finally { recordings.delete(id); event.sender.removeListener('destroyed', close); }
  });
  ipcMain.handle('fusion:speech:cancel', (event, id: string) => {
    const recording = recordings.get(id);
    if (recording?.owner === event.sender.id) recording.abort.abort();
  });
  return {
    getSnapshot, start,
    loadModels: async () => {
      const adapter = await choose();
      // ACP inherits the model configured in DeepSeek Harness; it has no catalog API.
      return adapter === native ? native.loadModels() : [];
    },
    ensureStarted: async (): Promise<void> => { await (await choose()).ensureStarted(); },
    loadSessions: async () => {
      const adapter = await choose(); const sessions = await adapter.loadSessions();
      for (const session of sessions) if (!owners.has(session.id)) owners.set(session.id, adapter === native ? 'native' : 'acp');
      publish(); return sessions;
    },
    createSession: async (cwd: string) => {
      const adapter = await choose(); const result = await adapter.createSession(cwd);
      owners.set(result.id, adapter === native ? 'native' : 'acp'); publish(); return result;
    },
    resumeSession: async (id: string) => {
      const adapter = owners.has(id) ? forId(id) : await choose();
      const result = await adapter.resumeSession(id); owners.set(id, adapter === native ? 'native' : 'acp'); publish(); return result;
    },
    prompt: async (id: string, text: string, model?: import('../../preload/types/fusionWorkspace').FusionModel): Promise<void> => {
      if (model && owners.get(id) === 'acp') throw new Error('model-selection-requires-native-connection');
      if (owners.get(id) === 'acp') await acp.prompt(id, text); else await native.prompt(id, text, model);
    },
    cancel: async (id?: string): Promise<void> => {
      const sessionId = id || getSnapshot().activeSessionId;
      if (sessionId) await forId(sessionId).cancel(sessionId);
    },
    answerPermission: async (id: string, value: string | null): Promise<void> => {
      if (native.getSnapshot().pendingRequests.some(r => r.requestId === id)) await native.answerPermission(id, value);
      else acp.answerPermission(id, value);
    },
    answerQuestions: native.answerQuestions,
    stop: async (): Promise<void> => {
      localSpeech.stop();
      if (discovery) clearInterval(discovery); discovery = null;
      for (const recording of recordings.values()) recording.abort.abort();
      await Promise.all([native.stop(), acp.stop()]);
    },
  };
}
