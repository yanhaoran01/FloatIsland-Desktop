/*
 * eIsland - A sleek, Apple Dynamic Island inspired floating widget for Windows, built with Electron.
 * https://github.com/JNTMTMTM/eIsland
 *
 * Copyright (C) 2026 JNTMTMTM
 * Copyright (C) 2026 pyisland.com
 *
 * Original author: JNTMTMTM[](https://github.com/JNTMTMTM)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */

/**
 * @file useTranslateTool.ts
 * @description 翻译工具服务状态复用 Hook。
 * @author 鸡哥
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchTranslate } from '../../../../../../api/tools/toolboxTranslateApi';

/** Anonymous translation; stale responses never replace an edited draft. */
export function useTranslateTool() {
  const { t } = useTranslation();
  const [sourceLang, updateSourceLang] = useState('auto');
  const [targetLang, updateTargetLang] = useState('en');
  const [sourceText, updateSourceText] = useState('');
  const [resultText, setResultText] = useState('');
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<string | null>(null);
  const cancelRequest = useCallback(() => {
    const id = active.current;
    active.current = null;
    if (id) void window.api.fusionTranslateCancel(id).catch(() => {});
  }, []);
  useEffect(() => cancelRequest, [cancelRequest]);
  const handleCancel = useCallback(() => { cancelRequest(); setTranslating(false); }, [cancelRequest]);
  const setSourceText = useCallback((value: string) => { handleCancel(); updateSourceText(value); setError(''); }, [handleCancel]);
  const setSourceLang = useCallback((value: string) => { handleCancel(); updateSourceLang(value); setError(''); }, [handleCancel]);
  const setTargetLang = useCallback((value: string) => { handleCancel(); updateTargetLang(value); setError(''); }, [handleCancel]);
  const handleSwapLanguages = useCallback(() => {
    if (sourceLang === 'auto') return;
    handleCancel(); updateSourceLang(targetLang); updateTargetLang(sourceLang);
    updateSourceText(resultText); setResultText(sourceText); setError('');
  }, [handleCancel, sourceLang, targetLang, sourceText, resultText]);
  const handleTranslate = useCallback(() => {
    if (!sourceText.trim() || translating) return;
    const id = crypto.randomUUID(); active.current = id;
    setTranslating(true); setError(''); setResultText('');
    void fetchTranslate(sourceText, sourceLang, targetLang, id).then(result => {
      if (active.current !== id) return;
      if (result.success && result.data) setResultText(result.data.targetText);
      else {
        const detail = result.message || '';
        const key = detail.includes('quota-or-service') ? 'serviceUnavailable'
          : detail.includes('invalid-text') ? 'invalidText'
          : detail.includes('invalid-language') ? 'invalidLanguage' : 'networkError';
        setError(t('maxExpand.toolbox.translate.' + key));
      }
    }).finally(() => { if (active.current === id) { active.current = null; setTranslating(false); } });
  }, [sourceText, sourceLang, targetLang, translating, t]);
  const handleCopyResult = useCallback(() => {
    if (resultText) void navigator.clipboard.writeText(resultText).catch(() => setError(t('maxExpand.toolbox.translate.copyError')));
  }, [resultText, t]);
  const handleClearAll = useCallback(() => {
    handleCancel(); updateSourceText(''); setResultText(''); setError('');
  }, [handleCancel]);
  return { sourceLang, targetLang, sourceText, resultText, translating, error,
    setSourceLang, setTargetLang, setSourceText, handleSwapLanguages, handleTranslate,
    handleCancel, handleCopyResult, handleClearAll };
}
