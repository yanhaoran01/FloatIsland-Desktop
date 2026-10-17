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
 * @file dshAcpService.ts
 * @description Connects the local DeepSeek Harness ACP profile over private stdio.
 * @author 鸡哥
 */

import { broadcastFusion } from './fusionWindows';
import { type ChildProcessWithoutNullStreams } from 'child_process';
import { resolveAgentExecutable, spawnAgent, stopAgent } from './agentExecutable';
import { createInterface, type Interface as ReadlineInterface } from 'readline';
import type { BrowserWindow } from 'electron';
import type {
  FusionDshMessage,
  FusionDshPermissionRequest,
  FusionDshSession,
  FusionDshSnapshot,
} from '../../preload/types/fusion';

interface RpcMessage {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string; code?: number };
}

interface RpcWaiter {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface DshAcpServiceOptions {
  getMainWindow: () => BrowserWindow | null;
  onSnapshot?: () => void;
}

const EMPTY_SNAPSHOT: FusionDshSnapshot = {
  state: 'stopped', error: null, activeSessionId: null, activeCwd: null,
  working: false, sessions: [], messages: [], pendingRequests: [],
};

/**
 * Creates a local ACP client for the installed DSH profile.
 * @param options - Main window accessor used to forward session events.
 * @returns Session, prompt, cancellation, and permission operations.
 */
export function createDshAcpService(options: DshAcpServiceOptions) {
  let processHandle: ChildProcessWithoutNullStreams | null = null;
  let reader: ReadlineInterface | null = null;
  let sequence = 0;
  let initialized = false;
  let startPromise: Promise<void> | null = null;
  let snapshot: FusionDshSnapshot = structuredClone(EMPTY_SNAPSHOT);
  type SessionState = Pick<FusionDshSnapshot, 'messages' | 'working' | 'activeCwd' | 'error'>;
  const states = new Map<string, SessionState>();
  const loadedSessions = new Set<string>();
  const resumes = new Map<string, Promise<FusionDshSession>>();
  let routing = false;
  const saveSession = (): void => {
    if (snapshot.activeSessionId) states.set(snapshot.activeSessionId, {
      messages: snapshot.messages, working: snapshot.working, activeCwd: snapshot.activeCwd, error: snapshot.error,
    });
  };
  const selectSession = (id: string | null): void => {
    saveSession(); const state = id ? states.get(id) : undefined;
    snapshot = { ...snapshot, activeSessionId: id, ...(state || { messages: [], working: false, activeCwd: null, error: null }) };
  };
  const forSession = (id: string, action: () => void): void => {
    const previous = snapshot.activeSessionId; selectSession(id); routing = true;
    try { action(); saveSession(); }
    finally { selectSession(previous); routing = false; publish(); }
  };
  const waiters = new Map<number, RpcWaiter>();
  const requestIds = new Map<string, number | string>();
  let stderrLogged = false;

  const publish = (): void => {
    if (routing) return;
    if (options.onSnapshot) { options.onSnapshot(); return; }
    broadcastFusion('fusion:dsh:updated', structuredClone({ ...snapshot, sessionStates: Object.fromEntries(states) }));
  };

  const patch = (changes: Partial<FusionDshSnapshot>): void => {
    snapshot = { ...snapshot, ...changes };
    saveSession();
    publish();
  };

  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? value as Record<string, unknown> : {};

  const write = (message: Record<string, unknown>): void => {
    if (!processHandle || processHandle.stdin.destroyed) throw new Error('dsh ACP is not connected.');
    processHandle.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const request = <T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 90000): Promise<T> => {
    const id = ++sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(id);
        reject(new Error(`dsh ACP request timed out: ${method}`));
      }, timeoutMs);
      waiters.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      try {
        write({ jsonrpc: '2.0', id, method, params });
      } catch (error) {
        clearTimeout(timer);
        waiters.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  const rejectWaiters = (reason: Error): void => {
    for (const waiter of waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(reason);
    }
    waiters.clear();
  };

  const parseSession = (value: unknown): FusionDshSession | null => {
    const session = asRecord(value);
    const id = typeof session.sessionId === 'string' ? session.sessionId : null;
    if (!id) return null;
    return {
      id,
      cwd: typeof session.cwd === 'string' ? session.cwd : '',
      title: typeof session.title === 'string' ? session.title : undefined,
    };
  };

  const receive = (line: string): void => {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      return;
    }

    if (message.id !== undefined && !message.method) {
      const waiter = waiters.get(Number(message.id));
      if (!waiter) return;
      clearTimeout(waiter.timer);
      waiters.delete(Number(message.id));
      if (message.error) waiter.reject(new Error(message.error.message || 'dsh ACP request failed.'));
      else waiter.resolve(message.result);
      return;
    }
    if (message.method && message.id !== undefined) {
      handleServerRequest(message);
      return;
    }
    if (message.method === 'session/update') handleSessionUpdate(asRecord(message.params));
  };

