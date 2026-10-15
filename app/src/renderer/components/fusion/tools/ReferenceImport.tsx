/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file ReferenceImport.tsx @description Visible reference imports and native drop isolation for media libraries. @author 鸡哥 */
import {useEffect,useRef,useState,type DragEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {FilePlus2,FolderPlus,RefreshCw,X} from 'lucide-react';
import type {LocalImportRequest,LocalImportResult} from '../../../../preload/types/fusionProduct';
import {ToolError} from './ToolControls';
/** Shares native selection, progress and cancellation while keeping original files intact.
 * @param domain - Library or tool destination. @param imported - Completion callback.
 * @returns Reference import controls and isolated drop handlers.
 */
export function useReferenceImport(domain:LocalImportRequest['domain'],imported:(result:LocalImportResult)=>void){
 const {t}=useTranslation(),[busy,setBusy]=useState(false),[count,setCount]=useState(0),[error,setError]=useState(''),[done,setDone]=useState(false),request=useRef(''),callback=useRef(imported);callback.current=imported;
 useEffect(()=>window.api.onFusionLocalImport(progress=>{if(progress.requestId===request.current)setCount(progress.count);}),[]);
 const run=async(mode:LocalImportRequest['mode'],files?:File[])=>{if(busy)return;const id=crypto.randomUUID();request.current=id;setBusy(true);setCount(0);setDone(false);setError('');try{const result=await window.api.fusionLocalImport({domain,mode,requestId:id},files);if(request.current!==id)return;if(!result.cancelled){setCount(result.count??result.items.length??result.artifacts.length);setDone(true);callback.current(result);if(result.errors.length)setError(result.errors.map(e=>e.name+': '+e.error).join('\n'));}}catch(reason){if(request.current===id)setError(String(reason));}finally{if(request.current===id)setBusy(false);}};
 const drop=(event:DragEvent)=>{if(!event.dataTransfer.files.length)return;event.preventDefault();event.stopPropagation();void run('drop',Array.from(event.dataTransfer.files));};
 useEffect(()=>{if(!done)return;const timer=setTimeout(()=>setDone(false),3500);return()=>clearTimeout(timer);},[done]);
 const controls=<div className="float-reference-import" aria-busy={busy}><div className="fusion-tool-actions">
  <button disabled={busy} onClick={()=>void run('files')}><FilePlus2 size={16}/>{t('fusion.enhance.import.files')}</button>
  <button disabled={busy} onClick={()=>void run('folder')}><FolderPlus size={16}/>{t('fusion.enhance.import.folder')}</button>
  <button disabled={busy} onClick={()=>void run('rescan')}><RefreshCw size={16}/>{t('fusion.enhance.import.rescan')}</button>
  {busy&&<button onClick={()=>void window.api.fusionLocalImportCancel(request.current)}><X size={16}/>{t('fusion.toolbox.cancel')}</button>}
 </div></div>;
 const feedback=<div className="float-import-feedback">{(busy||done)&&<small>{t(busy?'fusion.enhance.import.scanning':'fusion.enhance.import.done',{count})}</small>}<ToolError error={error}/></div>;
 return {controls,feedback,run,busy,onDrop:drop,onDragOver:(event:DragEvent)=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.stopPropagation();}}};
}
