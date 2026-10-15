/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file FusionQuestionEditor.tsx @description Shared per-request answers supporting single and multiple choice. @author 鸡哥 */
import { useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useFusionDraft } from './useFusionDraft';
export interface QuestionAnswer { id: string; selected: string[]; custom?: string; }
interface Question { id: string; question: string; options?: Array<{ label: string; description?: string }>; multiSelect?: boolean; }

/** Saves input independently from page visibility and only submits explicit answers. */
export function FusionQuestionEditor({ requestKey, questions, disabled, submit }: {
  requestKey: string; questions: Question[]; disabled?: boolean; submit: (answers: QuestionAnswer[]) => Promise<unknown>;
}): JSX.Element {
  const { t } = useTranslation();
  const draft = useFusionDraft('request:' + requestKey);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  let values: Record<string, QuestionAnswer> = {};
  try { values = JSON.parse(draft.value.text || '{}'); } catch { /* first input */ }
  const change = (id: string, value: QuestionAnswer): void => draft.update({ text: JSON.stringify({ ...values, [id]: value }) });
  return <div className="fusion-questions">{questions.map(question => {
    const answer = values[question.id] || { id: question.id, selected: [] };
    return <fieldset key={question.id} disabled={disabled || busy || !draft.ready}>
      <legend>{question.question}</legend>
      {question.options?.map(option => <label key={option.label} title={option.description}>
        <input type={question.multiSelect ? 'checkbox' : 'radio'} name={requestKey + ':' + question.id}
          checked={answer.selected.includes(option.label)} onChange={() => change(question.id, {
            ...answer, custom: question.multiSelect ? answer.custom : '',
            selected: question.multiSelect ? answer.selected.includes(option.label) ? answer.selected.filter(s => s !== option.label) : [...answer.selected, option.label] : [option.label],
          })} />{option.label}</label>)}
      <textarea aria-label={question.question} value={answer.custom || ''} placeholder={t('fusion.request.answerPlaceholder')}
        onChange={event => change(question.id, { ...answer, custom: event.target.value, selected: question.multiSelect ? answer.selected : [] })} />
    </fieldset>;
  })}
    {draft.conflict && <div>{t('fusion.entry.draftConflict')}<button onClick={() => draft.resolve(true)}>{t('fusion.entry.keepMine')}</button>
      <button onClick={() => draft.resolve(false)}>{t('fusion.entry.useLatest')}</button></div>}
    <button disabled={disabled || busy || !draft.ready || draft.conflict || questions.some(q => !values[q.id]?.selected.length && !values[q.id]?.custom?.trim())}
      onClick={() => { setBusy(true); setError(''); void draft.flush().then(ok => {
        if (ok) return submit(questions.map(q => values[q.id] || { id: q.id, selected: [] }));
        return undefined;
      }).catch(reason => setError(String(reason))).finally(() => setBusy(false)); }}>{t('fusion.request.submitAnswer')}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
