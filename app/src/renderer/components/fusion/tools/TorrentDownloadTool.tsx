/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file TorrentDownloadTool.tsx @description Visible BT metadata preview, tree selection and owned staging. @author 鸡哥 */
import {useEffect,useState} from 'react';
import {create} from 'zustand';
import {useTranslation} from 'react-i18next';
import {Download,FilePlus2,FolderOpen,Search,X} from 'lucide-react';
import type {TorrentDraft,TorrentFile} from '../../../../preload/types/download';
import {ToolBody} from './ToolControls';
import {formatBytes} from '../../states/maxExpand/components/tools/utils/downloadFormatters';
import {useProductStore} from '../productStore';
interface State {file:File|null;url:string;draft:TorrentDraft|null;selected:number[];request:string;directory:{id:string;path:string}|null;set:(value:Partial<State>)=>void;}
const useDraft=create<State>(set=>({file:null,url:'',draft:null,selected:[],request:'',directory:null,set:patch=>set(patch)}));
/** Hands an actual native drop to the existing metadata preview. */
export function prepareTorrentInput(file?:File,url?:string):void{useDraft.getState().set({file:file||null,...(url?{url}:{})});}
interface Tree {name:string;files:TorrentFile[];children:Map<string,Tree>;}
function tree(files:TorrentFile[]):Tree {const root:Tree={name:'',files:[],children:new Map()};for(const file of files){let node=root;const parts=file.path.replace(/\\/g,'/').split('/');for(const name of parts.slice(0,-1)){if(!node.children.has(name))node.children.set(name,{name,files:[],children:new Map()});node=node.children.get(name)!;}node.files.push(file);}return root;}
function descendants(node:Tree):TorrentFile[]{return [...node.files,...[...node.children.values()].flatMap(descendants)];}
function FileTree({node,selected,choose}:{node:Tree;selected:number[];choose:(indices:number[],enabled:boolean)=>void}){const files=descendants(node),checked=files.every(file=>selected.includes(file.index));return <>{node.name&&<label className="float-torrent-folder"><input type="checkbox" checked={checked} ref={input=>{if(input)input.indeterminate=!checked&&files.some(file=>selected.includes(file.index));}} onChange={event=>choose(files.map(file=>file.index),event.target.checked)}/><FolderOpen size={15}/>{node.name}</label>}<div className={node.name?'float-torrent-children':''}>{[...node.children.values()].map(child=><FileTree key={child.name} node={child} selected={selected} choose={choose}/>)}{node.files.map(file=><label className="float-torrent-file" key={file.index}><input type="checkbox" checked={selected.includes(file.index)} onChange={event=>choose([file.index],event.target.checked)}/><span title={file.path}>{file.path.split(/[\\/]/).at(-1)}</span><small>{formatBytes(file.size)}</small></label>)}</div></>;}
/** Obtains real metadata and starts selected files through the common task page. */
export function TorrentDownloadTool({onStarted}:{onStarted:()=>void}) {
 const {t}=useTranslation(),draft=useDraft(),product=useProductStore(),[error,setError]=useState(''),[starting,setStarting]=useState(false);
 useEffect(()=>()=>{const value=useDraft.getState();if(value.request){void window.api.downloadTorrentCancel(value.request).catch(()=>{});value.set({request:''});}},[]);
 useEffect(()=>{if(product.target==='download'&&product.tab==='torrent'&&product.inputs[0]?.kind==='text')void window.api.fusionProductRead(product.inputs[0].id).then(value=>draft.set({url:new TextDecoder().decode(value.bytes)})).catch(reason=>setError(String(reason)));},[product.nonce]);
 const inspect=async(file?:File,magnet=false)=>{if(draft.request||starting)return;setError('');const request=crypto.randomUUID();draft.set({request});try{if(draft.draft){await window.api.downloadTorrentCancel(draft.draft.id);draft.set({draft:null,selected:[]});}const value=await window.api.downloadTorrentInspect(request,magnet?draft.url:undefined,file);if(useDraft.getState().request!==request){if(value)await window.api.downloadTorrentCancel(value.id);return;}draft.set({draft:value,selected:value?.files.map(file=>file.index)||[]});}catch(reason){if(useDraft.getState().request===request)setError(String(reason));}finally{if(useDraft.getState().request===request)draft.set({request:''});}};
 useEffect(()=>{if(draft.file&&!draft.request){const file=draft.file;draft.set({file:null});void inspect(file);}},[draft.file]);
 const cancel=async()=>{const id=draft.request;draft.set({request:''});try{await window.api.downloadTorrentCancel(id);}catch(reason){setError(String(reason));}};
 const choose=(indices:number[],enabled:boolean)=>draft.set({selected:enabled?[...new Set([...draft.selected,...indices])]:draft.selected.filter(index=>!indices.includes(index))});
 const start=async()=>{if(!draft.draft||starting)return;setStarting(true);setError('');try{await window.api.downloadTorrentStart(draft.draft.id,draft.selected,draft.directory?.id);draft.set({draft:null,selected:[]});onStarted();}catch(reason){setError(String(reason));}finally{setStarting(false);}};
 const total=draft.draft?.files.filter(file=>draft.selected.includes(file.index)).reduce((size,file)=>size+file.size,0)||0;
 return <ToolBody className="float-torrent-workspace" error={error}><div className="float-torrent-drop" onDragOver={event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.stopPropagation();}}} onDrop={event=>{event.preventDefault();event.stopPropagation();const file=Array.from(event.dataTransfer.files).find(file=>file.name.toLowerCase().endsWith('.torrent'));if(file)void inspect(file);else setError('bt-invalid-source');}}>
  
  <textarea aria-label={t('fusion.enhance.bt.magnet')} placeholder={t('fusion.enhance.bt.placeholder')} value={draft.url} onChange={event=>draft.set({url:event.target.value})}/>
  <div className="fusion-tool-actions"><button disabled={Boolean(draft.request)||starting} onClick={()=>void inspect()}><FilePlus2 size={16}/>{t('fusion.enhance.bt.import')}</button><button disabled={!draft.url.trim()||Boolean(draft.request)||starting} onClick={()=>void inspect(undefined,true)}><Search size={16}/>{t('fusion.enhance.bt.inspect')}</button>{draft.request&&<button onClick={()=>void cancel()}><X size={16}/>{t('fusion.toolbox.cancel')}</button>}</div>
  {draft.request&&<div role="status"><progress/>{t('fusion.enhance.bt.metadata')}</div>}
  {draft.draft&&<section className="float-torrent-preview"><strong>{draft.draft.name}</strong><small>{draft.draft.files.length} · {formatBytes(total)}</small><div className="float-torrent-tree"><FileTree node={tree(draft.draft.files)} selected={draft.selected} choose={choose}/></div></section>}
  {!draft.draft&&!draft.request&&<div className="float-download-empty"><FolderOpen size={32} strokeWidth={1.4}/><span>{t('fusion.ui.torrentPreviewHint')}</span></div>}
  <div className="float-torrent-footer"><button onClick={()=>{void window.api.downloadPickDirectory().then(directory=>{if(directory)draft.set({directory});}).catch(reason=>setError(String(reason)));}}><FolderOpen size={16}/>{t('fusion.download.directory')}</button><span className="fusion-product-status" title={draft.directory?.path}>{draft.directory?.path||t('fusion.download.defaultDirectory')}</span><button className="fusion-tool-primary" disabled={!draft.draft||!draft.selected.length||starting} onClick={()=>void start()}><Download size={16}/>{t('fusion.enhance.bt.start')}</button></div>
  <small>{t('fusion.enhance.bt.noSeed')}</small>
 </div></ToolBody>;
}
