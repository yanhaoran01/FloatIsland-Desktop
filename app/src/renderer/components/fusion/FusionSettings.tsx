/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/**
 * @file FusionSettings.tsx
 * @description Effective settings shared by the workspace and chat configuration links.
 * @author 鸡哥
 */
import { useEffect, useRef, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useFusionPreferences, type FusionPreferences } from './fusionPreferences';
import {ProductSettings} from './ProductSettings';
import { AvatarSettings } from './AvatarSettings';
import { FusionDockSettings } from './FusionDockSettings';
import { FusionNativeSettings } from './FusionNativeSettings';
import type { FusionAssistantProvider, FusionAssistantConfig } from '../../../preload/types/fusion';
import { useSlidingIndicator } from './useSlidingIndicator';
import {WorkBuddySettings} from './WorkBuddySettings';
import {useContentWidth} from './useContentWidth';
import './settingsLayout.css';

const SECTIONS = ['agents', 'models', 'pet', 'navigation', 'reminders', 'tools', 'about'] as const;
type Section = typeof SECTIONS[number];

/** Installs only owned integration entries and keeps rollback backups in the main process. */
function AgentSettings(): JSX.Element {
  const { t } = useTranslation();
  const [items, setItems] = useState<Awaited<ReturnType<typeof window.api.fusionIntegrationsList>>>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void window.api.fusionIntegrationsList().then(value => { if (active) setItems(value); }).catch(reason => setMessage(String(reason)));
    return () => { active = false; };
  }, []);
  const change = async (source: 'codex' | 'claude' | 'dsh'|'workbuddy', remove: boolean): Promise<void> => {
    setBusy(true); setMessage('');
    try {
      await window.api.fusionIntegrationChange(source, remove);
      setItems(await window.api.fusionIntegrationsList());
      setMessage(t('fusion.integrations.restart'));
    } catch (reason) { setMessage(String(reason)); }
    finally { setBusy(false); }
  };
  return <div className="fusion-integration-list">{items.map(item => <article className="fusion-integration-card" key={item.source}>
    <div><strong>{item.source === 'claude' ? 'Claude Code' : t('fusion.provider.' + item.source)}</strong>
      <p>{t(item.installed ? 'fusion.integrations.installed' : 'fusion.integrations.notInstalled')}</p></div>
    <div><button disabled={busy} onClick={() => void change(item.source, item.installed)}>
      {t(item.installed ? 'fusion.integrations.remove' : 'fusion.integrations.install')}</button>
      <button disabled={!item.configured} onClick={() => void window.api.fusionIntegrationOpen(item.source).catch(reason => setMessage(String(reason)))}>{t('fusion.integrations.configure')}</button></div>
  </article>)}<WorkBuddySettings/>{message && <p role="status">{message}</p>}</div>;
}

/** Shares model configuration with the main process; never reads plaintext saved credentials. */
function ModelSettings({ provider }: { provider: FusionAssistantProvider }): JSX.Element {
  const { t } = useTranslation();
  const [config, setConfig] = useState<FusionAssistantConfig | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    window.api.fusionAssistantConfigGet(provider).then((value) => { if (!disposed) setConfig(value); })
      .catch(() => { if (!disposed) setError(t('fusion.assistant.configError')); });
    return () => { disposed = true; };
  }, [provider, t]);
  if (!config) return <p role="status">{error || t('maxExpand.loading')}</p>;
  return <form className="fusion-api-settings" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const effective = await window.api.fusionAssistantConfigSave({ ...config, apiKey: key || undefined });
      setConfig(effective); setKey('');
      window.dispatchEvent(new CustomEvent('fusion-assistant-config-updated', { detail: provider }));
    } catch { setError(t('fusion.assistant.configError')); }
    finally { setBusy(false); }
  }}>
    <label>{t('fusion.assistant.baseUrl')}<input value={config.baseUrl} onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })} /></label>
    <label>{t('fusion.assistant.model')}<input value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} /></label>
    {provider !== 'ollama' && <label>{t('fusion.assistant.apiKey')}<input type="password" autoComplete="new-password"
      value={key} onChange={(e) => setKey(e.target.value)} placeholder={t(config.hasApiKey ? 'fusion.assistant.keyStored' : 'fusion.assistant.keyRequired')} /></label>}
    <button disabled={busy} type="submit">{t(busy ? 'fusion.assistant.saving' : 'fusion.assistant.save')}</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}

