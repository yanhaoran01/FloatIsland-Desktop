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
 * @file FusionSessionsTab.tsx
 * @description 应用内 Codex 与 dsh 会话和待处理请求概览。
 * @author 鸡哥
 */

import { useFusionPreferences } from './fusionPreferences';
import { useCallback, useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock3, Plus, RefreshCw, Volume2, VolumeX } from 'lucide-react';
import type { FusionCodexSnapshot, FusionCodexThread, FusionDshSession, FusionDshSnapshot } from '../../../preload/types/fusion';
import useIslandStore from '../../store/slices';
import { FusionPet, type FusionPetMood } from './FusionPet';

import { useFusionActivity } from './fusionActivity';
import { LocalAgentCards } from './LocalAgentCards';
import { FusionProviderIcon } from './FusionResourceIcon';

const EMPTY_CODEX: FusionCodexSnapshot = {
  state: 'stopped', error: null, activeThreadId: null, activeTurnId: null,
  working: false, threads: [], messages: [], pendingRequests: [],
};

const EMPTY_DSH: FusionDshSnapshot = {
  state: 'stopped', error: null, activeSessionId: null, activeCwd: null,
  working: false, sessions: [], messages: [], pendingRequests: [],
};


/**
 * Summarizes current local agent sessions and routes the user to the matching chat when they need to act.
 * @returns The unified FusionIsland session overview.
 */
