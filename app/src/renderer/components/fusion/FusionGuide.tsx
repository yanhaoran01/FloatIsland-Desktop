/* FloatIsland - https://github.com/JNTMTMTM/eIsland. Copyright (C) 2026 contributors. GPL-3.0. */
/** @file FusionGuide.tsx @description Direct start with optional dock and shortcut setup in the retained viewport. @author 鸡哥 */
import {useEffect, useRef, useState, type CSSProperties, type JSX} from 'react';
import {useTranslation} from 'react-i18next';
import type {OnboardingPatch, OnboardingState} from '../../../shared/onboarding';
import {configureOnboarding} from './onboardingCompletion';
import {ShortcutInput} from './ShortcutInput';
import useIslandStore from '../../store/slices';
import {FusionPet} from './FusionPet';
import applicationMark from '../../assets/float-island.svg';
import {writeWorkspaceNavigation} from './workspaceNavigation';
import {useAdaptiveView} from './useCompactChatSize';
import {useSlidingIndicator} from './useSlidingIndicator';
import './floatIsland.css';
import './floatDesign.css';
import './floatGuide.css';
import './compactWorkspace.css';

/** Keeps permissions and Agent setup optional. @returns Guide content. */
export function FusionGuide(): JSX.Element {
  const {t, i18n} = useTranslation();
  const root = useRef<HTMLElement>(null);
  const languages = useRef<HTMLDivElement>(null), edges = useRef<HTMLDivElement>(null);
  useAdaptiveView(root, true, 'guide');
  const [state, setState] = useState<OnboardingState | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [direction, setDirection] = useState(1);
  const saves = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void Promise.all([window.api.fusionOnboardingGet(), window.api.fusionDockGet(), window.api.fusionProductData()]).then(([saved, dock, data]) => {
      if (active) setState({...saved, edge: saved.edge ?? dock.config.edge, recallShortcut: saved.recallShortcut ?? dock.config.shortcut, searchShortcut: saved.searchShortcut ?? data.hotkey});
    }).catch(() => {if (active) setError(t('fusion.onboarding.saveError'));});
    const off=window.api.onFusionOnboarding(value=>{if(active&&value.status==='pending'&&value.step===0)setState(old=>old?{...old,...value}:value);});
    return () => {active = false;off();};
  }, [t]);
  const update = (patch: OnboardingPatch): void => {
    if (patch.step !== undefined && state) setDirection(patch.step >= state.step ? 1 : -1);
    setState(old => old ? {...old, ...patch} : old);
    saves.current = saves.current.then(async () => {await window.api.fusionOnboardingSave(patch);}).catch(() => setError(t('fusion.onboarding.saveError')));
  };
  const finish = async (status: 'completed' | 'skipped'): Promise<void> => {
    if (!state || busy) return;
    setBusy(true); setError('');
    try {
      await saves.current;
      const deferred = status === 'completed' && await configureOnboarding(window.api, state);
      await window.api.fusionOnboardingFinish(status);
      if (deferred) localStorage.setItem('fusion.onboarding-shortcut-warning', '1');
      else localStorage.removeItem('fusion.onboarding-shortcut-warning');
      window.dispatchEvent(new Event('fusion-onboarding-shortcuts'));
      localStorage.setItem('fusion.island-view', 'chat');
      writeWorkspaceNavigation({page:'aiChat',islandPage:'chat'});
      window.dispatchEvent(new CustomEvent('fusion-navigate-peer',{detail:'chat'}));
      useIslandStore.getState().setMaxExpandTab('aiChat');
      useIslandStore.getState().setMaxExpand();
    } catch (reason) {
      setError(String(reason).includes('shortcut') || String(reason).includes('hotkey') ? t('fusion.dock.shortcutConflict') : t('fusion.onboarding.saveError'));
      if (String(reason).includes('shortcut') || String(reason).includes('hotkey')) update({step: 1});
    } finally {setBusy(false);}
  };
  const step = state?.step ?? 0;
  const language = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
  useSlidingIndicator(languages, 'button[aria-pressed=true]', step + language);
  useSlidingIndicator(edges, 'button[aria-pressed=true]', step + (state?.edge || ''));
  const shortcut = (label: string, value: string, change: (next: string) => void): JSX.Element => <div className="float-guide-key">
    <span>{label}</span>
    <ShortcutInput label={label} value={value} disabled={!state || busy} onChange={change}/>
  </div>;
  return <section ref={root} className="float-guide" data-step={step} onClick={event => event.stopPropagation()} aria-label={t('fusion.onboarding.title')}>
    <header>
      <span className="float-guide-brand"><img src={applicationMark} alt="" aria-hidden="true" width={20} height={20}/>{t('fusion.brand')}</span>
      <button type="button" className="float-guide-skip" disabled={!state || busy} onClick={() => void finish('skipped')}>{t('fusion.onboarding.skip')}</button>
    </header>
    <main key={step} className="float-guide-stage" style={{'--dir': direction} as CSSProperties}>
      {step === 0 && <>
        <div className="float-guide-copy"><h1>{t('fusion.onboarding.welcome')}</h1></div>
        <div ref={languages} className="float-guide-languages float-guide-segmented fi-segmented" role="group" aria-label={t('fusion.settings.language')}>{(['zh-CN', 'en-US'] as const).map(item => <button key={item} type="button" aria-pressed={language === item} onClick={() => {void i18n.changeLanguage(item); void window.api.storeWrite('i18n-language', item);}}>{t(item === 'zh-CN' ? 'guide.language.zhCN' : 'guide.language.enUS')}</button>)}</div>
      </>}
      {step === 1 && <>
        <div className="float-guide-copy"><h1>{t('fusion.ui.customizeDock')}</h1></div>
        <div ref={edges} className="float-guide-edges float-guide-segmented fi-segmented" role="group" aria-label={t('fusion.dock.edge')}>{(['top','bottom','left','right'] as const).map(edge => <button key={edge} type="button" aria-pressed={state?.edge === edge} onClick={() => update({edge})}>{t('fusion.dock.' + edge)}</button>)}</div>
        <div className="float-guide-shortcuts">
          {shortcut(t('fusion.dock.shortcut'), state?.recallShortcut ?? '', recallShortcut => update({recallShortcut}))}
          {shortcut(t('fusion.product.hotkey'), state?.searchShortcut ?? '', searchShortcut => update({searchShortcut}))}
        </div>
      </>}
      {step === 2 && <>
        <div className="float-guide-companion"><span className="float-guide-halo" aria-hidden="true"/><FusionPet mood="idle" muted label={t('fusion.pet.idle')}/></div>
        <div className="float-guide-copy"><h1>{t('fusion.onboarding.ready')}</h1></div>
      </>}
    </main>
    {error && <p className="float-guide-error" role="alert">{error}</p>}
    <footer>
      {step===0?<button type="button" className="float-guide-back float-guide-customize" disabled={busy||!state} onClick={()=>update({step:1})}>{t('fusion.ui.customizeDock')}</button>:<button type="button" className="float-guide-back" disabled={busy||!state} onClick={()=>update({step:0})}>{t('fusion.onboarding.back')}</button>}
      <button type="button" className="float-guide-next" disabled={!state || busy} onClick={() => void finish('completed')}><span>{t('fusion.onboarding.start')}</span></button>
    </footer>
  </section>;
}
