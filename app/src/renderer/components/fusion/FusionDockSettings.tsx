/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file FusionDockSettings.tsx @description 停靠、自动隐藏和快捷键的有效配置。 @author 鸡哥 */
import {useEffect,useRef,useState,type JSX} from 'react';
import {useTranslation} from 'react-i18next';
import {ShortcutInput} from './ShortcutInput';
import type {FusionDockState,FusionDockConfig} from '../../../preload/types/fusionWorkspace';
/** Saves through main process validation and reflects values broadcast to both windows. */
export function FusionDockSettings(): JSX.Element {
 const {t}=useTranslation();const [state,setState]=useState<FusionDockState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[shortcut,setShortcut]=useState('');
 const effectiveShortcut=useRef<string|undefined>(undefined);
 const receive=(s:FusionDockState)=>{setState(s);if(effectiveShortcut.current!==s.config.shortcut){effectiveShortcut.current=s.config.shortcut;setShortcut(s.config.shortcut);}};
 useEffect(()=>{void window.api.fusionDockGet().then(receive).catch(e=>setError(String(e)));return window.api.onFusionDock(receive);},[]);
 const save=async(patch:Partial<FusionDockConfig>)=>{setBusy(true);setError('');try{receive(await window.api.fusionDockSave(patch));}catch(e){setError(String(e).includes('shortcut')?t('fusion.dock.shortcutConflict'):t('fusion.settings.saveError'));}finally{setBusy(false);}};
 return <fieldset className="fusion-dock-settings" disabled={!state||busy}>
 <label className="fusion-setting-row"><span>{t('fusion.dock.edge')}</span><select value={state?.config.edge||'top'} onChange={e=>void save({edge:e.target.value as FusionDockConfig['edge']})}>{(['top','left','right'] as const).map(edge=><option key={edge} value={edge}>{t('fusion.dock.'+edge)}</option>)}</select></label>
 <label className="fusion-setting-row"><span>{t('fusion.dock.autoHide')}</span><input type="checkbox" checked={state?.config.autoHide||false} onChange={e=>void save({autoHide:e.target.checked})}/></label>
 <label className="fusion-setting-row"><span>{t('fusion.dock.delay')}</span><select value={state?.config.delayMs||3000} onChange={e=>void save({delayMs:Number(e.target.value)})}>{[1000,3000,5000,10000,30000].map(ms=><option key={ms} value={ms}>{t('fusion.dock.seconds',{count:ms/1000})}</option>)}</select></label>
 <div className="fusion-setting-row"><span>{t('fusion.dock.shortcut')}</span><ShortcutInput label={t('fusion.dock.shortcut')} value={shortcut} onChange={setShortcut} disabled={!state||busy}/></div>
 <div className="fusion-settings-actions"><button onClick={()=>void save({shortcut})}>{t('fusion.assistant.save')}</button><button onClick={()=>void window.api.fusionDockReset().then(receive).catch(()=>setError(t('fusion.settings.saveError')))}>{t('fusion.dock.reset')}</button></div>
 <button type="button" onClick={()=>void window.api.fusionViewportControl('reset').catch(()=>setError(t('fusion.settings.saveError')))}>{t('fusion.viewport.reset')}</button>
 {(error||state?.shortcutError)&&<p role="alert">{error||t('fusion.dock.shortcutConflict')}</p>}
 </fieldset>;
}
