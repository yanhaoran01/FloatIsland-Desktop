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
 * @file codexAppServerService.ts
 * @description Runs a private Codex App Server connection for island-owned sessions.
 * @author 鸡哥
 */

import { reportAgentCompletion, broadcastFusion } from './fusionWindows';
import {recordCodexUsage,recordCodexLimits} from './agentHudUsage';
import { type ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface, type Interface as ReadlineInterface } from 'readline';
import { resolveAgentExecutable, spawnAgent, stopAgent } from './agentExecutable';
import type { BrowserWindow } from 'electron';
import type {
  FusionCodexDecision,
  FusionCodexMessage,
  FusionCodexRequest,
  FusionCodexSnapshot,
  FusionCodexThread,
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

interface CodexAppServerServiceOptions {
  getMainWindow: () => BrowserWindow | null;
}

const EMPTY_SNAPSHOT: FusionCodexSnapshot = {
  state: 'stopped',
  error: null,
  activeThreadId: null,
  activeTurnId: null,
  working: false,
  threads: [],
  messages: [],
  pendingRequests: [],
};

/**
 * Creates the local Codex App Server bridge.
 * @param options - Main window accessor used to forward session events.
 * @returns Lifecycle and conversation operations for the Codex bridge.
 */
export function createCodexAppServerService(_options: CodexAppServerServiceOptions) {
  let processHandle: ChildProcessWithoutNullStreams | null = null;
  let reader: ReadlineInterface | null = null;
  let sequence = 0;
  let initialized = false;
  let startPromise: Promise<void> | null = null;
  const loadedThreads = new Set<string>();
  const resumes = new Map<string, Promise<FusionCodexThread>>();
  let snapshot: FusionCodexSnapshot = structuredClone(EMPTY_SNAPSHOT);
  type ThreadState = Pick<FusionCodexSnapshot, 'messages' | 'working' | 'activeTurnId' | 'error'>;
  const threadStates = new Map<string, ThreadState>();
  let routing = false;
  const requestRpcIds = new Map<string, string | number>();
  const submittedRequests = new Set<string>();
  const saveThread = (): void => {
    if (snapshot.activeThreadId) threadStates.set(snapshot.activeThreadId, {
      messages: snapshot.messages, working: snapshot.working, activeTurnId: snapshot.activeTurnId, error: snapshot.error,
    });
  };
  const selectThread = (id: string | null): void => {
    saveThread();
    const state = id ? threadStates.get(id) : undefined;
    snapshot = { ...snapshot, activeThreadId: id, ...(state || { messages: [], working: false, activeTurnId: null, error: null }) };
  };
  const forThread = (id: string, action: () => void): void => {
    const previous = snapshot.activeThreadId;
    selectThread(id); routing = true;
    try { action(); saveThread(); }
    finally { selectThread(previous); routing = false; publish(); }
  };
  const waiters = new Map<number, RpcWaiter>();
  const requestMethods = new Map<string, FusionCodexRequest['method']>();

  const publish = (): void => {
    if (routing) return;
    broadcastFusion('fusion:codex:updated', structuredClone({ ...snapshot, sessionStates: Object.fromEntries(threadStates) }));
  };

  const patch = (changes: Partial<FusionCodexSnapshot>): void => {
    snapshot = { ...snapshot, ...changes };
    saveThread();
    publish();
  };

  const write = (message: Record<string, unknown>): void => {
    if (!processHandle || processHandle.stdin.destroyed) throw new Error('Codex App Server is not connected.');
    processHandle.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const request = <T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 90000): Promise<T> => {
    const id = ++sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      waiters.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      try {
        write({ id, method, params });
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

  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? value as Record<string, unknown> : {};

  const parseThread = (value: unknown): FusionCodexThread | null => {
    const thread = asRecord(value);
    if (typeof thread.id !== 'string') return null;
    return {
      id: thread.id,
      name: typeof thread.name === 'string' && thread.name ? thread.name : 'Codex session',
      preview: typeof thread.preview === 'string' ? thread.preview : '',
      cwd: typeof thread.cwd === 'string' ? thread.cwd : undefined,
      updatedAt: typeof thread.updatedAt === 'number' ? thread.updatedAt : undefined,
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
      if (message.error) waiter.reject(new Error(message.error.message || 'Codex request failed.'));
      else waiter.resolve(message.result);
      return;
    }

    if (message.method && message.id !== undefined) {
      handleServerRequest(message);
      return;
    }
    if (message.method) handleNotification(message.method, asRecord(message.params));
  };

  const handleServerRequest = (message: RpcMessage): void => {
    const params = asRecord(message.params);
    const method = message.method;
    if (!method || message.id === undefined) return;
    if (method !== 'item/commandExecution/requestApproval'
      && method !== 'item/fileChange/requestApproval'
      && method !== 'item/tool/requestUserInput') {
      write({ id: message.id, error: { code: -32601, message: 'This request is not supported by FusionIsland.' } });
      return;
    }

    const requestId = String(message.id);
    requestMethods.set(requestId, method);
    requestRpcIds.set(requestId, message.id);
    const questions = Array.isArray(params.questions)
      ? params.questions.map((entry) => {
        const question = asRecord(entry);
        const options = Array.isArray(question.options) ? question.options.map((option) => {
          const item = asRecord(option);
          return { label: String(item.label || ''), description: String(item.description || '') };
        }) : [];
        return {
          id: String(question.id || ''),
          header: String(question.header || ''),
          question: String(question.question || ''),
          options,
        };
      })
      : undefined;
    const requestData: FusionCodexRequest = {
      requestId,
      method,
      threadId: String(params.threadId || ''),
      turnId: typeof params.turnId === 'string' ? params.turnId : undefined,
      itemId: typeof params.itemId === 'string' ? params.itemId : undefined,
      reason: typeof params.reason === 'string' ? params.reason : undefined,
      command: typeof params.command === 'string' ? params.command : undefined,
      cwd: typeof params.cwd === 'string' ? params.cwd : undefined,
      pathSummary: typeof params.grantRoot === 'string' ? params.grantRoot : undefined,
      questions,
    };
    patch({ pendingRequests: [...snapshot.pendingRequests, requestData] });
  };

  const handleNotification = (method: string, params: Record<string, unknown>): void => {
    if(method==='account/rateLimits/updated'){recordCodexLimits(params);return;}
    if(method==='thread/tokenUsage/updated'&&typeof params.threadId==='string')recordCodexUsage(params.threadId,asRecord(params.tokenUsage),Date.now());
    const threadId = typeof params.threadId === 'string' ? params.threadId : asRecord(params.thread).id;
    if (typeof threadId === 'string' && threadId !== snapshot.activeThreadId) {
      forThread(threadId, () => handleThreadNotification(method, params));
    } else handleThreadNotification(method, params);
  };
  const handleThreadNotification = (method: string, params: Record<string, unknown>): void => {
    if (method === 'thread/started') {
      const thread = parseThread(params.thread);
      if (!thread) return;
      patch({ activeThreadId: thread.id, threads: [thread, ...snapshot.threads.filter((item) => item.id !== thread.id)] });
      return;
    }
    if (method === 'turn/started') {
      const turn = asRecord(params.turn);
      patch({ activeTurnId: typeof turn.id === 'string' ? turn.id : null, working: true });
      return;
    }
    if (method === 'item/agentMessage/delta') {
      const itemId = String(params.itemId || `assistant-${Date.now()}`);
      const delta = typeof params.delta === 'string' ? params.delta : '';
      const messages = [...snapshot.messages];
      const index = messages.findIndex((item) => item.id === itemId);
      if (index >= 0) messages[index] = { ...messages[index], text: messages[index].text + delta };
      else messages.push({ id: itemId, role: 'assistant', text: delta });
      patch({ messages });
      return;
    }
    if (method === 'item/started') {
      const item = asRecord(params.item);
      if (item.type === 'commandExecution') {
        const command = Array.isArray(item.command) ? item.command.join(' ') : '';
        patch({ messages: [...snapshot.messages, { id: String(item.id || `tool-${Date.now()}`), role: 'tool', text: command || 'Codex is running a tool.', status: 'inProgress' }] });
      }
      return;
    }
    if (method === 'item/completed') {
      const item = asRecord(params.item);
      if(item.type==='agentMessage'&&typeof item.text==='string'){
        const message={id:String(item.id),role:'assistant' as const,text:item.text,status:'completed'};
        patch({messages:snapshot.messages.some(m=>m.id===message.id)?snapshot.messages.map(m=>m.id===message.id?message:m):[...snapshot.messages,message]});return;
      }
      const messages = snapshot.messages.map((entry) => entry.id === item.id
        ? { ...entry, status: String(item.status || 'completed') }
        : entry);
      patch({ messages });
      return;
    }
    if (method === 'turn/completed') {
      const turn = asRecord(params.turn);
      const error = asRecord(turn.error);
      if(turn.status==='completed'&&!error.message)reportAgentCompletion('codex',snapshot.activeThreadId!,[...snapshot.messages].reverse().find(m=>m.role==='assistant'));
      patch({
        activeTurnId: null,
        working: false,
        error: typeof error.message === 'string' ? error.message : null,
      });
      return;
    }
    if (method === 'serverRequest/resolved') {
      const requestId = String(params.requestId ?? '');
      requestMethods.delete(requestId); requestRpcIds.delete(requestId); submittedRequests.delete(requestId);
      patch({ pendingRequests: snapshot.pendingRequests.filter((item) => item.requestId !== requestId) });
      return;
    }
    if (method === 'error') {
      const error = asRecord(params.error);
      patch({ error: typeof error.message === 'string' ? error.message : 'Codex reported an error.' });
    }
  };

  const ensureStarted = async (): Promise<void> => {
    if (initialized && processHandle) return;
    if (startPromise) return startPromise;
    startPromise = (async () => {
    patch({ state: 'starting', error: null });
    const executable = resolveAgentExecutable('codex', process.env.FUSION_CODEX_EXECUTABLE);
    const child = spawnAgent(executable, ['app-server', '--listen', 'stdio://']);
    processHandle = child;
    loadedThreads.clear();
    let startupStderr = '';
    reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
    reader.on('line', receive);
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      startupStderr = (startupStderr + '\n' + text).slice(-2000);
      if (text) console.info('[FusionIsland:Codex]', text.slice(0, 500));
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
      loadedThreads.clear();
      processHandle = null;
      reader?.close();
      reader = null;
      const error = code === 0 ? null : `Codex App Server stopped (${signal || code || 'unknown'}).${startupStderr ? '\n' + startupStderr.trim() : ''}`;
      for (const state of threadStates.values()) { state.working = false; state.activeTurnId = null; }
      requestMethods.clear(); requestRpcIds.clear(); submittedRequests.clear();
      patch({ state: error ? 'error' : 'stopped', working: false, activeTurnId: null, pendingRequests: [], error });
      rejectWaiters(new Error(error || 'Codex App Server stopped.'));
    });

    await new Promise<void>((resolve, reject) => {
      const failTimer = setTimeout(() => reject(new Error('Codex App Server did not respond to initialize.')), 30000);
      const onStartError = (error: Error): void => {
        clearTimeout(failTimer);
        reject(error);
      };
      child.once('error', onStartError);
      request('initialize', {
        clientInfo: { name: 'fusionisland', title: 'FusionIsland', version: '1.1.0' },
        capabilities: { experimentalApi: true },
      }, 30000).then(() => {
        if (processHandle !== child) throw new Error('Codex connection was closed during startup.');
        write({ method: 'initialized' });
        initialized = true;
        void request('account/rateLimits/read',{}).then(value=>recordCodexLimits(asRecord(value))).catch(()=>{});
        clearTimeout(failTimer);
        child.removeListener('error', onStartError);
        patch({ state: 'ready', error: null });
        resolve();
      }).catch((error: unknown) => {
        clearTimeout(failTimer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
    })().catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const child = processHandle;
      processHandle = null;
      reader?.close(); reader = null;
      initialized = false; loadedThreads.clear();
      await stopAgent(child);
      rejectWaiters(new Error(message));
      patch({ state: 'error', error: message });
      throw error;
    }).finally(() => { startPromise = null; });
    return startPromise;
  };

  const loadThreads = async (): Promise<FusionCodexThread[]> => {
    await ensureStarted();
    const result = asRecord(await request('thread/list', { limit: 50, sortKey: 'updated_at', sortDirection: 'desc', sourceKinds: ['appServer'] }));
    const threads = Array.isArray(result.data)
      ? result.data.map(parseThread).filter((item): item is FusionCodexThread => item !== null)
      : [];
    patch({ threads });
    return threads;
  };

  const loadMessages = async (threadId: string): Promise<FusionCodexMessage[]> => {
    let turns: unknown[];
    try {
      const result = asRecord(await request('thread/turns/list', { threadId, limit: 30, sortDirection: 'desc', itemsView: 'full' }));
      turns = Array.isArray(result.data) ? [...result.data].reverse() : [];
    } catch (error) {
      if (!/unknown (?:method|variant)|method not found|unsupported.method/i.test(String(error))) throw error;
      const result = asRecord(await request('thread/read', { threadId, includeTurns: true }));
      const thread = asRecord(result.thread);
      turns = Array.isArray(thread.turns) ? thread.turns : [];
    }
    const messages: FusionCodexMessage[] = [];
    {
      for (const turnValue of turns) {
        const turn = asRecord(turnValue);
        if (!Array.isArray(turn.items)) continue;
        for (const itemValue of turn.items) {
          const item = asRecord(itemValue);
          if (item.type === 'userMessage' && Array.isArray(item.content)) {
            const text = item.content.map((content) => asRecord(content)).filter((content) => content.type === 'text').map((content) => String(content.text || '')).join('\n');
            if (text) messages.push({ id: String(item.id), role: 'user', text });
          } else if (item.type === 'agentMessage' && typeof item.text === 'string') {
            messages.push({ id: String(item.id), role: 'assistant', text: item.text });
          }
        }
      }
    }
    return messages;
  };

  return {
    getSnapshot: (): FusionCodexSnapshot => structuredClone({ ...snapshot, sessionStates: Object.fromEntries(threadStates) }),
    ensureStarted,
    loadModels: async () => {
      await ensureStarted();
      const models: Array<{ id: string; name: string }> = [];
      let cursor: string | undefined;
      do {
        const result = asRecord(await request('model/list', { limit: 100, ...(cursor ? { cursor } : {}) }));
        for (const item of Array.isArray(result.data) ? result.data : []) {
          const model = asRecord(item);
          if (typeof model.id === 'string') models.push({ id: model.id, name: String(model.displayName || model.id) });
        }
        const next = typeof result.nextCursor === 'string' ? result.nextCursor : undefined;
        if (next === cursor) break;
        cursor = next;
      } while (cursor);
      return models;
    },
    loadThreads,
    createThread: async (cwd: string): Promise<FusionCodexThread> => {
      await ensureStarted();
      const result = asRecord(await request('thread/start', { cwd, approvalPolicy: 'on-request', sandbox: 'workspace-write' }));
      const thread = parseThread(asRecord(result.thread));
      if (!thread) throw new Error('Codex did not return a session identifier.');
      loadedThreads.add(thread.id);
      selectThread(thread.id);
      patch({ activeThreadId: thread.id, activeTurnId: null, working: false, messages: [], error: null, threads: [thread, ...snapshot.threads.filter((item) => item.id !== thread.id)] });
      return thread;
    },
    resumeThread: (threadId: string): Promise<FusionCodexThread> => {
      const pending = resumes.get(threadId); if (pending) return pending;
      const task = (async () => {
      await ensureStarted();
      const known = snapshot.threads.find((thread) => thread.id === threadId);
      if (known && loadedThreads.has(threadId)) { selectThread(threadId); publish(); return known; }
      const result = asRecord(await request('thread/resume', { threadId }));
      const thread = parseThread(asRecord(result.thread));
      if (!thread) throw new Error('Codex could not restore this session.');
      const messages = await loadMessages(threadId);
      loadedThreads.add(threadId);
      selectThread(thread.id);
      if (!snapshot.working) patch({ messages, error: null, threads: [thread, ...snapshot.threads.filter(item => item.id !== thread.id)] });
      else publish();
      return thread;
      })().finally(() => { resumes.delete(threadId); });
      resumes.set(threadId, task); return task;
    },
    sendMessage: async (threadId: string, text: string, model?: import('../../preload/types/fusionWorkspace').FusionModel): Promise<void> => {
      await ensureStarted();
      const clean = text.trim();
      if (!clean) return;
      selectThread(threadId);
      if (snapshot.working) throw new Error('session-already-running');
      const id = `user-${Date.now()}`;
      patch({ activeThreadId: threadId, messages: [...snapshot.messages, { id, role: 'user', text: clean }], working: true, error: null });
      try {
        const result = asRecord(await request('turn/start', { threadId, input: [{ type: 'text', text: clean }], ...(model ? { model: model.id } : {}) }));
        const turn = asRecord(result.turn);
        forThread(threadId, () => patch({ activeTurnId: typeof turn.id === 'string' ? turn.id : null }));
      } catch (error) {
        forThread(threadId, () => patch({ working: false, activeTurnId: null, error: String(error) }));
        throw error;
      }
    },
    interrupt: async (threadId = snapshot.activeThreadId): Promise<void> => {
      saveThread();
      const turnId = threadId ? threadStates.get(threadId)?.activeTurnId : null;
      if (!threadId || !turnId) return;
      await request('turn/interrupt', { threadId, turnId });
    },
    answerRequest: (requestId: string, decision: FusionCodexDecision, answers?: Record<string, string[]>): void => {
      if (snapshot.pendingRequests.every((item) => item.requestId !== requestId)) throw new Error('request-expired');
      if (submittedRequests.has(requestId)) throw new Error('request-already-submitted');
      const method = requestMethods.get(requestId);
      if (!method) return;
      const id = requestRpcIds.get(requestId);
      if (id === undefined) throw new Error('request-expired');
      if (method === 'item/tool/requestUserInput') {
        write({ id, result: { answers: Object.fromEntries(Object.entries(answers || {}).map(([key, value]) => [key, { answers: value }])) } });
      } else {
        write({ id, result: { decision } });
      }
      submittedRequests.add(requestId);
      patch({ pendingRequests: snapshot.pendingRequests.map((item) => item.requestId === requestId ? { ...item, submitted: true } : item) });
    },
    stop: async (): Promise<void> => {
      initialized = false;
      reader?.close();
      reader = null;
      const child = processHandle;
      processHandle = null;
      await stopAgent(child);
      rejectWaiters(new Error('Codex App Server stopped.'));
      loadedThreads.clear(); threadStates.clear();
      requestMethods.clear(); requestRpcIds.clear(); submittedRequests.clear();
      patch({ ...EMPTY_SNAPSHOT });
    },
  };
}
