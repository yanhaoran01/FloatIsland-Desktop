/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file index.mjs @description Native dsh Cordis bridge; original Remote clients arbitrate interactions. @author 鸡哥 */
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** Starts the loopback carrier without creating or resuming any Agent. */
export async function startBridge(ctx, config = {}) {
  const connectionFile = config.connectionFile || process.env.FUSION_DSH_CONNECTION ||
    join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'FusionIsland', 'dsh-bridge.json');
  const token = randomBytes(32).toString('hex');
  const lifetime = new AbortController();
  const calls = new Map();
  const clients = new Map();
  const pending = new Map();
  const gateway = () => ctx.get('typertGateway');
  const controller = () => ctx.get('sessionController');
  const speech = () => ctx.get('speechController');
  const rpc = async (method, args, signal) => {
    switch (method) {
      case 'list': return controller().list({}, signal);
      case 'create': return controller().create({ cwd: args.cwd }, signal);
      case 'resume': return controller().create({ sessionId: args.sessionId }, signal);
      case 'models': return controller().modelCatalog();
      case 'prompt': {
        if (args.model) {
          if (typeof args.model.id !== 'string' || typeof args.model.provider !== 'string') throw new Error('invalid-model-selection');
          await controller().selectModel({ sessionId: args.sessionId, provider: args.model.provider, model: args.model.id });
          signal.throwIfAborted();
        }
        return controller().prompt({ sessionId: args.sessionId, requestId: args.requestId, content: [{ type: 'text', text: args.text }] }, signal);
      }
      case 'cancel': return controller().cancel({ sessionId: args.sessionId }, signal);
      case 'speech/catalog': {
        const service = speech();
        if (!service) return null;
        return service.catalog();
      }
      case 'speech/transcribe': {
        const service = speech();
        if (!service) throw new Error('dsh-voice-not-enabled');
        return service.transcribe({ audioBase64: args.audioBase64, providerId: args.providerId, language: args.language }, signal);
      }
      case 'questions/continued': {
        const result = await gateway().dispatchRpc('userQuestions/answer', { args: {
          agentId: args.sessionId, callId: args.callId, answer: { answers: args.answers },
        } }, signal, gateway().operatorPeer());
        if (!result.ok) throw new Error(result.error?.message || 'question-no-longer-open');
        return result.value;
      }
      case 'interaction/answer': {
        const owned = pending.get(args.eventId);
        if (!owned || owned.clientId !== args.clientId || !clients.has(args.clientId)) throw new Error('request-expired');
        if (owned.submitted) throw new Error('request-already-submitted');
        const request = owned.event;
        let value;
        if (request.event === 'approval/request') {
          if (!['allowed-once', 'rejected'].includes(args.value)) throw new Error('invalid-approval');
          value = args.value;
        } else if (request.event === 'user-questions/request') {
          const questions = request.request.questions || [];
          const answers = args.value?.answers;
          if (!Array.isArray(answers) || answers.length !== questions.length ||
            questions.some(q => answers.filter(a => a.id === q.id).length !== 1)) throw new Error('invalid-question-answer');
          value = { answers };
        } else throw new Error('unsupported-interaction');
        owned.submitted = true;
        const result = await gateway().dispatchRpc('$events/result', {
          args: { clientId: args.clientId, eventId: args.eventId, outcome: { kind: 'result', value } },
        }, signal, gateway().operatorPeer());
        if (!result.ok) { owned.submitted = false; throw new Error(result.error?.message || 'interaction-rejected'); }
        return { submitted: true };
      }
      default: throw new Error('unsupported-method');
    }
  };
  const server = createServer(async (req, res) => {
    const supplied = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from('Bearer ' + token);
    if (req.headers.origin || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.writeHead(401).end(); return;
    }
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    lifetime.signal.addEventListener('abort', onAbort, { once: true });
    res.once('close', onAbort);
    const signal = abort.signal;
    let callId, streamClient;
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && ['/events', '/control', '/follow', '/speech/follow'].includes(url.pathname)) {
        let source;
        if (url.pathname === '/events') source = gateway().openRemoteEvents({ args: {} }, signal);
        else if (url.pathname === '/control') source = controller().control(signal);
        else if (url.pathname === '/speech/follow') {
          if (!speech()) throw new Error('dsh-voice-not-enabled');
          source = speech().follow(signal);
        } else source = controller().follow({ address: { kind: 'session', sessionId: url.searchParams.get('sessionId') }, assistantStream: true, maxMessages: 100 }, signal);
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
        const heartbeat = setInterval(() => { if (!res.destroyed) res.write('{"type":"heartbeat"}\n'); }, 10_000);
        try {
          for await (const frame of source) {
            if (signal.aborted) break;
            if (url.pathname === '/events') {
              if (frame.type === 'ready') { streamClient = frame.clientId; clients.set(streamClient, abort); }
              if (frame.type === 'waterfall') pending.set(frame.eventId, { clientId: streamClient, event: frame, submitted: false });
              if (frame.type === 'cancel') pending.delete(frame.eventId);
            }
            if (!res.write(JSON.stringify(frame) + '\n')) await new Promise(resolve => {
              res.once('drain', resolve); res.once('close', resolve);
            });
          }
        } finally { clearInterval(heartbeat); }
        res.end(); return;
      }
      if (req.method !== 'POST' || url.pathname !== '/rpc') { res.writeHead(404).end(); return; }
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length; if (size > 6 * 1024 * 1024) throw new Error('request-too-large');
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (body.method === 'cancel-call') { calls.get(body.args?.requestId)?.abort(); res.end('{}'); return; }
      callId = body.requestId;
      if (typeof callId !== 'string' || calls.has(callId)) throw new Error('invalid-call-id');
      calls.set(callId, abort);
      const value = await rpc(body.method, body.args || {}, signal);
      if (!res.destroyed) res.end(JSON.stringify({ value: value ?? null }));
    } catch (error) {
      if (!res.destroyed) {
        if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message || String(error) }) + '\n');
      }
    } finally {
      if (callId) calls.delete(callId);
      if (streamClient) {
        clients.delete(streamClient);
        for (const [id, item] of pending) if (item.clientId === streamClient) pending.delete(id);
      }
      lifetime.signal.removeEventListener('abort', onAbort);
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const endpoint = 'http://127.0.0.1:' + server.address().port;
  mkdirSync(dirname(connectionFile), { recursive: true });
  writeFileSync(connectionFile, JSON.stringify({ endpoint, token, version: '1.1.1', dshVersion: '0.2.0-rc.2', pid: process.pid }), { mode: 0o600 });
  return {
    endpoint, token,
    async close() {
      lifetime.abort();
      for (const call of calls.values()) call.abort();
      for (const client of clients.values()) client.abort();
      try { if (JSON.parse(readFileSync(connectionFile, 'utf8')).token === token) unlinkSync(connectionFile); } catch {}
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

/** Cordis entry point: injection waits for the host's existing native services. */
function FusionIslandBridge(ctx, config) {
  ctx.effect(async function* () {
    const bridge = await startBridge(ctx, config);
    yield () => bridge.close();
  });
}
FusionIslandBridge.inject = ['sessionController', 'typertGateway'];
export const inject = FusionIslandBridge.inject;
export default FusionIslandBridge;

