/* FloatIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file LocalAgentCards.tsx @description 本机 Agent 可用状态与会话列表。 @author 鸡哥 */
import { useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { AppWindow, Bot, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { FusionEchoCodexSession, FusionEchoCodexSessionsSnapshot, FusionLocalAgent } from '../../../preload/types/fusion';
import { FusionProviderIcon } from './FusionResourceIcon';
import './localAgentCards.css';

const NAMES: Record<string, string> = { claude: 'Claude Code', 'claude-code': 'Claude Code', workbuddy: 'WorkBuddy', kimi: 'Kimi Code', gemini: 'Gemini CLI', glm: 'GLM CLI', openclaw: 'OpenClaw', cursor: 'Cursor', vscode: 'VS Code', trae: 'Trae' };
const canonical = (source: string): string => source === 'claude-code' ? 'claude' : source;

/** Program presence and restored history never imply a running Agent turn. */
export function LocalAgentCards({ snapshot, onError }: { snapshot: FusionEchoCodexSessionsSnapshot | null; onError: (error: string) => void }): JSX.Element {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [focusing, setFocusing] = useState('');
  const agents = new Map<string, FusionLocalAgent>((snapshot?.agents || []).map(agent => [canonical(agent.source), agent]));
  for (const source of ['claude', 'workbuddy', 'kimi']) if (!agents.has(source)) agents.set(source, { source, name: NAMES[source], installed: false, configured: false });
  const groups = new Map<string, FusionEchoCodexSession[]>();
  for (const session of snapshot?.sessions || []) {
    const source = canonical(session.source);
    if (['codex', 'codex-cli', 'dsh'].includes(source)) continue;
    if (!agents.has(source)) agents.set(source, { source, name: NAMES[source] || source, installed: false, configured: false });
    const values = groups.get(source) || [];
    if (!values.some(value => value.sessionId === session.sessionId)) values.push(session);
    groups.set(source, values);
  }
  const label = (status: string): string => t('fusion.localAgents.status.' + status, { defaultValue: status });
  const focus = async (session: FusionEchoCodexSession): Promise<void> => {
    const key = session.source + ':' + session.sessionId; setFocusing(key);
    try { if (!await window.api.fusionFocusSession(session.source, session.sessionId)) throw new Error(t('fusion.localAgents.focusFailed')); }
    catch (error) { onError(error instanceof Error ? error.message : String(error)); }
    finally { setFocusing(''); }
  };
  const visibleAgents = [...agents.values()].filter(agent => agent.installed || agent.configured || groups.has(canonical(agent.source)));
  return <>{visibleAgents.map(agent => {
    const sessions = [...(groups.get(canonical(agent.source)) || [])].sort((a, b) => Number(a.status === 'Restored') - Number(b.status === 'Restored') || (b.lastActivity || '').localeCompare(a.lastActivity || ''));
    const live = sessions.filter(session => snapshot?.state === 'ready' && !['Restored', 'Disconnected'].includes(session.status));
    const working = live.filter(session => ['Processing', 'Running'].includes(session.status)).length;
    const waiting = live.filter(session => /Waiting|Approval|Permission/.test(session.status)).length;
    const summary = waiting ? t('fusion.localAgents.waiting', { count: waiting }) : working ? t('fusion.localAgents.working', { count: working }) : live.length ? t('fusion.localAgents.running') : agent.installed ? t('fusion.localAgents.installed') : agent.configured ? t('fusion.localAgents.configured') : sessions.length ? t('fusion.localAgents.history') : t(snapshot?.agents ? 'fusion.localAgents.notFound' : 'fusion.localAgents.detecting');
    return <article className="fusion-agent-card fusion-local-agent-card" key={agent.source} data-agent={agent.source}>
      <div className="fusion-agent-card-heading">
        <div className="fusion-agent-name"><span className="fusion-agent-icon">{agent.source === 'claude' ? <FusionProviderIcon provider="anthropic" /> : <Bot size={20} />}</span><div><strong>{agent.name}</strong><small>{summary}</small></div></div>
        <span className="fusion-local-capability">{t('fusion.localAgents.observe')}</span>
      </div>
      {!sessions.length ? <p className="fusion-overview-empty">{t('fusion.localAgents.noSessions')}</p> : <div className="fusion-session-list">
        {(expanded[agent.source] ? sessions : sessions.slice(0, 4)).map(session => {
          const restored = snapshot?.state !== 'ready' || session.status === 'Restored';
          const status = restored ? 'Restored' : session.status;
          const key = session.source + ':' + session.sessionId;
          return <div className="fusion-session-card fusion-local-session" key={key}>
            <span className="fusion-session-card-copy"><strong title={session.projectName || session.windowTitle || agent.name}>{session.projectName || session.windowTitle || agent.name}</strong><small title={session.cwd || ''}>{session.currentTool || session.lastAssistantMessage || session.lastUserPrompt || session.cwd || (status === 'ApplicationOpen' ? t('fusion.localAgents.processOnly') : t('fusion.localAgents.external'))}</small><span className="fusion-local-status" data-status={status}>{status === 'ApplicationOpen' ? <AppWindow size={11} /> : null}{label(status)}</span></span>
            {session.capabilities?.focus && <button className="fusion-icon-button" type="button" title={t('fusion.localAgents.focus', { agent: agent.name })} aria-label={t('fusion.localAgents.focus', { agent: agent.name })} disabled={focusing === key} onClick={() => void focus(session)}><ExternalLink size={15} /></button>}
          </div>;
        })}
        {sessions.length > 4 && <button type="button" className="fusion-local-more" aria-expanded={Boolean(expanded[agent.source])} onClick={() => setExpanded(value => ({ ...value, [agent.source]: !value[agent.source] }))}>{expanded[agent.source] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{expanded[agent.source] ? t('fusion.localAgents.less') : t('fusion.localAgents.more', { count: sessions.length })}</button>}
      </div>}
    </article>;
  })}</>;
}
