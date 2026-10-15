/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file dshNativeService.ts @description Authenticated client for the installed dsh Cordis host. @author 鸡哥 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import type { FusionDshMessage, FusionDshSnapshot, FusionDshSession, FusionDshPermissionRequest } from '../../preload/types/fusion';
import type { SpeechStatus } from '../../preload/types/fusionWorkspace';
type Raw = Record<string, any>;
const record = (value: unknown): Raw => value && typeof value === 'object' ? value as Raw : {};
const contentText = (value: any): string => typeof value === 'string' ? value : Array.isArray(value) ? value.map(p => p.text || p.content || '').join('') : value?.text || '';
const SNAPSHOT_PUBLISH_INTERVAL_MS = 50;

/** Maintains source cursors and withdraws every request when its event connection closes. */
export function createDshNativeService(changed: () => void, connectionFile = process.env.FUSION_DSH_CONNECTION ||
  join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'FusionIsland', 'dsh-bridge.json'),
  speechChanged: (status: SpeechStatus) => void = () => {}) {
  let snapshot: FusionDshSnapshot = { state: 'stopped', error: null, activeSessionId: null, activeCwd: null, working: false, messages: [], sessions: [], pendingRequests: [], sessionStates: {} };
  let connection: { endpoint: string; token: string } | null = null;
  let generation = new AbortController();
  let timer: NodeJS.Timeout | null = null;
  let publishTimer: NodeJS.Timeout | null = null;
  let polling = false;
  let clientId: string | null = null;
  let eventStream: Promise<void> | null = null;
  let controlStream: Promise<void> | null = null;
  let speechStream: Promise<void> | null = null;
  const speechState = (catalog: Raw | null): SpeechStatus => {
    const provider = catalog?.providers?.find((p: Raw) => p.id === catalog.selection?.providerId);
    // SenseVoice 缓存已准备时使用 standby，首次识别会按需加载工作进程。
    return { available: Boolean(catalog), ready: ['ready', 'standby'].includes(provider?.preparation?.phase),
      providerId: catalog?.selection?.providerId, language: catalog?.selection?.language,
      reason: catalog ? provider?.preparation?.phase || 'dsh-voice-not-ready' : 'dsh-voice-not-enabled',
      maxAudioBytes: catalog?.maxAudioBytes || 4 * 1024 * 1024, maxDurationSeconds: catalog?.maxDurationSeconds || 120 };
  };
  const followed = new Map<string, AbortController>();
  const cursors = new Map<string, number>();
  const streams = new Map<string, { attempt: string; index: number; text: string }>();
  const requestFrames = new Map<string, Raw>();
  const submitted = new Set<string>();
  const owned = new Set<string>();
  const sending = new Set<string>();
  const update = (): void => {
    const active = snapshot.activeSessionId ? snapshot.sessionStates![snapshot.activeSessionId] : undefined;
    snapshot = { ...snapshot, ...(active || { messages: [], working: false, activeCwd: null }) };
    if (publishTimer) return;
    publishTimer = setTimeout(() => {
      publishTimer = null;
      changed();
    }, SNAPSHOT_PUBLISH_INTERVAL_MS);
  };
  const flushUpdate = (): void => {
    if (publishTimer) clearTimeout(publishTimer);
    publishTimer = null;
    changed();
  };
  const session = (id: string) => snapshot.sessionStates![id] ||= { messages: [], working: false, activeCwd: null, error: null };
  const credentials = (): { endpoint: string; token: string } => {
    const config = JSON.parse(readFileSync(connectionFile, 'utf8'));
    const url = new URL(config.endpoint);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || !/^[a-f0-9]{64}$/.test(config.token)) throw new Error('invalid-dsh-connection');
    return { endpoint: url.origin, token: config.token };
  };
  const rpc = async (method: string, args: Raw = {}, signal?: AbortSignal): Promise<any> => {
    const config = credentials();
    const response = await fetch(config.endpoint + '/rpc', {
      method: 'POST', headers: { authorization: 'Bearer ' + config.token, 'content-type': 'application/json' },
      body: JSON.stringify({ method, args, requestId: randomUUID() }),
      signal: AbortSignal.any([generation.signal, signal || AbortSignal.timeout(method === 'speech/transcribe' ? 180_000 : 30_000)]),
    });
    const result = await response.json() as Raw;
    if (!response.ok || result.error) throw new Error(result.error || 'dsh-bridge-failed');
    return result.value;
  };
  const stream = async (path: string, signal: AbortSignal, accept: (frame: Raw) => void): Promise<void> => {
    const config = credentials();
    const response = await fetch(config.endpoint + path, { headers: { authorization: 'Bearer ' + config.token }, signal });
    if (!response.ok || !response.body) throw new Error('dsh-stream-unavailable');
    const decoder = new TextDecoder(); let buffer = '';
    for await (const chunk of response.body as any) {
      if (signal.aborted) return;
      buffer += decoder.decode(chunk, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        const frame = JSON.parse(line);
        if (frame.error) throw new Error(frame.error);
        if (frame.type !== 'heartbeat') accept(frame);
      }
    }
    if (!signal.aborted) throw new Error('dsh-stream-closed');
  };
  const upsert = (id: string, message: FusionDshMessage): boolean => {
    const target = session(id);
    const index = target.messages.findIndex(m => m.id === message.id);
    const previous = target.messages[index];
    if (previous?.text === message.text && previous.role === message.role && previous.status === message.status) return false;
    // 原位替换流式消息，避免每个增量复制整个数组或改变工具记录顺序。
    if (index >= 0) target.messages[index] = message;
    else {
      target.messages.push(message);
      if (target.messages.length > 300) target.messages.shift();
    }
    return true;
  };
  const acceptEvent = (id: string, event: Raw): boolean => {
    if (typeof event.seq === 'number') {
      if (event.seq <= (cursors.get(id) ?? -1)) return false;
      cursors.set(id, event.seq);
    }
    let dirty = false;
    const data = record(event.data);
    if (event.type === 'turn/start' || event.type === 'turn/end') {
      const working = event.type === 'turn/start';
      dirty = session(id).working !== working;
      session(id).working = working;
    }
    if (['user/message', 'assistant/message', 'assistant/attempt'].includes(event.type)) {
      const message = record(data.message || data);
      if (event.type !== 'user/message') {
        dirty = session(id).messages.some(m => m.id.startsWith('stream:'));
        session(id).messages = session(id).messages.filter(m => !m.id.startsWith('stream:'));
        streams.delete(id);
      }
      const text = contentText(message.content);
      if (text) dirty = upsert(id, { id: String(message.id || event.seq), role: event.type === 'user/message' ? 'user' : 'assistant', text }) || dirty;
    }
    if (event.type === 'tool/call' || event.type === 'tool/result') {
      const callId = String(data.callId || data.id || event.seq);
      dirty = session(id).messages.some(message => message.id === 'stream-tool:' + callId);
      session(id).messages = session(id).messages.filter(message => message.id !== 'stream-tool:' + callId);
      dirty = upsert(id, { id: 'tool:' + String(data.callId || data.id || event.seq), role: 'tool',
        text: data.name ? data.name + (data.arguments ? '\n' + JSON.stringify(data.arguments) : '') : contentText(data.content) || JSON.stringify(data),
        status: event.type === 'tool/call' ? 'inProgress' : data.error ? 'failed' : 'completed' }) || dirty;
    }
    return dirty;
  };
  const acceptChunk = (id: string, chunk: Raw): boolean => {
    const active = streams.get(id);
    if (!active) return false;
    if (chunk.type === 'text-delta' && chunk.text) {
      active.text += String(chunk.text);
      return upsert(id, { id: 'stream:' + active.attempt, role: 'assistant', text: active.text });
    }
    if (chunk.type === 'tool-call-delta') {
      const toolId = 'stream-tool:' + String(chunk.id || chunk.index);
      const previous = session(id).messages.find(message => message.id === toolId);
      return upsert(id, { id: toolId, role: 'tool', status: 'inProgress',
        text: (previous?.text || String(chunk.name || '')) + String(chunk.argumentsDelta || '') });
    }
    return false;
  };
  const acceptHistory = (id: string, frame: Raw): void => {
    let dirty = false;
    if (frame.type === 'snapshot') {
      dirty = true;
      session(id).messages = []; cursors.delete(id); streams.delete(id);
      for (const entry of frame.records || []) acceptEvent(id, record(entry.event));
      if (typeof frame.cursor === 'number') cursors.set(id, frame.cursor);
      const opening = frame.assistantStream?.activeAttempt;
      if (opening && Array.isArray(opening.stream) && Number.isSafeInteger(opening.nextIndex)) {
        streams.set(id, { attempt: String(opening.attemptId), index: opening.nextIndex, text: '' });
        // Native reconnect baselines compact adjacent deltas into runs.
        for (const run of opening.stream) {
          if (run.type === 'chunk') acceptChunk(id, record(run.chunk));
          else if (run.type === 'text-chunks' && Array.isArray(run.texts)) {
            acceptChunk(id, { type: 'text-delta', text: run.texts.join('') });
          } else if (run.type === 'tool-call-chunks' && Array.isArray(run.args)) {
            acceptChunk(id, { type: 'tool-call-delta', id: run.id, index: run.index, name: run.name, argumentsDelta: run.args.join('') });
          }
        }
      }
    } else if (frame.type === 'event') dirty = acceptEvent(id, record(frame.event));
    else if (frame.type === 'assistant-stream') {
      const part = record(frame.frame);
      if (part.type === 'start') streams.set(id, { attempt: String(part.attemptId), index: 0, text: '' });
      const active = streams.get(id);
      if (part.type === 'chunk' && active && active.attempt === part.attemptId && part.index !== active.index) {
        throw new Error('dsh-stream-gap');
      }
      if (part.type === 'chunk' && active && active.attempt === part.attemptId && active.index === part.index) {
        active.index++;
        dirty = acceptChunk(id, record(part.chunk));
      }
      if (part.type === 'end' && active && active.attempt === part.attemptId && part.outcome?.kind === 'abandoned') {
        dirty = session(id).messages.some(message => message.id === 'stream:' + active.attempt);
        session(id).messages = session(id).messages.filter(message => message.id !== 'stream:' + active.attempt);
        streams.delete(id);
      }
    }
    if (dirty) update();
  };
  const follow = (id: string): void => {
    if (followed.has(id)) return;
    const abort = new AbortController(); followed.set(id, abort);
    const signal = AbortSignal.any([generation.signal, abort.signal]);
    void stream('/follow?sessionId=' + encodeURIComponent(id), signal, frame => acceptHistory(id, frame)).catch(error => {
      if (!signal.aborted) { session(id).error = String(error); update(); }
    }).finally(() => { if (followed.get(id) === abort) followed.delete(id); });
  };
  const interaction = (frame: Raw): void => {
    if (frame.type === 'ready') { clientId = frame.clientId; return; }
    if (frame.type === 'cancel') {
      requestFrames.delete(frame.eventId); submitted.delete(frame.eventId);
      snapshot.pendingRequests = snapshot.pendingRequests.filter(r => r.requestId !== frame.eventId); update(); return;
    }
    if (frame.type !== 'waterfall' || !['approval/request', 'user-questions/request'].includes(frame.event)) return;
    requestFrames.set(frame.eventId, frame);
    const request = record(frame.request);
    const question = frame.event === 'user-questions/request';
    const item: FusionDshPermissionRequest = {
      requestId: frame.eventId, sessionId: frame.agentId, title: String(request.tool || request.reason || frame.event),
      description: String(request.reason || ''), options: question ? [] : [
        { optionId: 'allowed-once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'rejected', name: 'Deny', kind: 'reject_once' },
      ],
      questions: question ? request.questions : undefined, native: true,
    };
    snapshot.pendingRequests = [...snapshot.pendingRequests.filter(r => r.requestId !== item.requestId), item]; update();
  };
  const drop = (): void => {
    generation.abort(); generation = new AbortController();
    eventStream = null; controlStream = null; clientId = null; requestFrames.clear(); submitted.clear();
    speechStream = null;
    speechChanged({ ...speechState(null), reason: 'dsh-disconnected' });
    for (const active of followed.values()) active.abort();
    followed.clear(); streams.clear();
    snapshot.pendingRequests = [];
    snapshot.state = 'stopped';
    for (const entry of Object.values(snapshot.sessionStates!)) { entry.working = false; entry.error = 'dsh-disconnected'; }
    update();
  };
  const refresh = async (): Promise<FusionDshSession[]> => {
    const config = credentials();
    if (!connection || connection.token !== config.token || connection.endpoint !== config.endpoint) {
      drop(); connection = config;
    }
    const lifetime = generation.signal;
    const result = await rpc('list');
    // 即使底层响应已进入 JSON 解析，停止或更换连接后也不能恢复旧状态。
    if (lifetime.aborted) return snapshot.sessions;
    const previous = JSON.stringify([snapshot.state, snapshot.error, snapshot.sessions, snapshot.pendingRequests]);
    let dirty = false;
    snapshot.pendingRequests = snapshot.pendingRequests.filter(r => !r.requestId.startsWith('continued:'));
    snapshot.sessions = (result.items || []).map((row: Raw) => {
      const state = session(row.sessionId);
      dirty = dirty || state.working !== (row.running === true || sending.has(row.sessionId)) || state.activeCwd !== (row.cwd || null) || state.error !== null;
      state.working = row.running === true || sending.has(row.sessionId); state.activeCwd = row.cwd || null; state.error = null;
      const questions = row.projections?.values?.userQuestions;
      for (const pending of questions?.active || questions?.questions?.active || []) {
        if (pending.state !== 'continued') continue;
        const id = 'continued:' + row.sessionId + ':' + pending.callId;
        snapshot.pendingRequests.push({ requestId: id, sessionId: row.sessionId, title: '', description: '', options: [],
          questions: pending.questions, native: true, submitted: submitted.has(id) });
      }
      if (row.running || owned.has(row.sessionId)) follow(row.sessionId);
      return { id: row.sessionId, cwd: row.cwd || '', title: row.projections?.values?.sessionTitle?.title || row.projections?.values?.sessionListMetadata?.lastPromptPreview || row.sessionId };
    });
    snapshot.state = 'ready'; snapshot.error = null;
    if (!speechStream) {
      const current = stream('/speech/follow', lifetime, catalog => speechChanged(speechState(catalog)))
        .catch(() => { if (!lifetime.aborted) speechChanged(speechState(null)); })
        .finally(() => { if (speechStream === current) speechStream = null; });
      speechStream = current;
    }
    if (!eventStream) {
      const current = stream('/events', lifetime, interaction).catch(() => {
        if (lifetime.aborted) return;
        clientId = null; requestFrames.clear(); submitted.clear(); snapshot.pendingRequests = []; update();
      }).finally(() => { if (eventStream === current) eventStream = null; });
      eventStream = current;
    }
    if (!controlStream) {
      const current = stream('/control', lifetime, () => { /* next bounded list refresh reads authoritative projections */ })
        .catch(() => {}).finally(() => { if (controlStream === current) controlStream = null; });
      controlStream = current;
    }
    if (dirty || previous !== JSON.stringify([snapshot.state, snapshot.error, snapshot.sessions, snapshot.pendingRequests])) update();
    return snapshot.sessions;
  };
  return {
    getSnapshot: (): FusionDshSnapshot => structuredClone(snapshot),
    connected: (): boolean => snapshot.state === 'ready',
    loadModels: async () => {
      const catalog = await rpc('models');
      return (catalog.groups || []).flatMap((group: Raw) => (group.models || []).map((model: Raw) => ({ id: model.id, name: group.name + ' · ' + (model.name || model.id), provider: group.id })));
    },
    rpc,
    start: (): void => {
      if (timer) return;
      const poll = async (): Promise<void> => {
        if (polling) return; polling = true;
        try { await refresh(); } catch { if (snapshot.state === 'ready') drop(); } finally { polling = false; }
      };
      timer = setInterval(() => { void poll(); }, 2000); void poll();
    },
     stop: async (): Promise<void> => {
       if (timer) clearInterval(timer);
       timer = null;
       drop();
       flushUpdate();
     },
    ensureStarted: async (): Promise<void> => { await refresh(); },
    loadSessions: refresh,
    createSession: async (cwd: string): Promise<FusionDshSession> => {
      const result = await rpc('create', { cwd }); const id = result.sessionId;
      owned.add(id); snapshot.activeSessionId = id; session(id).activeCwd = cwd; follow(id); await refresh();
      update();
      return snapshot.sessions.find(s => s.id === id) || { id, cwd };
    },
    resumeSession: async (id: string): Promise<FusionDshSession> => {
      if (!owned.has(id)) await rpc('resume', { sessionId: id });
      owned.add(id); snapshot.activeSessionId = id; follow(id); await refresh();
      update();
      return snapshot.sessions.find(s => s.id === id) || { id, cwd: '' };
    },
    prompt: async (id: string, text: string, model?: import('../../preload/types/fusionWorkspace').FusionModel): Promise<void> => {
      if (!owned.has(id)) throw new Error('select-session-before-sending');
      if (session(id).working) throw new Error('session-already-running');
      sending.add(id); session(id).working = true; update();
      try { await rpc('prompt', { sessionId: id, requestId: randomUUID(), text, ...(model ? { model } : {}) }); }
      catch (error) { session(id).working = false; session(id).error = String(error); update(); throw error; }
      finally { sending.delete(id); }
    },
    cancel: async (id = snapshot.activeSessionId): Promise<void> => { if (id) await rpc('cancel', { sessionId: id }); },
    answerPermission: async (id: string, value: string | null): Promise<void> => {
      if (!clientId || !requestFrames.has(id)) throw new Error('request-expired');
      if (submitted.has(id)) throw new Error('request-already-submitted');
      submitted.add(id);
      snapshot.pendingRequests = snapshot.pendingRequests.map(r => r.requestId === id ? { ...r, submitted: true } : r); update();
      try { await rpc('interaction/answer', { clientId, eventId: id, value }); }
      catch (error) { submitted.delete(id); snapshot.pendingRequests = snapshot.pendingRequests.map(r => r.requestId === id ? { ...r, submitted: false } : r); update(); throw error; }
    },
    answerQuestions: async (id: string, answers: unknown): Promise<void> => {
      const continued = snapshot.pendingRequests.find(r => r.requestId === id && id.startsWith('continued:'));
      if (continued) {
        if (submitted.has(id)) throw new Error('request-already-submitted');
        submitted.add(id); continued.submitted = true; update();
        try { await rpc('questions/continued', { sessionId: continued.sessionId, callId: id.slice(('continued:' + continued.sessionId + ':').length), answers }); }
        catch (error) { submitted.delete(id); continued.submitted = false; update(); throw error; }
        return;
      }

      if (!clientId || !requestFrames.has(id) || submitted.has(id)) throw new Error('request-expired');
      submitted.add(id);
      snapshot.pendingRequests = snapshot.pendingRequests.map(r => r.requestId === id ? { ...r, submitted: true } : r); update();
      try { await rpc('interaction/answer', { clientId, eventId: id, value: { answers } }); }
      catch (error) { submitted.delete(id); snapshot.pendingRequests = snapshot.pendingRequests.map(r => r.requestId === id ? { ...r, submitted: false } : r); update(); throw error; }
    },
    speechStatus: async (): Promise<SpeechStatus> => {
      try {
        const catalog = await rpc('speech/catalog');
        return speechState(catalog);
      } catch { return { available: false, ready: false, reason: 'dsh-disconnected', maxAudioBytes: 0, maxDurationSeconds: 0 }; }
    },
  };
}

