/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/**
 * @file FusionRequestQueue.tsx
 * @description Session-independent request cards; navigation never answers or cancels a request.
 * @author 鸡哥
 */
import { FusionQuestionEditor } from './FusionQuestionEditor';
import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useFusionActivity } from './fusionActivity';

/** Preserves request drafts and routes each explicit answer to its originating service. */
export function FusionRequestQueue(): JSX.Element | null {
  const { t } = useTranslation();
  const { codex, dsh, echo } = useFusionActivity();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [target, setTarget] = useState<{ requestId: string; source?: string } | null>(null);
  const total = (codex?.pendingRequests.length ?? 0) + (dsh?.pendingRequests.length ?? 0) + (echo?.pendingRequests?.length ?? 0);
  useEffect(() => {
    const route = (value: { requestId?: string; sessionKey?: string }): void => {
      if (!value.requestId) return;
      setTarget({ requestId: value.requestId, source: value.sessionKey?.split(':')[0] }); setOpen(true);
    };
    const stop = window.api.onWorkspaceTarget(route);
    void window.api.workspaceTarget().then(route);
    return stop;
  }, []);
  useEffect(() => {
    if (!open || !target) return;
    const card = [...document.querySelectorAll<HTMLElement>('[data-request-id]')]
      .find(element => element.dataset.requestId === target.requestId && (!target.source || element.dataset.source === target.source));
    card?.scrollIntoView({ block: 'nearest' });
  }, [open, target, total]);
  if (!total) return null;
  const submit = async (key: string, action: () => Promise<unknown>): Promise<void> => {
    if (submitting[key]) return;
    setSubmitting((old) => ({ ...old, [key]: true })); setError('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('fusion.overview.unavailable')); }
    finally { setSubmitting((old) => ({ ...old, [key]: false })); }
  };
  return <section className="fusion-global-requests" aria-label={t('fusion.overview.pending')}>
    <button className="fusion-request-disclosure" type="button" aria-expanded={open}
      onClick={() => setOpen(!open)}>{t('fusion.compact.pending', { count: total })}</button>
    <div className="fusion-request-list" hidden={!open}>
      {codex?.pendingRequests.map((request) => {
        const key = 'codex:' + request.requestId;
        return <article key={key} className="fusion-pending-card" data-source="codex" data-request-id={request.requestId}>
          <div><strong>{t('fusion.provider.codex')} · {request.cwd || request.threadId}</strong>
            <p>{request.command || request.reason || request.pathSummary || t('fusion.request.noDetails')}</p>
            {request.questions && <FusionQuestionEditor requestKey={key} questions={request.questions} disabled={request.submitted}
              submit={answers => window.api.fusionCodexAnswer(request.requestId, 'accept', Object.fromEntries(answers.map(a => [a.id, [...a.selected, ...(a.custom ? [a.custom] : [])]])))} />}
            <div className="fusion-request-actions">
              {!request.questions &&                 <><button disabled={submitting[key] || request.submitted} onClick={() => void submit(key, () => window.api.fusionCodexAnswer(request.requestId, 'accept'))}>{t('fusion.request.allowOnce')}</button>
                  <button disabled={submitting[key] || request.submitted} onClick={() => void submit(key, () => window.api.fusionCodexAnswer(request.requestId, 'decline'))}>{t('fusion.request.deny')}</button></>}
            </div>
          </div>
        </article>;
      })}
      {dsh?.pendingRequests.map((request) => {
        const key = 'dsh:' + request.requestId;
        return <article className="fusion-pending-card" key={key} data-source="dsh" data-request-id={request.requestId}><div>
          <strong>{t('fusion.provider.dsh')} · {request.sessionId}</strong><p>{request.title}</p><p>{request.description || request.toolTitle}</p>
          {request.questions && <FusionQuestionEditor requestKey={key} questions={request.questions} disabled={request.submitted}
            submit={answers => window.api.fusionDshAnswerQuestions(request.requestId, answers)} />}
          <div className="fusion-request-actions">{request.options.map((option) => <button type="button" key={option.optionId} disabled={submitting[key] || request.submitted}
            onClick={() => void submit(key, () => window.api.fusionDshAnswerPermission(request.requestId, option.optionId))}>{request.native ? t(option.kind === 'allow_once' ? 'fusion.request.allowOnce' : 'fusion.request.deny') : option.name}</button>)}</div>
        </div></article>;
      })}
      {echo?.pendingRequests?.map((request) => {
        const key = request.source + ':' + request.requestId;
        return <article className="fusion-pending-card" key={key} data-source={request.source} data-request-id={request.requestId}><div>
          <strong>{request.source} · {request.sessionId}</strong><p>{request.text || t('fusion.request.noDetails')}</p>
          {request.operation !== undefined && <pre>{JSON.stringify(request.operation, null, 2)}</pre>}
          {request.kind === 'question' && <FusionQuestionEditor requestKey={key}
            questions={[{ id: request.requestId, question: request.text, options: request.options?.map(label => ({ label })) }]}
            submit={async answers => { const answer = answers[0]; await window.api.fusionAnswerExternalRequest(request.requestId, 'answer', [...answer.selected, ...(answer.custom ? [answer.custom] : [])].join('\n')); }} />}
          <div className="fusion-request-actions">
            {request.kind === 'approval' && <button disabled={submitting[key]} onClick={() => void submit(key, () => window.api.fusionAnswerExternalRequest(request.requestId, 'approve'))}>{t('fusion.request.allowOnce')}</button>}
            {request.kind === 'approval' && <button disabled={submitting[key]} onClick={() => void submit(key, () => window.api.fusionAnswerExternalRequest(request.requestId, 'deny'))}>{t('fusion.request.deny')}</button>}
          </div>
        </div></article>;
      })}
      {error && <p role="alert">{error}</p>}
    </div>
  </section>;
}

