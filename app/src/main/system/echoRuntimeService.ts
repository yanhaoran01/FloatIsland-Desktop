/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/**
 * @file echoRuntimeService.ts
 * @description Persistent EchoIsland host with authenticated loopback event ingress.
 * @author 鸡哥
 */
import { broadcastFusion } from './fusionWindows';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface } from 'readline';
import { createServer, type Server } from 'http';
import { randomBytes, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { BrowserWindow } from 'electron';
import type { FusionEchoCodexSessionsSnapshot, FusionEchoCodexSession } from '../../preload/types/fusion';
import type { EchoCodexSessionCache } from '../types/system/EchoExternalCodexService';
import { createLocalAgentDiscovery } from './localAgentDiscovery';
import {WorkBuddyObserver} from './workBuddyObserver';
import {discoverWorkBuddy,workBuddyHistory,workBuddyAlive,openWorkBuddy} from './workBuddyConfig';

interface Options {
  binaryPath: string;
  dataDir: string;
  preferencesPath: string;
  getMainWindow: () => BrowserWindow | null;
  cache?: EchoCodexSessionCache;
}
type Raw = Record<string, any>;
interface Waiter { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
const raw = (value: unknown): Raw => value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {};
const nullable = (value: unknown): string | null => typeof value === 'string' ? value : null;

/** Converts upstream snapshot fields while retaining session identity, operation details and tool history. */
export function decodeEchoSnapshot(value: unknown): FusionEchoCodexSessionsSnapshot {
  const data = raw(value);
  const sessions: FusionEchoCodexSession[] = (Array.isArray(data.sessions) ? data.sessions : []).map((item: Raw) => ({
    sessionId: String(item.session_id), source: String(item.source), key: String(item.key),
    cwd: nullable(item.cwd), projectName: nullable(item.project_name), model: nullable(item.model),
    status: item.restored ? 'Restored' : ['gemini', 'glm', 'vscode', 'cursor', 'trae'].includes(String(item.source)) ? 'ApplicationOpen' : String(item.status), currentTool: nullable(item.current_tool),
    lastUserPrompt: nullable(item.last_user_prompt), lastAssistantMessage: nullable(item.last_assistant_message),
    lastActivity: nullable(item.last_activity), windowTitle: nullable(item.window_title),
    toolHistory: Array.isArray(item.tool_history) ? item.tool_history : [],
    capabilities: { focus: true, chat: false, approve: false },
  }));
  const pendingRequests = [
    ...(Array.isArray(data.pending_permissions) ? data.pending_permissions : []).map((request: Raw) => ({
      requestId: String(request.request_id), sessionId: String(request.session_id), source: String(request.source),
      kind: 'approval' as const, text: String(request.tool_description || request.tool_name || ''),
      operation: request.operation?.event?.tool_input, originalRequestId: request.operation?.requestId,
    })),
    ...(Array.isArray(data.pending_questions) ? data.pending_questions : []).map((request: Raw) => ({
      requestId: String(request.request_id), sessionId: String(request.session_id), source: String(request.source),
      kind: 'question' as const, text: String(request.payload?.text || ''), options: request.payload?.options?.map((option: Raw) => String(option.label)),
      originalRequestId: request.operation?.requestId,
    })),
  ];
  return { state: 'ready', updatedAt: new Date().toISOString(), sessions, pendingRequests };
}

/** Owns the background process and only exposes validated operations to the renderer. */
export function createEchoRuntimeService(options: Options) {
  let child: ChildProcessWithoutNullStreams | null = null;
  let timer: NodeJS.Timeout | null = null;
  let restartTimer: NodeJS.Timeout | null = null;
  let server: Server | null = null;
  let stopping = true;
  let sequence = 0;
  let enabled: boolean | null = null;
  let snapshot: FusionEchoCodexSessionsSnapshot = { state: 'unavailable', updatedAt: null, sessions: [], pendingRequests: [] };
  const waiters = new Map<number, Waiter>();
  const owners = new Map<string, symbol>();
  const answering = new Set<string>();
  const sourceSequences = new Map<string, number>();
  const workbuddy=new WorkBuddyObserver();
  let workbuddySeenAt=0;
  const localAgents = createLocalAgentDiscovery();
  let localScanAt = 0;
  const combined=():FusionEchoCodexSessionsSnapshot=>({...snapshot,agents:localAgents.snapshot().agents,sessions:[...snapshot.sessions.filter(item=>item.source!=='workbuddy'&&item.source!=='kimi').map(item=>({...item,capabilities:{...item.capabilities,focus:true,chat:false,approve:snapshot.state==='ready'&&owners.has(item.source+':'+item.sessionId)}})),...workbuddy.snapshot(),...localAgents.snapshot().sessions].sort((a,b)=>(b.lastActivity??'').localeCompare(a.lastActivity??''))});
  const publish = (): void => {
    broadcastFusion('fusion:echo:codex-sessions:updated', combined());
  };
  const request = (method: string, params: Raw = {}, timeout = 30_000): Promise<any> => new Promise((resolve, reject) => {
    if (!child || child.stdin.destroyed) { reject(new Error('echo-host-disconnected')); return; }
    const id = ++sequence;
    const timer = setTimeout(() => { waiters.delete(id); reject(new Error('echo-host-timeout')); }, timeout);
    waiters.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n', (error) => {
      if (!error) return;
      clearTimeout(timer); waiters.delete(id); reject(error);
    });
  });
  const refreshPreferences = (): void => {
    let discover = true;
    try { discover = JSON.parse(readFileSync(options.preferencesPath, 'utf8')).autoDiscover !== false; } catch { /* Default to local status discovery. */ }
    if (!discover) localAgents.clear();
    if (Date.now() - localScanAt > 15000) { localScanAt = Date.now(); void localAgents.scan().then(() => { if (enabled === false) localAgents.clear(); publish(); }).catch(() => {}); }
    if (enabled !== discover) {
      enabled = discover;
      void request('discover', { enabled: discover }).catch(() => { enabled = null; });
    }
  };
  const boot = (): void => {
    if (stopping || child) return;
    if (!existsSync(options.binaryPath)) { snapshot.state = 'unavailable'; publish(); return; }
    const process = spawn(options.binaryPath, [options.dataDir], { windowsHide: true, stdio: 'pipe' });
    child = process; enabled = null;
    const reader = createInterface({ input: process.stdout, crlfDelay: Infinity });
    reader.on('line', (line) => {
      try {
        const message = JSON.parse(line);
        if (message.event === 'snapshot') {
          snapshot = decodeEchoSnapshot(message.value); options.cache?.save(snapshot); publish(); return;
        }
        const waiter = waiters.get(message.id);
        if (!waiter) return;
        clearTimeout(waiter.timer); waiters.delete(message.id);
        if (message.error) waiter.reject(new Error(String(message.error)));
        else waiter.resolve(message.result);
      } catch { /* non-protocol stdout is ignored; diagnostics use stderr */ }
    });
    process.stderr.on('data', (data) => console.info('[FusionIsland:Echo]', String(data).slice(0, 500)));
    const disconnected = (): void => {
      if (child !== process) return;
      child = null; reader.close();
      for (const waiter of waiters.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('echo-host-disconnected')); }
      waiters.clear();
      snapshot = { ...snapshot, state: snapshot.sessions.length ? 'restored' : 'error', pendingRequests: [] };
      publish();
      if (!stopping) restartTimer = setTimeout(boot, 3000);
    };
    process.once('error', disconnected); process.once('exit', disconnected);
    refreshPreferences();
  };
  const startIngress = (): void => {
    const token = randomBytes(32).toString('hex');
    const expected = Buffer.from('Bearer ' + token);
    server = createServer(async (req, res) => {
      const supplied = Buffer.from(req.headers.authorization || '');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { res.writeHead(401).end(); return; }
      if (req.method !== 'POST' || !['/event', '/agent/events'].includes(req.url || '')) { res.writeHead(404).end(); return; }
      let length = 0; const chunks: Buffer[] = [];
      try {
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 1024 * 1024) { res.writeHead(413).end(); return; }
          chunks.push(chunk);
        }
        const payload = raw(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        const event = raw(payload.event || payload);
        if (typeof event.source !== 'string' || typeof event.session_id !== 'string' || typeof event.hook_event_name !== 'string') {
          res.writeHead(400).end(); return;
        }
        if(event.source==='workbuddy') {
          workbuddySeenAt=Date.now();
          if(workbuddy.accept(event))publish();
          const body=JSON.stringify({ok:true,error:null,decision:null,answer:null});
          res.writeHead(200,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),Connection:'close'}).end(body);
          return;
        }
        // One live channel owns this request. A dropped caller withdraws only its source/session.
        const key = event.source + ':' + event.session_id;
        if (typeof payload.sourceSeq === 'number') {
          if (payload.sourceSeq <= (sourceSequences.get(key) ?? -1)) { res.writeHead(409).end(JSON.stringify({ error: 'stale-event' })); return; }
          sourceSequences.set(key, payload.sourceSeq);
        }
        const owner = Symbol();
        const interactive = ['PermissionRequest', 'AskUserQuestion'].includes(event.hook_event_name);
        if (interactive) owners.set(key, owner);
        let settled = false;
        res.once('close', () => {
          if (!settled && owners.get(key) === owner) { owners.delete(key); void request('disconnect', { source: event.source, sessionId: event.session_id }).catch(() => {}); }
        });
        let result: unknown;
        try { result = await request('event', { event: { protocol_version: '1', timestamp: new Date().toISOString(), ...event },
          requestId: payload.requestId, sourceSeq: payload.sourceSeq }, 31 * 60_000);
        settled = true;
        } finally { if (owners.get(key) === owner) owners.delete(key); }
        const body = JSON.stringify(result);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Connection: 'close' }).end(body);
      } catch {
        if (!res.writableEnded) res.writeHead(503).end(JSON.stringify({ error: 'event-unavailable' }));
      }
    });
    server.on('error', (error) => console.error('[FusionIsland:Echo] receiver:', error.message));
    server.listen(0, '127.0.0.1', () => {
      const address = server?.address();
      if (!address || typeof address === 'string') return;
      writeFileSync(join(options.dataDir, 'connection.json'), JSON.stringify({ version: 1, endpoint: 'http://127.0.0.1:' + address.port + '/event', token }), { mode: 0o600 });
    });
  };
  return {
    start: (): void => {
      if (!stopping) return;
      stopping = false; mkdirSync(options.dataDir, { recursive: true });
      snapshot = options.cache?.load() ?? snapshot; publish(); boot(); startIngress();
      void discoverWorkBuddy().then(()=>{workbuddy.restore(workBuddyHistory());publish();}).catch(()=>{});
      timer = setInterval(()=>{refreshPreferences();if(workbuddySeenAt&&Date.now()-workbuddySeenAt>15000&&!workBuddyAlive()){workbuddySeenAt=0;workbuddy.disconnect();publish();}}, 1000);
    },
    stop: (): void => {
      stopping = true; if (timer) clearInterval(timer); if (restartTimer) clearTimeout(restartTimer);
      server?.close(); server?.closeAllConnections();
      // EOF lets the host flush persistence before it exits.
      child?.stdin.end();
    },
    getSnapshot: (): FusionEchoCodexSessionsSnapshot => structuredClone(combined()),
    rescan: async (): Promise<void> => { await localAgents.scan(); workbuddy.restore(workBuddyHistory());publish();enabled=null;refreshPreferences(); },
    focusSession: async (source: string, sessionId: string): Promise<boolean> => source==='kimi' ? localAgents.focus(sessionId) : source==='workbuddy' ? openWorkBuddy() : Boolean((await request('focus', { source, sessionId })).focused),
    focusCodexApp: async (): Promise<boolean> => {
      const session = snapshot.sessions.find((item) => item.source === 'codex');
      return session ? Boolean((await request('focus', { source: session.source, sessionId: session.sessionId })).focused) : false;
    },
    answerRequest: async (requestId: string, action: string, answer?: string): Promise<boolean> => {
      const pending = snapshot.pendingRequests?.find((item) => item.requestId === requestId);
      if (!pending) throw new Error('request-expired');
      if (pending.kind === 'approval' ? !['approve', 'deny'].includes(action) : !['answer', 'skip'].includes(action)) throw new Error('invalid-action');
      if(answering.has(requestId))throw new Error('request-in-progress');
      answering.add(requestId);
      try { await request('answer', { requestId, action, answer }); return true; }
      finally { answering.delete(requestId); }
    },
  };
}