export function FusionSessionsTab(): JSX.Element {
  const { t } = useTranslation();
  const setMaxExpandTab = useIslandStore((state) => state.setMaxExpandTab);
  const [codex, setCodex] = useState<FusionCodexSnapshot>(EMPTY_CODEX);
  const [dsh, setDsh] = useState<FusionDshSnapshot>(EMPTY_DSH);
  const echo = useFusionActivity(state => state.echo);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const muted = useFusionPreferences((state) => state.value.muted);
  const setMuted = (update: (value: boolean) => boolean): void => { void useFusionPreferences.getState().save({ muted: update(muted) }); };

  const refresh = useCallback(async (connect = false): Promise<void> => {
    setBusy(true);
    setError(null);
    const results = await Promise.allSettled([
      (connect ? window.api.fusionCodexThreadsList() : Promise.resolve()).then(() => window.api.fusionCodexSnapshot()),
      (connect ? window.api.fusionDshSessionsList() : Promise.resolve()).then(() => window.api.fusionDshSnapshot()),
      window.api.fusionEchoCodexSessions(true).then(echo => useFusionActivity.setState({ echo })),
    ]);
    if (results[0].status === 'fulfilled') setCodex(results[0].value);
    if (results[1].status === 'fulfilled') setDsh(results[1].value);
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length) setError(failed.map(result => result.status === 'rejected' ? String(result.reason) : '').join('\n'));
    setBusy(false);
  }, [t]);

  const connectDsh = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const sessions = await window.api.fusionDshSessionsList();
      const snapshot = await window.api.fusionDshSnapshot();
      setDsh({ ...snapshot, sessions });
    } catch (reason) {
      setDsh(await window.api.fusionDshSnapshot());
      setError(reason instanceof Error ? reason.message : t('fusion.overview.unavailable'));
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    const unsubscribeCodex = window.api.onFusionCodexUpdated(setCodex);
    const unsubscribeDsh = window.api.onFusionDshUpdated(setDsh);
    void refresh();
    return () => {
      unsubscribeCodex();
      unsubscribeDsh();
    };
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem('fusion.pet-muted', String(muted));
  }, [muted]);

  const externalPending = echo?.state === 'ready' ? echo.pendingRequests?.length || 0 : 0;
  const externalWorking = echo?.state === 'ready' && echo.sessions.some(session => ['Processing', 'Running'].includes(session.status));
  const pendingCount = codex.pendingRequests.length + dsh.pendingRequests.length + externalPending;
  const mood: FusionPetMood = pendingCount > 0 ? 'waiting' : (codex.error || dsh.error) ? 'error' : (codex.working || dsh.working || externalWorking) ? 'working' : 'idle';
  const openChat = useCallback((provider: 'codex' | 'dsh'): void => {
    localStorage.setItem('fusion.provider', provider);
    window.dispatchEvent(new CustomEvent('fusion-select-provider', { detail: provider }));
    setMaxExpandTab('aiChat');
  }, [setMaxExpandTab]);

  const startSession = useCallback(async (provider: 'codex' | 'dsh'): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const cwd = await window.api.fusionSelectProject();
      if (!cwd) return;
      if (provider === 'codex') {
        const thread = await window.api.fusionCodexCreateThread(cwd);
        localStorage.setItem('fusion.codex-active-thread', thread.id);
        localStorage.setItem('fusion.session.codex', thread.id);
      } else {
        const session = await window.api.fusionDshCreateSession(cwd);
        localStorage.setItem('fusion.dsh-project', cwd);
        localStorage.setItem('fusion.dsh-active-session', session.id);
        localStorage.setItem('fusion.session.dsh', session.id);
      }
      openChat(provider);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('fusion.overview.unavailable'));
    } finally {
      setBusy(false);
    }
  }, [openChat, t]);

  const resumeCodex = useCallback(async (thread: FusionCodexThread): Promise<void> => {
    try {
      await window.api.fusionCodexResumeThread(thread.id);
      localStorage.setItem('fusion.codex-active-thread', thread.id);
      localStorage.setItem('fusion.session.codex', thread.id);
      openChat('codex');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('fusion.codex.resumeError'));
    }
  }, [openChat, t]);

  const resumeDsh = useCallback(async (session: FusionDshSession): Promise<void> => {
    try {
      await window.api.fusionDshResumeSession(session.id);
      localStorage.setItem('fusion.dsh-project', session.cwd);
      localStorage.setItem('fusion.dsh-active-session', session.id);
      localStorage.setItem('fusion.session.dsh', session.id);
      openChat('dsh');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('fusion.dsh.resumeError'));
    }
  }, [openChat, t]);

  const handleCodexRequest = async (_threadId: string): Promise<void> => {
    document.querySelector<HTMLButtonElement>('.fusion-request-disclosure[aria-expanded="false"]')?.click();
  };
  const handleDshRequest = async (_sessionId: string): Promise<void> => {
    document.querySelector<HTMLButtonElement>('.fusion-request-disclosure[aria-expanded="false"]')?.click();
  };

  return (
    <section className="fusion-session-overview" aria-label={t('fusion.overview.title')}>
      <header className="fusion-overview-header">
        <div className="fusion-overview-brand">
          <FusionPet mood={mood} label={t(`fusion.pet.${mood}`)} muted={muted} />
          <div><strong>{t('fusion.overview.title')}</strong><span>{t('fusion.overview.subtitle')}</span></div>
        </div>
        <div className="fusion-overview-actions">
          <span className={`fusion-count-badge${pendingCount ? ' is-pending' : ''}`}><Clock3 size={13} />{pendingCount} {t('fusion.overview.pending')}</span>
          <button className="fusion-icon-button" type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? t('fusion.sound.on') : t('fusion.sound.off')} title={muted ? t('fusion.sound.on') : t('fusion.sound.off')}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button className="fusion-icon-button" type="button" onClick={() => void refresh(true)} disabled={busy} aria-label={t('fusion.overview.refresh')} title={t('fusion.overview.refresh')}>
            <RefreshCw size={15} className={busy ? 'fusion-refresh-spinning' : ''} />
          </button>
        </div>
      </header>

      {error && <div className="fusion-overview-error" role="status">{error}</div>}

      <div className="fusion-agent-grid">
        <article className="fusion-agent-card fusion-agent-card--codex">
          <div className="fusion-agent-card-heading">
            <div className="fusion-agent-name"><span className="fusion-agent-icon"><FusionProviderIcon provider="codex" /></span><div><strong>{t('fusion.overview.codex')}</strong><small>{codex.working ? t('fusion.overview.working') : codex.state === 'ready' ? t('fusion.overview.ready') : t('fusion.overview.unavailable')}</small></div></div>
            <button className="fusion-new-session" type="button" onClick={() => void startSession('codex')} disabled={busy}><Plus size={14} />{t('fusion.overview.newCodex')}</button>
          </div>
          {codex.threads.length === 0 ? <p className="fusion-overview-empty">{t('fusion.overview.empty')}</p> : (
            <div className="fusion-session-list">
              {codex.threads.map((thread) => (
                <button className="fusion-session-card" type="button" key={thread.id} onClick={() => void resumeCodex(thread)}>
                  <span className="fusion-session-card-copy"><strong>{thread.name || thread.cwd || t('fusion.external.untitled')}</strong><small>{thread.preview || thread.cwd || ''}</small></span>
                  
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="fusion-agent-card fusion-agent-card--dsh">
          <div className="fusion-agent-card-heading">
            <div className="fusion-agent-name"><span className="fusion-agent-icon"><FusionProviderIcon provider="dsh" /></span><div><strong>{t('fusion.overview.dsh')}</strong><small>{dsh.working ? t('fusion.overview.working') : dsh.state === 'ready' ? t('fusion.overview.ready') : t('fusion.overview.unavailable')}</small></div></div>
            <button className="fusion-icon-button" type="button" onClick={() => void connectDsh()} disabled={busy} aria-label={t('fusion.overview.connectDsh')} title={t('fusion.overview.connectDsh')}><RefreshCw size={14} className={busy ? 'fusion-refresh-spinning' : ''} /></button>
            <button className="fusion-new-session" type="button" onClick={() => void startSession('dsh')} disabled={busy}><Plus size={14} />{t('fusion.overview.newDsh')}</button>
          </div>
          {dsh.sessions.length === 0 ? <p className="fusion-overview-empty">{t('fusion.overview.empty')}</p> : (
            <div className="fusion-session-list">
              {dsh.sessions.map((session) => (
                <button className="fusion-session-card" type="button" key={session.id} onClick={() => void resumeDsh(session)}>
                  <span className="fusion-session-card-copy"><strong>{session.title || session.cwd}</strong><small>{session.cwd}</small></span>
                  
                </button>
              ))}
            </div>
          )}
        </article>
        <LocalAgentCards snapshot={echo} onError={setError} />
      </div>

      {(codex.pendingRequests.length > 0 || dsh.pendingRequests.length > 0 || externalPending > 0) && (
        <section className="fusion-pending-section" aria-label={t('fusion.overview.pending')}>
          <div className="fusion-section-heading"><strong>{t('fusion.overview.pending')}</strong><span>{pendingCount}</span></div>
          {codex.pendingRequests.map((request) => (
            <article className="fusion-pending-card" key={`codex:${request.requestId}`}>
              <div><strong>{request.method === 'item/tool/requestUserInput' ? t('fusion.request.questionTitle') : t('fusion.request.approvalTitle')}</strong><p>{request.command || request.reason || request.pathSummary || t('fusion.request.noDetails')}</p><small>{t('fusion.overview.requestSource', { agent: 'Codex', project: request.cwd || codex.threads.find((thread) => thread.id === request.threadId)?.cwd || '' })}</small></div>
              <button className="fusion-pending-open" type="button" onClick={() => void handleCodexRequest(request.threadId)}>{t('fusion.overview.handle')}</button>
            </article>
          ))}
          {echo?.state === 'ready' && echo.pendingRequests?.map(request => {
            const session = echo.sessions.find(item => item.sessionId === request.sessionId && item.source === request.source);
            return <article className="fusion-pending-card" key={`external:${request.requestId}`}>
              <div><strong>{request.kind === 'approval' ? t('fusion.request.approvalTitle') : t('fusion.request.questionTitle')}</strong><p>{request.text}</p><small>{request.source} · {session?.projectName || session?.cwd || ''}</small></div>
              <button className="fusion-pending-open" type="button" disabled={!session?.capabilities?.focus} onClick={() => session && void window.api.fusionFocusSession(session.source, session.sessionId).then(ok => { if (!ok) setError(t('fusion.localAgents.focusFailed')); }).catch(reason => setError(String(reason)))}>{t('fusion.overview.handle')}</button>
            </article>;
          })}
          {dsh.pendingRequests.map((request) => (
            <article className="fusion-pending-card" key={`dsh:${request.requestId}`}>
              <div><strong>{request.title}</strong><p>{request.description || request.toolTitle}</p><small>{t('fusion.overview.requestSource', { agent: t('fusion.provider.dsh'), project: dsh.sessions.find((session) => session.id === request.sessionId)?.cwd || '' })}</small></div>
              <button className="fusion-pending-open" type="button" onClick={() => void handleDshRequest(request.sessionId)}>{t('fusion.overview.handle')}</button>
            </article>
          ))}
        </section>
      )}

      <button className="fusion-overview-chat-link" type="button" onClick={() => openChat('codex')}><CheckCircle2 size={15} />{t('fusion.overview.open')}</button>
    </section>
  );
}
