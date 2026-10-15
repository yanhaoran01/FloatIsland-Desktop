/* FloatIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file WorkBuddySettings.tsx @description Explicit local WorkBuddy program/config selection. @author 鸡哥 */
import {useEffect,useState,type JSX} from 'react';
import {useTranslation} from 'react-i18next';
import type {WorkBuddyConfig} from '../../../preload/types/fusionWorkspace';
/** Shows local installation options; never signs in or submits prompts. */
export function WorkBuddySettings():JSX.Element|null {
  const {t}=useTranslation();const [value,setValue]=useState<WorkBuddyConfig|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let alive=true;void window.api.fusionWorkBuddyGet().then(result=>{if(alive)setValue(result);}).catch(reason=>{if(alive)setError(String(reason));});return()=>{alive=false;};},[]);
  if(!value)return error?<p role="alert">{error}</p>:null;
  return <form className="fusion-api-settings" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{setValue(await window.api.fusionWorkBuddySave(value));}catch(reason){setError(String(reason));}finally{setBusy(false);}}}>
    <label>{t('fusion.workbuddy.edition')}<select value={value.edition} onChange={event=>{const edition=event.target.value==='intl'?'intl':'cn';setValue({...value,edition,executable:value.candidates.find(path=>/WorkBuddyAI/i.test(path)===(edition==='intl'))??value.executable});}}><option value="cn">{t('fusion.workbuddy.cn')}</option><option value="intl">{t('fusion.workbuddy.intl')}</option></select></label>
    <label>{t('fusion.workbuddy.program')}<input value={value.executable} onChange={event=>setValue({...value,executable:event.target.value})}/></label>
    <label>{t('fusion.workbuddy.config')}<input value={value.configDir} onChange={event=>setValue({...value,configDir:event.target.value})}/></label>
    <button type="submit" disabled={busy}>{t('fusion.assistant.save')}</button>{error&&<p role="alert">{error}</p>}
  </form>;
}