  const handleServerRequest = (message: RpcMessage): void => {
    if (message.method !== 'session/request_permission' || message.id === undefined) {
      if (message.id !== undefined) write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported dsh request.' } });
      return;
    }
    const params = asRecord(message.params);
    const sessionId = String(params.sessionId || '');
    if (!sessionId) {
      // A permission prompt belongs to the session that raised it. Never let an
      // old or background session's request be approved from the visible card.
      write({ jsonrpc: '2.0', id: message.id, result: { outcome: { outcome: 'cancelled' } } });
      return;
    }
    const toolCall = asRecord(params.toolCall);
    const requestId = String(message.id);
    requestIds.set(requestId, message.id);
    const request: FusionDshPermissionRequest = {
      requestId,
      sessionId,
      title: String(params.title || toolCall.title || 'Permission request'),
      description: String(params.description || ''),
      toolTitle: typeof toolCall.title === 'string' ? toolCall.title : undefined,
      options: Array.isArray(params.options) ? params.options.map((option) => {
        const item = asRecord(option);
        return { optionId: String(item.optionId || ''), name: String(item.name || ''), kind: String(item.kind || '') };
      }) : [],
    };
    patch({ pendingRequests: [...snapshot.pendingRequests, request] });
  };

  const handleSessionUpdate = (params: Record<string, unknown>): void => {
    const sessionId = String(params.sessionId || '');
    if (sessionId && sessionId !== snapshot.activeSessionId) {
      forSession(sessionId, () => handleSessionUpdate(params)); return;
    }
    const update = asRecord(params.update);
    const kind = String(update.sessionUpdate || '');
    if (kind === 'agent_message_chunk' || kind === 'user_message_chunk') {
      const content = asRecord(update.content);
      const role: FusionDshMessage['role'] = kind === 'user_message_chunk' ? 'user' : 'assistant';
      const delta = content.type === 'text' && typeof content.text === 'string' ? content.text : '';
      const messages = [...snapshot.messages];
      const lastMessage = messages.at(-1);
      if (lastMessage?.role === role) messages[messages.length - 1] = { ...lastMessage, text: lastMessage.text + delta };
      else messages.push({ id: `dsh-${Date.now()}-${messages.length}`, role, text: delta });
      patch({ messages });
      return;
    }
    if (kind === 'tool_call' || kind === 'tool_call_update') {
      const title = String(update.title || update.kind || 'Tool');
      const status = String(update.status || 'in_progress');
      const toolCallId = String(update.toolCallId || `dsh-tool-${Date.now()}`);
      const messages = [...snapshot.messages];
      const index = messages.findIndex((entry) => entry.id === toolCallId);
      const toolMessage = { id: toolCallId, role: 'tool' as const, text: title, status };
      if (index >= 0) messages[index] = toolMessage;
      else messages.push(toolMessage);
      patch({ messages });
      return;
    }
    if (kind === 'current_mode_update') {
      patch({ messages: [...snapshot.messages, { id: `dsh-mode-${Date.now()}`, role: 'tool', text: String(update.currentModeId || ''), status: 'mode' }] });
      return;
    }
    if (kind === 'session_info_update') {
      const title = typeof update.title === 'string' ? update.title : undefined;
      if (title && snapshot.activeSessionId) {
        patch({ sessions: snapshot.sessions.map((session) => session.id === snapshot.activeSessionId ? { ...session, title } : session) });
      }
      return;
    }
    if (kind === 'state_update') {
      const state = String(update.state || '');
      patch({ working: state === 'working' || state === 'requires_action' });
    }
  };

