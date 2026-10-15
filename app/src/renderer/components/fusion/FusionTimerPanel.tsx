/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file FusionTimerPanel.tsx @description Countdown controls for the shared background timer. @author 鸡哥 */
import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { FusionTimer } from '../../../preload/types/fusionWorkspace';

/** Keeps timing in the main process while this view only presents controls. */
export function FusionTimerPanel(): JSX.Element {
  const { t } = useTranslation();
  const [timer, setTimer] = useState<FusionTimer | null>(null);
  const [minutes, setMinutes] = useState(5);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const receive = (value: FusionTimer): void => { if (active) setTimer(value); };
    const stop = window.api.onFusionTimer(receive);
    void window.api.fusionTimerGet().then(receive).catch(reason => setError(String(reason)));
    return () => { active = false; stop(); };
  }, []);
  const control = async (action: 'start' | 'pause' | 'resume' | 'reset'): Promise<void> => {
    try { setError(''); setTimer(await window.api.fusionTimerControl(action, Math.round(minutes * 60))); }
    catch (reason) { setError(String(reason)); }
  };
  const remaining = timer?.remaining || 0;
  const clock = [Math.floor(remaining / 3600), Math.floor(remaining / 60) % 60, remaining % 60].map(value => String(value).padStart(2, '0')).join(':');
  return <section className="fusion-timer-panel">
    <p>{t('fusion.timer.' + (timer?.state || 'idle'))}</p>
    <output className="fusion-timer-clock">{clock}</output>
    {timer?.state !== 'running' && timer?.state !== 'paused' && <label>{t('fusion.timer.minutes')}
      <input type="number" min="0.1" max="5999" step="0.1" value={minutes} onChange={event => setMinutes(Number(event.target.value))} />
    </label>}
    <div className="fusion-timer-presets">{[5, 15, 25].map(value => <button key={value} disabled={timer?.state === 'running'}
      onClick={() => setMinutes(value)}>{t('fusion.timer.preset', { count: value })}</button>)}</div>
    <div className="fusion-timer-actions">
      <button disabled={!timer} onClick={() => void control(timer?.state === 'running' ? 'pause' : timer?.state === 'paused' ? 'resume' : 'start')}>
        {t('fusion.timer.' + (timer?.state === 'running' ? 'pause' : timer?.state === 'paused' ? 'resume' : 'start'))}</button>
      <button disabled={!timer || timer.state === 'idle'} onClick={() => void control('reset')}>{t('fusion.timer.reset')}</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
