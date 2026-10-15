/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file FusionShortRequest.tsx @description One concise original-source request on the island. @author 鸡哥 */
import { useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useFusionActivity } from './fusionActivity';

/** Offers one-shot decisions and directs detailed questions to the workbench. */
export function FusionShortRequest(): JSX.Element | null {
  const { t } = useTranslation();
  const { codex, dsh, echo } = useFusionActivity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const c = codex?.pendingRequests[0], d = !c ? dsh?.pendingRequests[0] : undefined;
  const e = !c && !d ? echo?.pendingRequests?.[0] : undefined;
  if (!c && !d && !e) return null;
  const source = c ? 'codex' : d ? 'dsh' : e!.source;
  const id = c?.requestId || d?.requestId || e!.requestId;
  const session = c?.threadId || d?.sessionId || e!.sessionId;
  const details = c?.command || c?.pathSummary || c?.reason || d?.description || e?.text || t('fusion.request.noDetails');
  const allow = d?.options.find(option => option.kind === 'allow_once');
  const deny = d?.options.find(option => option.kind === 'reject_once');
  const question = c?.method === 'item/tool/requestUserInput' || e?.kind === 'question' || (Boolean(d) && (!allow || !deny));
  const submit = async (accept: boolean): Promise<void> => {
    if (busy || c?.submitted || d?.submitted) return;
    setBusy(true); setError('');
    try {
      if (c) await window.api.fusionCodexAnswer(id, accept ? 'accept' : 'decline');
      else if (d) await window.api.fusionDshAnswerPermission(id, accept ? allow!.optionId : deny!.optionId);
      else await window.api.fusionAnswerExternalRequest(id, accept ? 'approve' : 'deny');
    } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  };
  return <aside className="fusion-short-request">
    <strong>{source === 'dsh' ? t('fusion.provider.dsh') : source} · {c?.cwd || session}</strong><p>{details}</p>
    <div>{!question && <><button disabled={busy || c?.submitted || d?.submitted} onClick={() => void submit(true)}>{t('fusion.request.allowOnce')}</button>
      <button disabled={busy || c?.submitted || d?.submitted} onClick={() => void submit(false)}>{t('fusion.request.deny')}</button></>}
      <button onClick={() => void window.api.openWorkspace({ tab: 'fusionSessions', sessionKey: source + ':' + session, requestId: id })}>{t('fusion.entry.details')}</button>
    </div>{error && <small role="alert">{error}</small>}
  </aside>;
}
