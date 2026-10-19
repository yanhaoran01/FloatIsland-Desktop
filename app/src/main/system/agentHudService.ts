/* FloatIsland contributors. GPL-3.0. */
/** @file agentHudService.ts @description Capability-aware snapshots from existing Agent services. @author 鸡哥 */
import { app, ipcMain } from 'electron';
import { join } from 'path';
import { broadcastFusion, fusionEvents, isFusionView } from './fusionWindows';
import { initHudUsage } from './agentHudUsage';
import type {
  FusionCodexSnapshot,
  FusionDshSnapshot,
  FusionEchoCodexSessionsSnapshot
} from '../../preload/types/fusion';
import type { AssistantConversation } from '../../preload/types/fusionWorkspace';
import type {
  AgentHudSnapshot,
  HudAgent,
  HudAgentId,
  HudCompletion
} from '../../preload/types/agentHud';

/** Publishes statistics and live completion cards without starting agents. */
export function registerAgentHud(options: {
  codex: () => FusionCodexSnapshot;
  dsh: () => FusionDshSnapshot;
  echo: () => FusionEchoCodexSessionsSnapshot;
  configured: () => Promise<string[]>;
}): void {
  const ledger = initHudUsage(
    join(app.getPath('userData'), 'fusion-hud-statistics.json')
  );
  const conversations = new Map<string, AssistantConversation>(),
    working = new Map<string, { running: boolean; baseline: string }>();
  const completed = new Set<string>(),
    queue: HudCompletion[] = [];
  let configured: string[] = [],
    refreshing = false;
  const refresh = () => {
    if (refreshing) return;
    refreshing = true;
    void options
      .configured()
      .then((v) => {
        configured = v;
      })
      .catch(() => {})
      .finally(() => {
        refreshing = false;
      });
  };
  refresh();
  function observe(
    agent: HudAgentId,
    key: string,
    running: boolean,
    error: unknown,
    messages: { id: string; role: string; text: string }[],
    notify = true
  ): void {
    if (!notify) {
      working.delete(key);
      return;
    }
    const was = working.get(key);
    const reply = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && m.text.trim());
    const baseline =
      running && was?.running ? was.baseline : (reply?.text ?? '');
    working.set(key, { running, baseline });
    if (
      !was?.running ||
      running ||
      error ||
      !reply ||
      reply.text === was.baseline
    )
      return;
    enqueue({
      id: key + ':' + reply.id,
      agent,
      sessionKey: key,
      text: reply.text,
      at: Date.now()
    });
  }
  function enqueue(value: HudCompletion): void {
    if (completed.has(value.id)) return;
    completed.add(value.id);
    queue.push(value);
    if (completed.size > 2048)
      completed.delete(completed.values().next().value!);
    if (queue.length > 50) queue.shift();
  }
  const snapshot = (): AgentHudSnapshot => {
    const c = options.codex(),
      d = options.dsh(),
      e = options.echo(),
      now = Date.now();
    const external = e.sessions;
    const ids = new Set<HudAgentId>();
    for (const agent of e.agents ?? [])
      if (agent.configured || agent.installed)
        if (['codex', 'dsh', 'claude', 'workbuddy'].includes(agent.source))
          ids.add(agent.source as HudAgentId);
    if (c.state !== 'stopped' || c.threads.length) ids.add('codex');
    if (d.state !== 'stopped' || d.sessions.length) ids.add('dsh');
    for (const s of external)
      if (['codex', 'dsh', 'claude', 'workbuddy'].includes(s.source))
        ids.add(s.source as HudAgentId);
    for (const p of configured)
      if (['openai', 'anthropic', 'ollama'].includes(p))
        ids.add(p as HudAgentId);
    for (const v of conversations.values())
      ids.add(v.key.split(':')[0] as HudAgentId);
    const names: Record<HudAgentId, string> = {
      codex: 'Codex',
      dsh: 'DeepSeek',
      claude: 'Claude',
      workbuddy: 'WorkBuddy',
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      ollama: 'Ollama'
    };
    const agents = [...ids]
      .sort(
        (a, b) => Object.keys(names).indexOf(a) - Object.keys(names).indexOf(b)
      )
      .map((id): HudAgent => {
        const sessions = external.filter((s) => s.source === id),
          stats = ledger.stats(id, now);
        const local = id === 'codex' ? c : id === 'dsh' ? d : null;
        const states = local?.sessionStates ?? {};
        const pending = Boolean(
          id === 'codex'
            ? c.pendingRequests.length
            : id === 'dsh'
              ? d.pendingRequests.length
              : (e.pendingRequests ?? []).some((r) => r.source === id)
        );
        const running = Boolean(
          local?.working ||
            Object.values(states).some((s) => s.working) ||
            sessions.some((s) =>
              /working|running|processing|tool|thinking/i.test(s.status)
            ) ||
            [...conversations.values()].some(
              (s) => s.key.startsWith(id + ':') && s.working
            )
        );
        const stale =
          id === 'codex'
            ? (c.state !== 'ready' && e.state !== 'ready') ||
              stats.quotas.some((q) => now - q.updatedAt > 600_000)
            : local
              ? local.state !== 'ready'
              : sessions.length > 0
                ? e.state !== 'ready'
                : false;
        return {
          id,
          name: names[id],
          status:
            pending || sessions.some((s) => /waiting|approval/i.test(s.status))
              ? 'waiting'
              : running
                ? 'working'
                : local?.state === 'error' ||
                    [...conversations.values()].some(
                      (s) => s.key.startsWith(id + ':') && s.error
                    )
                  ? 'error'
                  : stale
                    ? 'offline'
                    : 'idle',
          sessions: new Set([
            ...sessions.map((s) => s.sessionId),
            ...(id === 'codex'
              ? c.threads.map((t) => t.id)
              : id === 'dsh'
                ? d.sessions.map((s) => s.id)
                : [...conversations.keys()].filter((k) =>
                    k.startsWith(id + ':')
                  ))
          ]).size,
          stale,
          ...stats,
          capabilities: {
            quota: id === 'codex' && stats.quotas.length > 0,
            usage: stats.usageAvailable,
            approve:
              id === 'codex' ||
              id === 'dsh' ||
              sessions.some((s) => s.capabilities?.approve),
            chat: id !== 'claude' && id !== 'workbuddy'
          }
        };
      });
    return { agents, completion: queue[0] ?? null, updatedAt: now };
  };
  const onEcho = (s: FusionEchoCodexSessionsSnapshot) => {
    for (const session of s.sessions) {
      if (!['codex', 'dsh', 'claude', 'workbuddy'].includes(session.source))
        continue;
      const owned =
        session.source === 'codex'
          ? options.codex().sessionStates?.[session.sessionId]
          : session.source === 'dsh'
            ? options.dsh().sessionStates?.[session.sessionId]
            : null;
      if (owned) continue;
      observe(
        session.source as HudAgentId,
        session.source + ':' + session.sessionId,
        /working|running|processing|tool|thinking/i.test(session.status),
        /error|failed|cancel|interrupt|disconnected|restored/i.test(
          session.status
        ),
        session.lastAssistantMessage
          ? [
              {
                id: session.lastAssistantMessage,
                role: 'assistant',
                text: session.lastAssistantMessage
              }
            ]
          : [],
        s.state === 'ready'
      );
    }
  };
  const onConversation = (s: AssistantConversation) => {
    conversations.set(s.key, { ...s });
  };
  fusionEvents.on('fusion:agent:completed', enqueue);
  fusionEvents.on('fusion:echo:codex-sessions:updated', onEcho);
  fusionEvents.on('fusion:conversation:updated', onConversation);
  onEcho(options.echo());
  const trusted = (event: Electron.IpcMainInvokeEvent) => {
    if (!isFusionView(event.sender)) throw Error('untrusted-view');
  };
  ipcMain.handle('fusion:hud:snapshot', (e) => {
    trusted(e);
    return snapshot();
  });
  ipcMain.handle('fusion:hud:dismiss', (e, id: string) => {
    trusted(e);
    const index = queue.findIndex((c) => c.id === id);
    if (index >= 0) queue.splice(index, 1);
  });
  let ticks = 0,
    last = '';
  const timer = setInterval(() => {
    if (++ticks % 10 === 0) refresh();
    const value = snapshot();
    const fingerprint = JSON.stringify({ ...value, updatedAt: 0 });
    if (fingerprint !== last) {
      last = fingerprint;
      broadcastFusion('fusion:hud:updated', value);
    }
  }, 1000);
  app.once('will-quit', () => {
    clearInterval(timer);
    ledger.flush();
    fusionEvents.removeListener('fusion:agent:completed', enqueue);
    fusionEvents.removeListener('fusion:echo:codex-sessions:updated', onEcho);
    fusionEvents.removeListener('fusion:conversation:updated', onConversation);
  });
}