  const ensureStarted = async (): Promise<void> => {
    if (initialized && processHandle) return;
    if (startPromise) return startPromise;
    startPromise = (async () => {
      patch({ state: 'starting', error: null });
      const child = spawnAgent(resolveAgentExecutable('dsh', process.env.FUSION_DSH_EXECUTABLE), ['--profile', 'acp']);
      processHandle = child;
      loadedSessions.clear();
      reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
      reader.on('line', receive);
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (!stderrLogged && text) {
          stderrLogged = true;
          console.info('[FusionIsland:dsh]', text.slice(0, 500));
        }
      });
      child.once('error', (error) => {
        if (processHandle !== child) return;
        initialized = false;
        patch({ state: 'error', working: false, error: error.message });
        rejectWaiters(error);
      });
      child.once('exit', (code, signal) => {
        if (processHandle !== child) return;
        initialized = false;
        loadedSessions.clear();
        for (const state of states.values()) state.working = false;
        requestIds.clear();
        processHandle = null;
        reader?.close();
        reader = null;
        const error = code === 0 ? null : `dsh ACP stopped (${signal || code || 'unknown'}).`;
        patch({ state: error ? 'error' : 'stopped', working: false, pendingRequests: [], error });
        rejectWaiters(new Error(error || 'dsh ACP stopped.'));
      });
      const result = asRecord(await request('initialize', {
        protocolVersion: 1,
        clientInfo: { name: 'fusionisland', version: '1.0.0' },
        clientCapabilities: {},
      }, 30000));
      if (!result.agentInfo) throw new Error('The installed dsh ACP profile returned an invalid initialize response.');
      if (processHandle !== child) throw new Error('dsh connection was closed during startup.');
      write({ jsonrpc: '2.0', method: 'initialized', params: {} });
      initialized = true;
      patch({ state: 'ready', error: null });
    })().catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const child = processHandle; processHandle = null;
      reader?.close(); reader = null; initialized = false;
      await stopAgent(child);
      rejectWaiters(new Error(message));
      patch({ state: 'error', error: message, working: false });
      throw error;
    }).finally(() => {
      startPromise = null;
    });
    return startPromise;
  };

  const loadSessions = async (): Promise<FusionDshSession[]> => {
    await ensureStarted();
    const result = asRecord(await request('session/list'));
    const sessions = Array.isArray(result.sessions)
      ? result.sessions.map(parseSession).filter((session): session is FusionDshSession => session !== null)
      : [];
    patch({ sessions });
    return sessions;
  };

  return {
    getSnapshot: (): FusionDshSnapshot => structuredClone({ ...snapshot, sessionStates: Object.fromEntries(states) }),
    ensureStarted,
    loadSessions,
    createSession: async (cwd: string): Promise<FusionDshSession> => {
      await ensureStarted();
      const result = asRecord(await request('session/new', { cwd, mcpServers: [] }));
      const session = parseSession({ sessionId: result.sessionId, cwd });
      if (!session) throw new Error('dsh did not return a session identifier.');
      loadedSessions.add(session.id);
      selectSession(session.id);
      patch({ activeSessionId: session.id, activeCwd: cwd, working: false, messages: [], error: null, sessions: [session, ...snapshot.sessions.filter((item) => item.id !== session.id)] });
      return session;
    },
    resumeSession: (sessionId: string): Promise<FusionDshSession> => {
      const pending = resumes.get(sessionId); if (pending) return pending;
      const task = (async () => {
      await ensureStarted();
      let session = snapshot.sessions.find((item) => item.id === sessionId);
      if (!session) session = (await loadSessions()).find(item => item.id === sessionId);
      if (!session) throw new Error('The dsh session is no longer available. Refresh the session list and try again.');
      if (loadedSessions.has(sessionId)) { selectSession(sessionId); publish(); return session; }
      selectSession(sessionId);
      // ACP can start streaming updates as part of session/resume. Select the
      // target first so its history is accepted instead of discarded as stale.
      patch({ activeSessionId: session.id, activeCwd: session.cwd, working: false, messages: [], error: null });
      await request('session/resume', { sessionId, cwd: session.cwd, mcpServers: [] });
      loadedSessions.add(sessionId);
      return session;
      })().finally(() => { resumes.delete(sessionId); });
      resumes.set(sessionId, task); return task;
    },
    prompt: async (sessionId: string, text: string): Promise<void> => {
      await ensureStarted();
      selectSession(sessionId);
      if (snapshot.working) throw new Error('session-already-running');
      patch({ activeSessionId: sessionId, working: true, error: null, messages: [...snapshot.messages, { id: `dsh-user-${Date.now()}`, role: 'user', text }] });
      try { await request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] }, 15 * 60 * 1000); }
      catch (error) {
        forSession(sessionId, () => patch({ error: error instanceof Error ? error.message : String(error) }));
        throw error;
      }
      finally { forSession(sessionId, () => patch({ working: false })); }
    },
    cancel: async (sessionId = snapshot.activeSessionId): Promise<void> => {
      saveSession();
      if (!sessionId || !states.get(sessionId)?.working) return;
      write({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } });
    },
    answerPermission: (requestId: string, optionId: string | null): void => {
      const request = snapshot.pendingRequests.find((item) => item.requestId === requestId);
      const rpcId = requestIds.get(requestId);
      if (!request || rpcId === undefined) throw new Error('request-expired');
      if (optionId && request.options.some((item) => item.optionId === optionId)) {
        write({ jsonrpc: '2.0', id: rpcId, result: { outcome: { outcome: 'selected', optionId } } });
      } else {
        write({ jsonrpc: '2.0', id: rpcId, result: { outcome: { outcome: 'cancelled' } } });
      }
      requestIds.delete(requestId);
      patch({ pendingRequests: snapshot.pendingRequests.filter((item) => item.requestId !== requestId) });
    },
    stop: async (): Promise<void> => {
      initialized = false;
      reader?.close();
      reader = null;
      const child = processHandle;
      processHandle = null;
      await stopAgent(child);
      rejectWaiters(new Error('dsh ACP stopped.'));
      loadedSessions.clear(); states.clear(); requestIds.clear();
      patch({ ...EMPTY_SNAPSHOT });
    },
  };

}
