/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */
/** @file FusionNativeSettings.tsx @description Native window and everyday tool settings with effective-value readback. @author 鸡哥 */
import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';

/** Connects existing native settings without duplicating their configuration storage. */
export function FusionNativeSettings({ section }: { section: 'navigation' | 'tools' }): JSX.Element {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [displays, setDisplays] = useState<Awaited<ReturnType<typeof window.api.getIslandDisplays>>>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setReady(false); setError('');
    const load = async (): Promise<void> => {
      if (section === 'navigation') {
        const [shape, fullscreen, display, available] = await Promise.all([
          window.api.shapeModeGet(), window.api.autoHideFullscreenWindowsGet(),
          window.api.fusionDockGet().then(s=>s.config.displayId), window.api.getIslandDisplays(),
        ]);
        if (active) { setValues({ shape, fullscreen, display }); setDisplays(available); }
      } else {
        const [lyrics, clipboard, urlMode] = await Promise.all([
          window.api.musicLyricsEnabledGet(), window.api.clipboardUrlMonitorGet(), window.api.clipboardUrlDetectModeGet(),
        ]);
        if (active) setValues({ lyrics, clipboard, urlMode });
      }
      if (active) setReady(true);
    };
    void load().catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [section]);
  const change = async (key: string, write: () => Promise<boolean>, read: () => Promise<string | boolean>): Promise<void> => {
    setBusy(true); setError('');
    try {
      if (!await write()) throw new Error(t('fusion.settings.saveError'));
      const effective = await read();
      setValues(previous => ({ ...previous, [key]: effective }));
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  const checkbox = (key: string, write: (value: boolean) => Promise<boolean>, read: () => Promise<boolean>): JSX.Element =>
    <label className="fusion-setting-row"><span>{t('fusion.nativeSettings.' + key)}</span>
      <input type="checkbox" checked={values[key] === true} onChange={event => {
        const checked = event.target.checked; void change(key, () => write(checked), read);
      }} /></label>;
  return <div className="fusion-native-settings">
    {!ready && !error && <p role="status">{t('maxExpand.loading')}</p>}
    <fieldset disabled={!ready || busy}>
      {section === 'navigation' ? <>
        <label className="fusion-setting-row">{t('fusion.nativeSettings.shape')}
          <select value={String(values.shape || 'pill')} onChange={event => {
            const value = event.target.value; void change('shape', () => window.api.shapeModeSet(value), window.api.shapeModeGet);
          }}>
            <option value="pill">{t('fusion.nativeSettings.pill')}</option>
            <option value="notch">{t('fusion.nativeSettings.notch')}</option>
          </select></label>
        <label className="fusion-setting-row">{t('fusion.nativeSettings.display')}
          <select value={String(values.display || 'primary')} onChange={event => {
            const value = event.target.value; void change('display', async () => { await window.api.fusionDockSave({displayId:value}); return true; }, async () => (await window.api.fusionDockGet()).config.displayId);
          }}>
            <option value="primary">{t('fusion.nativeSettings.primary')}</option>
            {displays.map((display, index) => <option key={display.id} value={display.id}>
              {t('fusion.nativeSettings.screen', { number: index + 1 })} · {display.width} × {display.height}
            </option>)}
          </select></label>
        {checkbox('fullscreen', window.api.autoHideFullscreenWindowsSet, window.api.autoHideFullscreenWindowsGet)}

      </> : <>
        {checkbox('lyrics', window.api.musicLyricsEnabledSet, window.api.musicLyricsEnabledGet)}
        {checkbox('clipboard', window.api.clipboardUrlMonitorSet, window.api.clipboardUrlMonitorGet)}
        <label className="fusion-setting-row">{t('fusion.nativeSettings.urlMode')}
          <select value={String(values.urlMode || 'https-only')} onChange={event => {
            const value = event.target.value as 'https-only' | 'http-https' | 'domain-only';
            void change('urlMode', () => window.api.clipboardUrlDetectModeSet(value), window.api.clipboardUrlDetectModeGet);
          }}>{['https-only', 'http-https', 'domain-only'].map(mode =>
            <option key={mode} value={mode}>{t('fusion.nativeSettings.' + mode)}</option>)}</select></label>
      </>}
    </fieldset>
    {error && <p className="fusion-inline-error" role="alert">{error}</p>}
  </div>;
}
