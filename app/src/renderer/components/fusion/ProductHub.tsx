/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file ProductHub.tsx @description Shared native drop entry and accessible command search. @author 鸡哥 */
import { useEffect,useRef,useState,type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import { Command } from 'cmdk';
import { X,Search,Eye,Image,Files,Archive,Clipboard,Globe,Share2,Download,Star } from 'lucide-react';
import {MoveProgress} from './tools/ManagedLibraryPanel';
import type {LibraryMoveJob} from '../../../preload/types/managedLibrary';
import {useLibrary} from './libraryState';
import type {LibrarySearchResult} from '../../../preload/types/fusionLibrary';
import { useProductStore,openProductTool } from './productStore';
import { TOOL_REGISTRY,TOOL_FUNCTIONS,resolveToolTarget } from './tools/toolRegistry';
import useIslandStore from '../../store/slices';
import './product.css';
/** Keeps drop and search available independently of the active page. @param children - Existing window content. @returns Window content with lightweight overlays. */
export function ProductHub({children}:{children:ReactNode}) {
 const [move,setMove]=useState<LibraryMoveJob|null>(null);
 useEffect(()=>window.api.onFusionLibraryMove(setMove),[]);
 const library=useLibrary(),[libraryResults,setLibraryResults]=useState<LibrarySearchResult[]>([]);
 const {t}=useTranslation(),state=useProductStore(),[error,setError]=useState(''),[apps,setApps]=useState<Array<{id:string;name:string;path:string}>>([]);
 const focusBeforeSearch=useRef<HTMLElement|null>(null);
 useEffect(()=>{if(state.searchOpen)focusBeforeSearch.current=document.activeElement instanceof HTMLElement?document.activeElement:null;else focusBeforeSearch.current?.focus({preventScroll:true});},[state.searchOpen]);
 const zone=useDropzone({noClick:true,noKeyboard:true});
 useEffect(()=>{
  if(!location.pathname.endsWith('/DynamicIslandIndex.html'))return;
  let active=true;
  const receive=(value:import('../../../shared/onboarding').OnboardingState):void=>{if(active&&value.status==='pending')useIslandStore.getState().setGuide();};
  void window.api.fusionOnboardingGet().then(receive).catch(reason=>setError(String(reason)));
  const off=window.api.onFusionOnboarding(receive);return()=>{active=false;off();};
 },[]);
 useEffect(()=>{
  const stopJob=window.api.onFusionProductJob(job=>useProductStore.getState().job(job));
  const stopRecord=window.api.onFusionProductRecord(record=>useProductStore.getState().set({record}));
  const search=():void=>{useIslandStore.getState().setMaxExpand();useProductStore.getState().set({searchOpen:true});};
  const stopSearch=window.api.onFusionProductSearch(search);window.addEventListener('fusion-product-search',search);
  void window.api.fusionProductData().then(data=>useProductStore.getState().set({data})).catch(reason=>setError(String(reason)));
  void window.api.fusionProductRecordState().then(record=>useProductStore.getState().set({record})).catch(()=>undefined);
  return ()=>{stopJob();stopRecord();stopSearch();window.removeEventListener('fusion-product-search',search);};
 },[]);
 useEffect(()=>{if(state.searchOpen)void Promise.all([window.api.fusionProductSearchApps(),window.api.fusionProductData()]).then(([items,data])=>{setApps(items);state.set({data});}).catch(reason=>setError(String(reason)));},[state.searchOpen]);
 const query=state.query,setQuery=(query:string):void=>state.set({query,searchSelection:''});
 useEffect(()=>{let alive=true;const requestId=crypto.randomUUID(),timer=setTimeout(()=>{if(state.searchOpen)void window.api.fusionLibrarySearch(query,requestId).then(results=>{if(alive)setLibraryResults(results);}).catch(reason=>{if(alive)setError(String(reason));});},160);return()=>{alive=false;clearTimeout(timer);};},[state.searchOpen,query,library.data.revision]);
 const close=():void=>state.set({dropOpen:false,searchOpen:false});
 const actions=[{id:'preview',icon:Eye},{id:state.inputs[0]?.kind==='pdf'?'pdf':'image',icon:state.inputs[0]?.kind==='pdf'?Files:Image},{id:'zip',icon:Archive},{id:'sharing',icon:Share2},{id:'clipboard',icon:Clipboard},{id:'qr',icon:Globe}];
 return <div {...zone.getRootProps({className:'fusion-product-root',onDrop:event=>{if((event.target as Element).closest('input,textarea,[contenteditable=true]')){event.stopPropagation();return;}event.preventDefault();event.stopPropagation();const files=Array.from(event.dataTransfer.files);void (async()=>{setError('');if(files.length){try{setMove(await window.api.fusionLibraryIngest(files,'Inbox'));}catch(reason){if(!String(reason).includes('file-not-authorized'))throw reason;for(const file of files)await window.api.fusionLibrarySaveBlob(new Uint8Array(await file.arrayBuffer()),file.name||'image-'+Date.now()+'.png','Inbox');}return;}const value=event.dataTransfer.getData('text/uri-list').split('\n').find(line=>line&&!line.startsWith('#'))||event.dataTransfer.getData('text/plain');if(value){if(/^https?:\/\//i.test(value.trim()))await window.api.fusionLibraryWrite({type:'url',url:value.trim()});else await window.api.fusionLibrarySaveBlob(new TextEncoder().encode(value),'note-'+Date.now()+'.txt','Inbox');}})().catch(reason=>setError(String(reason)));}})}>
  <input {...zone.getInputProps()} />
  {children}
  {(move||error)&&<div className="float-drop-status" onWheel={event=>event.stopPropagation()}>{move&&<MoveProgress job={move}/>} {move?.entries.filter(entry=>entry.error).map(entry=><p role="alert" key={entry.source}>{entry.error}</p>)}{error&&<p role="alert">{error}</p>}<button aria-label={t('fusion.product.close')} onClick={()=>{setMove(null);setError('');}}><X size={16}/></button></div>}
  {zone.isDragActive&&<div className="fusion-product-drag" aria-label={t('fusion.product.drop')}><Clipboard size={30}/></div>}
  {(state.dropOpen||state.searchOpen)&&<div className="fusion-product-overlay" onClick={close} onWheel={event=>event.stopPropagation()} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape')close();}}>
   <section className="fusion-product-dialog" role="dialog" aria-modal="true" aria-label={t(state.searchOpen?'fusion.product.search':'fusion.product.drop')} onClick={event=>event.stopPropagation()}>
    <button className="fusion-product-close fusion-icon-button" aria-label={t('fusion.product.close')} onClick={close}><X size={16}/></button>
    {state.dropOpen?<><div className="fusion-product-inputs">{state.inputs.map(item=><span key={item.id}>{item.name}</span>)}</div><div className="fusion-product-drop-actions">
     <button onClick={()=>{void (async()=>{if(state.inputs.every(x=>x.kind==='text')){const result=await window.api.fusionProductRead(state.inputs[0].id),text=new TextDecoder().decode(result.bytes).trim();if(/^https?:\/\//i.test(text)){await window.api.fusionLibraryWrite({type:'url',url:text});openProductTool('collections',[]);return;}}await window.api.fusionLibraryCollect(state.inputs.map(x=>x.id));openProductTool('collections',[]);})().catch(reason=>setError(String(reason)));}}><Star size={20} strokeWidth={1.6}/>{t('fusion.toolbox.items.collections')}</button>
     {actions.filter(item=>item.id!=='image'||state.inputs[0]?.kind==='image').map(item=><button key={item.id} onClick={()=>{if(item.id==='clipboard'){void window.api.fusionProductRun('copy',state.inputs.map(input=>input.id),{}).then(job=>{state.job(job);close();}).catch(reason=>setError(String(reason)));}else openProductTool(item.id);}}><item.icon size={20} strokeWidth={1.6}/>{t('fusion.toolbox.items.'+item.id)}</button>)}
     {state.inputs[0]?.kind==='text'&&<button onClick={()=>openProductTool('download',state.inputs,'media')}><Download size={20} strokeWidth={1.6}/>{t('fusion.toolbox.items.download')}</button>}
     {state.inputs[0]?.kind==='text'&&<button onClick={async()=>{try{const result=await window.api.fusionProductRead(state.inputs[0].id),value=new TextDecoder().decode(result.bytes);if(/^https?:\/\//i.test(value.trim())){await window.api.fusionWebNavigate('browser',value.trim());openProductTool('browser');}else openProductTool('text');}catch(reason){setError(String(reason));}}}><Globe size={20}/>{t('fusion.product.openText')}</button>}
    </div></>:<Command label={t('fusion.product.search')} shouldFilter={false} value={state.searchSelection} onValueChange={searchSelection=>state.set({searchSelection})}>
     <div className="fusion-product-search"><Search size={16}/><Command.Input autoFocus value={query} onValueChange={setQuery} placeholder={t('fusion.product.search')}/></div>
     <Command.List><Command.Empty>{t('fusion.toolbox.noResults')}</Command.Empty>
      <Command.Group heading={t('fusion.product.tools')}>{TOOL_REGISTRY.filter(item=>[t(item.label),item.keywords].join(' ').toLowerCase().includes(query.toLowerCase())).map(item=><Command.Item key={item.id} value={item.id} onSelect={()=>openProductTool(resolveToolTarget(item.id).id)}><item.icon size={18}/>{t(item.label)}</Command.Item>)}{query.trim()&&Object.entries(TOOL_FUNCTIONS).flatMap(([id,functions])=>functions.filter(fn=>[t(fn.label),fn.id].join(' ').toLowerCase().includes(query.toLowerCase())).map(fn=><Command.Item key={id+':'+fn.id} value={id+':'+fn.id} onSelect={()=>openProductTool(id,state.inputs,fn.id)}>{t(TOOL_REGISTRY.find(tool=>tool.id===id)!.label)} · {t(fn.label)}</Command.Item>))}</Command.Group>
      <Command.Group heading={t('fusion.product.apps')}>{apps.filter(item=>item.name.toLowerCase().includes(query.toLowerCase())).map(item=><Command.Item key={item.id} value={'app-'+item.id} onSelect={()=>{setError('');void window.api.fusionProductLaunch(item.path).then(close).catch(reason=>setError(String(reason)));}}>{item.name}</Command.Item>)}</Command.Group>
      <Command.Group heading={t('fusion.product.flows')}>{state.data?.flows.filter(item=>(item.name.startsWith('@')?t('fusion.product.preset.'+item.name.slice(1)):item.name).toLowerCase().includes(query.toLowerCase())).map(item=><Command.Item key={item.id} value={item.id} onSelect={()=>openProductTool('workflows',state.inputs,item.id)}>{item.name.startsWith('@')?t('fusion.product.preset.'+item.name.slice(1)):item.name}</Command.Item>)}</Command.Group>
      <Command.Group heading={t('fusion.toolbox.items.collections')}>{libraryResults.map(item=><Command.Item key={item.id} value={'library-'+item.id} onSelect={()=>{if(!item.scopeId)openProductTool('collections',[],'item:'+item.id);else if(item.kind==='folder')void window.api.fusionLibraryOpen([item.id],'open').then(results=>{if(results[0]?.error)throw Error(results[0].error);close();}).catch(reason=>setError(String(reason)));else void window.api.fusionLibraryArtifact(item.id).then(artifact=>openProductTool('preview',[artifact])).catch(reason=>setError(String(reason)));}}><Star size={18}/><span>{item.title}</span></Command.Item>)}</Command.Group>
      <Command.Group heading={t('fusion.library.tabs.workspaces')}>{library.data.workspaces.filter(item=>item.title.toLowerCase().includes(query.toLowerCase())).map(item=><Command.Item key={item.id} value={'workspace-'+item.id} onSelect={()=>openProductTool('collections',[],'workspace:'+item.id)}>{item.title}</Command.Item>)}</Command.Group>
      <Command.Group heading={t('fusion.library.templates')}>{library.data.templates.filter(item=>[item.title,item.group,item.text].join(' ').toLowerCase().includes(query.toLowerCase())).map(item=><Command.Item key={item.id} value={'template-'+item.id} onSelect={()=>openProductTool('clipboard',[],'templates:'+item.id)}>{item.title||t('fusion.library.untitled')}</Command.Item>)}</Command.Group>
      <Command.Group heading={t('fusion.library.tabs.feeds')}>{library.data.entries.filter(item=>item.title.toLowerCase().includes(query.toLowerCase())).slice(0,30).map(item=><Command.Item key={item.id} value={'feed-'+item.id} onSelect={()=>openProductTool('collections',[],'feeds')}>{item.title}</Command.Item>)}</Command.Group>
     </Command.List>
    </Command>}
    {error&&<p role="alert" className="fusion-inline-error">{error}</p>}
   </section>
  </div>}
 </div>;
}
