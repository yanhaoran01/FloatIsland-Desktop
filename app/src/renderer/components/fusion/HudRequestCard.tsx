/* FloatIsland contributors. GPL-3.0. */
/** @file HudRequestCard.tsx @description Explicit, retryable approval actions. @author 鸡哥 */
import { useRef, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { FusionQuestionEditor } from './FusionQuestionEditor';
import type { HudRequest } from './hudRequests';

/** Opens the originating session without answering a request. */
export function openHudSession(
  source: string,
  session: string,
  requestId?: string
): void {
  if (source === 'claude' || source === 'workbuddy') {
    void window.api.fusionFocusSession(source, session);
    return;
  }
  void window.api.openWorkspace({
    tab: 'fusionSessions',
    sessionKey: source + ':' + session,
    requestId
  });
}
/** Preserves failed approvals and question drafts for explicit retry. */
export function HudRequestCard({
  request: r
}: {
  request: HudRequest;
}): JSX.Element {
  const { t } = useTranslation();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submit = async (action: () => Promise<unknown>): Promise<void> => {
    if (lock.current || r.submitted) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <article
      className="fusion-pending-card"
      data-source={r.source}
      data-request-id={r.requestId}
      data-no-drag
    >
      <strong>
        {r.source === 'dsh' ? 'DeepSeek' : r.source} · {r.session}
      </strong>
      <p>{r.title || t('fusion.request.noDetails')}</p>
      {r.reason && <pre>{r.reason}</pre>}
      {r.questions && r.answer && (
        <FusionQuestionEditor
          requestKey={r.key}
          questions={r.questions}
          disabled={r.submitted}
          submit={r.answer}
        />
      )}
      <div className="fusion-request-actions">
        {r.actions.map((action) => (
          <button
            key={action.id}
            disabled={busy || r.submitted}
            onClick={() => void submit(action.run)}
          >
            {t(action.label)}
          </button>
        ))}
        <button
          onClick={() => openHudSession(r.source, r.session, r.requestId)}
        >
          {t('fusion.hud.openSession')}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
