/* FloatIsland contributors. GPL-3.0. */
/** @file hudRequests.ts @description Ordered request adapters for the optional Agent HUD. @author 鸡哥 */
import { useFusionActivity } from './fusionActivity';
import type { QuestionAnswer } from './FusionQuestionEditor';

export interface HudRequest {
  key: string;
  source: string;
  session: string;
  requestId: string;
  title: string;
  reason: string;
  submitted?: boolean;
  questions?: {
    id: string;
    question: string;
    options?: { label: string; description?: string }[];
    multiSelect?: boolean;
  }[];
  actions: { id: string; label: string; run: () => Promise<unknown> }[];
  answer?: (answers: QuestionAnswer[]) => Promise<unknown>;
}
const arrivals = new Map<string, number>();
let sequence = 0;
async function external(
  id: string,
  action: 'approve' | 'deny' | 'answer',
  answer?: string
): Promise<void> {
  if (!(await window.api.fusionAnswerExternalRequest(id, action, answer)))
    throw Error('Request was not accepted. Return to the session or retry.');
}
/** Arrival order stays stable across views and service snapshot refreshes. */
export function useHudRequests(): HudRequest[] {
  const { codex, dsh, echo } = useFusionActivity();
  const requests: HudRequest[] = [];
  for (const r of codex?.pendingRequests ?? [])
    requests.push({
      key: 'codex:' + r.requestId,
      source: 'codex',
      session: r.threadId,
      requestId: r.requestId,
      title: r.command || r.pathSummary || r.method,
      reason: r.reason || r.cwd || '',
      submitted: r.submitted,
      questions: r.questions,
      answer: (answers) =>
        window.api.fusionCodexAnswer(
          r.requestId,
          'accept',
          Object.fromEntries(
            answers.map((a) => [
              a.id,
              [...a.selected, ...(a.custom ? [a.custom] : [])]
            ])
          )
        ),
      actions: r.questions
        ? []
        : [
            {
              id: 'allow',
              label: 'fusion.request.allowOnce',
              run: () => window.api.fusionCodexAnswer(r.requestId, 'accept')
            },
            {
              id: 'deny',
              label: 'fusion.request.deny',
              run: () => window.api.fusionCodexAnswer(r.requestId, 'decline')
            }
          ]
    });
  for (const r of dsh?.pendingRequests ?? [])
    requests.push({
      key: 'dsh:' + r.requestId,
      source: 'dsh',
      session: r.sessionId,
      requestId: r.requestId,
      title: r.toolTitle || r.title,
      reason: r.description,
      submitted: r.submitted,
      questions: r.questions,
      answer: (answers) =>
        window.api.fusionDshAnswerQuestions(r.requestId, answers),
      actions: r.questions
        ? []
        : r.options.map((o) => ({
            id: o.optionId,
            label: r.native
              ? o.kind === 'allow_once'
                ? 'fusion.request.allowOnce'
                : 'fusion.request.deny'
              : o.name,
            run: () =>
              window.api.fusionDshAnswerPermission(r.requestId, o.optionId)
          }))
    });
  for (const r of echo?.pendingRequests ?? []) {
    if (
      requests.some(
        (q) =>
          q.source === r.source &&
          q.requestId === (r.originalRequestId || r.requestId)
      )
    )
      continue;
    const capable =
      echo?.sessions.find(
        (s) => s.sessionId === r.sessionId && s.source === r.source
      )?.capabilities?.approve === true;
    requests.push({
      key: r.source + ':' + r.requestId,
      source: r.source,
      session: r.sessionId,
      requestId: r.requestId,
      title: r.text,
      reason:
        r.operation === undefined ? '' : JSON.stringify(r.operation, null, 2),
      questions:
        capable && r.kind === 'question'
          ? [
              {
                id: r.requestId,
                question: r.text,
                options: r.options?.map((label) => ({ label }))
              }
            ]
          : undefined,
      answer: (answers) =>
        external(
          r.requestId,
          'answer',
          [
            ...answers[0].selected,
            ...(answers[0].custom ? [answers[0].custom] : [])
          ].join('\n')
        ),
      actions:
        capable && r.kind === 'approval'
          ? [
              {
                id: 'allow',
                label: 'fusion.request.allowOnce',
                run: () => external(r.requestId, 'approve')
              },
              {
                id: 'deny',
                label: 'fusion.request.deny',
                run: () => external(r.requestId, 'deny')
              }
            ]
          : []
    });
  }
  for (const s of echo?.sessions ?? [])
    if (
      /waitingapproval/i.test(s.status) &&
      !requests.some((r) => r.source === s.source && r.session === s.sessionId)
    )
      requests.push({
        key: s.source + ':waiting:' + s.sessionId,
        source: s.source,
        session: s.sessionId,
        requestId: '',
        title: s.currentTool || s.lastUserPrompt || '',
        reason: s.cwd || '',
        actions: []
      });
  const keys = new Set(requests.map((r) => r.key));
  for (const key of arrivals.keys()) if (!keys.has(key)) arrivals.delete(key);
  for (const r of requests)
    if (!arrivals.has(r.key)) arrivals.set(r.key, ++sequence);
  return requests.sort((a, b) => arrivals.get(a.key)! - arrivals.get(b.key)!);
}
