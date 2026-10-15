/* FloatIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file ShortcutInput.tsx @description Visible editable accelerators with keyboard recording. @author 鸡哥 */
import {useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Keyboard} from 'lucide-react';
import {shortcutFromKey} from './shortcutCapture';
import './shortcutInput.css';
/** Recording changes the draft only; each host retains its explicit save and conflict handling. */
export function ShortcutInput({label,value,onChange,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  const {t}=useTranslation(),input=useRef<HTMLInputElement>(null),[recording,setRecording]=useState(false);
  return <div className="float-shortcut-control"><input ref={input} aria-label={label} title={t('fusion.shortcutInput.hint')} value={value} disabled={disabled} readOnly={recording} onChange={event=>onChange(event.target.value)} onBlur={()=>setRecording(false)} onKeyDown={event=>{
    if(!recording)return;
    if(event.key==='Escape'||event.key==='Tab'&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.shiftKey){setRecording(false);if(event.key==='Escape')event.preventDefault();return;}
    event.preventDefault();const next=shortcutFromKey(event);if(next){onChange(next);setRecording(false);}
  }}/><button type="button" disabled={disabled} aria-pressed={recording} aria-label={t('fusion.shortcutInput.record')+' · '+label} onClick={()=>{setRecording(true);input.current?.focus();}}><Keyboard size={15}/>{t(recording?'fusion.shortcutInput.recording':'fusion.shortcutInput.record')}</button></div>;
}