/** Presents only controls connected to FusionIsland's effective configuration. */
export function FusionSettings(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [section, setSection] = useState<Section>(() => localStorage.getItem('fusion.settings-model') ? 'models' : 'agents');
  const [provider, setProvider] = useState<FusionAssistantProvider>(() => {const value=localStorage.getItem('fusion.settings-model');return value==='anthropic'||value==='ollama'?value:'openai';});
  const [nativeProvider,setNativeProvider] = useState<'codex'|'dsh'>(()=>localStorage.getItem('fusion.settings-model')==='dsh'?'dsh':'codex');
  const [error, setError] = useState('');
  const preferences = useFusionPreferences((s) => s.value);
  const ready = useFusionPreferences((s) => s.ready);
  const [pendingPreferences,setPendingPreferences] = useState<Partial<FusionPreferences>>({});
  const savingPreferences = useRef(false);
  const save = useFusionPreferences((s) => s.save);
  const selection = useRef(0);
  const aside = useRef<HTMLElement>(null);
  const content=useContentWidth<HTMLElement>(false);
  useSlidingIndicator(aside, 'button[aria-current=page]', section + ':' + content.narrow);
  useEffect(() => {
    let active=true;const initialSelection=selection.current;
    const target = (value: import('../../../preload/types/fusionWorkspace').WorkspaceTarget): void => { if(value.settingsSection) setSection(value.settingsSection); };
    void window.api.workspaceTarget().then(value=>{if(active&&selection.current===initialSelection)target(value);}).catch(reason=>{if(active)setError(String(reason));});
    const off=window.api.onWorkspaceTarget(target);
    return ()=>{active=false;off();};
  }, []);
  useEffect(() => {
    const open = (event: Event): void => {
      const detail = (event as CustomEvent).detail;
      setSection('models');
      if (['openai', 'anthropic', 'ollama'].includes(detail)) setProvider(detail);
      if (detail==='codex'||detail==='dsh') setNativeProvider(detail);
    };
    window.addEventListener('fusion-open-model-settings', open);
    return () => window.removeEventListener('fusion-open-model-settings', open);
  }, []);
  const toggle = (key: keyof FusionPreferences): JSX.Element => <label className="fusion-setting-row" aria-busy={key in pendingPreferences}>
    <span>{t('fusion.settings.' + key)}</span>
    <input type="checkbox" role="switch" checked={pendingPreferences[key] ?? preferences[key]} disabled={!ready || Object.keys(pendingPreferences).length>0} onChange={(e) => {
      if(savingPreferences.current)return;
      const patch={ [key]: e.target.checked };savingPreferences.current=true;setPendingPreferences(patch);
      setError(''); void save(patch).catch(() => setError(t('fusion.settings.saveError'))).finally(()=>{savingPreferences.current=false;setPendingPreferences({});});
    }} />
  </label>;
  return <section ref={content.ref} className="fusion-settings" data-narrow={content.narrow} onWheel={event=>event.stopPropagation()}>
    <div className="fusion-settings-selector" hidden={!content.narrow}><select aria-label={t('fusion.navigation.settings')} value={section} onChange={event=>{selection.current++;setSection(event.target.value as Section);}}>{SECTIONS.map(id=><option key={id} value={id}>{t('fusion.settings.'+id)}</option>)}</select></div>
    <aside ref={aside} hidden={content.narrow} aria-label={t('fusion.navigation.settings')}>{SECTIONS.map((id) =>
      <button type="button" key={id} aria-current={section === id ? 'page' : undefined}
        onClick={() => {selection.current++;setSection(id);}}>{t('fusion.settings.' + id)}</button>)}</aside>
    <div className="fusion-settings-body" key={section}>
      <h2>{t('fusion.settings.' + section)}</h2>
      {section === 'agents' && <><AgentSettings /></>}
      {section === 'models' && <>
        <p>{t('fusion.settings.modelsHint')}</p>
        <select aria-label={t('fusion.provider.select')} value={provider} onChange={(e) => setProvider(e.target.value as FusionAssistantProvider)}>
          <option value="openai">{t('fusion.provider.custom')}</option><option value="anthropic">{t('fusion.provider.anthropic')}</option><option value="ollama">{t('fusion.provider.ollama')}</option>
        </select><ModelSettings key={provider} provider={provider} /><AgentModelSettings key={nativeProvider} initialProvider={nativeProvider} />
      </>}
      {section === 'pet' && <><AvatarSettings /><SpeechSettings />{toggle('muted')}{toggle('reducedMotion')}{toggle('voiceGlow')}
        <label className="fusion-setting-row">{t('fusion.settings.language')}<select value={i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'}
          onChange={(e) => { void i18n.changeLanguage(e.target.value); void window.api.storeWrite('i18n-language', e.target.value); }}>
          <option value="zh-CN">{t('guide.language.zhCN')}</option><option value="en-US">{t('guide.language.enUS')}</option>
        </select></label></>}
      {section === 'navigation' && <><FusionDockSettings /><ProductSettings />{toggle('wheelNavigation')}<FusionNativeSettings key="navigation" section="navigation" /><p>{t('fusion.settings.navigationHint')}</p></>}
      {section === 'reminders' && <>{toggle('completionReminders')}<p>{t('fusion.settings.remindersHint')}</p></>}
      {section === 'tools' && <><FusionNativeSettings key="tools" section="tools" /><p>{t('fusion.settings.toolsHint')}</p></>}
      {section === 'about' && <><ConfigBackupSettings /><button type="button" onClick={()=>void window.api.fusionOnboardingReopen().catch(reason=>setError(String(reason)))}>{t('fusion.onboarding.reopen')}</button><p>{t('fusion.brand')} · 1.3.0</p><p>{t('fusion.settings.aboutHint')}</p>
        <p>{t('fusion.settings.credits')}</p></>}
      {error && <p role="alert" className="fusion-inline-error">{error}</p>}
    </div>
  </section>;
}

/** Shows native Agent model catalogs without starting a task. */
function AgentModelSettings({initialProvider}: {initialProvider:'codex'|'dsh'}): JSX.Element {
 const {t}=useTranslation();const [provider,setProvider]=useState(initialProvider);const [models,setModels]=useState<import('../../../preload/types/fusionWorkspace').FusionModel[]>([]);const [error,setError]=useState('');const [selected,setSelected]=useState('');const generation=useRef(0);const [busy,setBusy]=useState(false);
 useEffect(()=>{generation.current++;setModels([]);setSelected('');setError('');setBusy(false);return()=>{generation.current++;};},[provider]);
 return <div className="fusion-settings-card"><h3>{t('fusion.settings.nativeModels')}</h3><p>{t('fusion.settings.nativeModelsHint')}</p>
 <select aria-label={t('fusion.provider.select')} value={provider} onChange={e=>setProvider(e.target.value as 'codex'|'dsh')}><option value="codex">Codex</option><option value="dsh">DeepSeek Harness</option></select>
 <button disabled={busy} onClick={()=>{const request=++generation.current;setBusy(true);setError('');void window.api.fusionModels(provider).then(value=>{if(request===generation.current)setModels(value);}).catch(e=>{if(request===generation.current)setError(String(e));}).finally(()=>{if(request===generation.current)setBusy(false);});}}>{t('fusion.models.refresh')}</button>
 <select aria-label={t('fusion.models.label')} value={selected} onChange={e=>{const value=e.target.value;setSelected(value);void window.api.fusionDraftGet(provider+':new').then(d=>window.api.fusionDraftWrite(d.key,d.revision,{...d.value,model:value === '' ? undefined : models[Number(value)]})).then(r=>{if(!r.accepted)setError(t('fusion.entry.draftConflict'));}).catch(e=>setError(String(e)));}}><option value="">{t('fusion.models.inherit')}</option>{models.map((m,i)=><option key={JSON.stringify([m.provider,m.id])} value={i}>{m.name}</option>)}</select>
 {error&&<p role="alert">{error}</p>}</div>;
}
/** Reports the selected native speech provider without copying its configuration. */
function SpeechSettings(): JSX.Element {
 const {t}=useTranslation();const [ready,setReady]=useState<boolean|null>(null);const [reason,setReason]=useState('');
 useEffect(()=>{let active=true;const update=(status:import('../../../preload/types/fusionWorkspace').SpeechStatus)=>{if(active){setReady(status.ready);setReason(status.reason||'');}};void window.api.fusionSpeechStatus('dsh').then(update).catch(e=>{if(active){setReady(false);setReason(String(e));}});const off=window.api.onFusionSpeechStatus(e=>{if(e.provider==='dsh')update(e.status);});return()=>{active=false;off();};},[]);
 return <div className="fusion-settings-card"><h3>{t('fusion.settings.speech')}</h3><p role="status">{t(ready===null?'fusion.voice.checking':ready?'fusion.voice.ready':'fusion.voice.unavailable')}{!ready&&reason&&<small> · {reason}</small>}</p><button onClick={()=>void window.api.fusionIntegrationOpen('dsh').catch(e=>setReason(String(e)))}>{t('fusion.voice.dshSetup')}</button></div>;
}
/** Restores only locally created configuration snapshots, preserving a rollback copy. */
function ConfigBackupSettings(): JSX.Element {
 const {t}=useTranslation();const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const action=async(kind:'backup'|'restore')=>{setBusy(true);try{await window.api.fusionConfigBackup(kind);setMessage(t(kind==='backup'?'fusion.settings.backupDone':'fusion.settings.restoreDone'));}catch(e){setMessage(String(e));}finally{setBusy(false);}};
 return <div className="fusion-settings-card"><h3>{t('fusion.settings.backup')}</h3><div className="fusion-settings-actions"><button disabled={busy} onClick={()=>void action('backup')}>{t('fusion.settings.backup')}</button><button disabled={busy} onClick={()=>void action('restore')}>{t('fusion.settings.restore')}</button></div><p>{t('fusion.settings.restoreHint')}</p>{message&&<p role="status">{message}</p>}</div>;
}
