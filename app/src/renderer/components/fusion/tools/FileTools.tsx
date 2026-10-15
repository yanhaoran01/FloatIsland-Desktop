/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file FileTools.tsx @description User-selected files, rename previews and cancellable ZIP jobs. @author 鸡哥 */
import { useEffect,useRef,useState,type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import {FolderArchive,FilePlus2} from 'lucide-react';
import type { GrantedFile,RenameOptions,RenamePreview,FileJobState,ArchiveEntry } from '../../../../preload/types/fusionFileTools';
import {ProductHistory} from './UnifiedTools';
import {useProductStore} from '../productStore';
import { ToolBody,ToolResult,ToolTabs,ToolCommands } from './ToolControls';
/** Previews every change before asking the main process to execute it. */
export function RenameTool():JSX.Element {
 const {t}=useTranslation(),[files,setFiles]=useState<GrantedFile[]>([]),[options,setOptions]=useState<RenameOptions>({prefix:'',suffix:'',find:'',replace:'',numbered:false,start:1,digits:3}),[preview,setPreview]=useState<RenamePreview>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const product=useProductStore();
 useEffect(()=>{if(product.target==='rename'&&product.inputs.length){setFiles(product.inputs);setPreview(undefined);}},[product.nonce]);
 const run=async(action:'choose'|'preview'|'execute'|'undo'):Promise<void>=>{
  setBusy(true);setError('');setStatus('');
  try{
   if(action==='choose'){setFiles(await window.api.fusionFilesSelect('files'));setPreview(undefined);}
   else if(action==='preview')setPreview(await window.api.fusionRenamePreview(files.map(file=>file.id),options));
   else{const result=action==='undo'?await window.api.fusionRenameUndo():await window.api.fusionRenameExecute(preview!.id);if(!result.ok)throw Error(result.rollbackErrors?.join('\n')||'rename-failed');setStatus(t('fusion.utilities.done'));setPreview(undefined);setFiles(old=>old.map(file=>{const entry=result.entries?.find(item=>item.id===file.id);return {...file,name:entry?(action==='execute'?entry.after:entry.before):file.name};}));}
  }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}
 };
 const change=(patch:Partial<RenameOptions>):void=>{setOptions({...options,...patch});setPreview(undefined);setStatus('');};
 return <ToolBody busy={busy} error={error}><ToolCommands><button disabled={busy} onClick={()=>void run('choose')}>{t('fusion.utilities.chooseFiles')}</button><button disabled={busy} onClick={()=>void run('undo')}>{t('fusion.utilities.undo')}</button></ToolCommands>
 <div className="fusion-tool-columns">{(['prefix','suffix','find','replace'] as const).map(key=><label key={key}>{t('fusion.utilities.'+key)}<input value={options[key]} maxLength={240} onChange={e=>change({[key]:e.target.value})}/></label>)}</div>
 <label><input type="checkbox" checked={options.numbered} onChange={e=>change({numbered:e.target.checked})}/>{t('fusion.utilities.numbered')}</label>
 {options.numbered&&<div className="fusion-tool-columns"><label>{t('fusion.utilities.startNumber')}<input type="number" min={0} value={options.start} onChange={e=>change({start:Number(e.target.value)})}/></label><label>{t('fusion.utilities.digits')}<input type="number" min={1} max={8} value={options.digits} onChange={e=>change({digits:Number(e.target.value)})}/></label></div>}
 {!!files.length&&<ToolCommands><button disabled={busy} onClick={()=>void run('preview')}>{t('fusion.utilities.preview')}</button>{preview&&<button disabled={busy||preview.entries.some(entry=>entry.error)} onClick={()=>void run('execute')}>{t('fusion.utilities.execute')}</button>}</ToolCommands>}
 {preview?<div className="fusion-data-preview"><table><tbody>{preview.entries.map(entry=><tr key={entry.id}><td>{entry.before}</td><td>→</td><td>{entry.after}</td><td>{entry.error?t('fusion.toolbox.errors.'+entry.error):''}</td></tr>)}</tbody></table></div>:<div className="fusion-file-list">{files.map(file=><span key={file.id}>{file.name}</span>)}</div>}
 {status&&<output role="status">{status}</output>}</ToolBody>;
}
/** Compresses or extracts only main-process file grants, with actual progress. */
export function ZipTool():JSX.Element {
 const {t}=useTranslation(),[mode,setMode]=useState<'pack'|'extract'>('pack'),[files,setFiles]=useState<GrantedFile[]>([]),[entries,setEntries]=useState<ArchiveEntry[]>([]),[selected,setSelected]=useState<string[]>([]),[job,setJob]=useState<FileJobState>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const product=useProductStore();
 useEffect(()=>{if(product.target==='zip'&&product.inputs.length){setFiles(product.inputs);if(product.inputs[0].kind==='archive'){setMode('extract');void window.api.fusionArchiveList(product.inputs[0].id).then(list=>{setEntries(list);setSelected(list.map(item=>item.name));}).catch(reason=>setError(String(reason)));}else setMode('pack');}},[product.nonce]);
 const [tab,setTab]=useState('organize');
 const running=useRef<string | undefined>(undefined),starting=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;const off=window.api.onFusionFileJob(value=>{if(!alive.current||!starting.current&&running.current!==value.id)return;running.current=value.id;setJob(value);});return()=>{alive.current=false;off();if(running.current)void window.api.fusionFileJobCancel(running.current);};},[]);
 const choose=async():Promise<void>=>{setBusy(true);setError('');setJob(undefined);try{const picked=await window.api.fusionFilesSelect(mode==='pack'?'files':'zip');setFiles(picked);setEntries([]);setSelected([]);if(mode==='extract'&&picked.length){const list=await window.api.fusionArchiveList(picked[0].id);setEntries(list);setSelected(list.map(entry=>entry.name));}}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}};
 const start=async():Promise<void>=>{setBusy(true);setError('');starting.current=true;setJob(undefined);try{const id=await window.api.fusionArchiveStart(mode,files.map(file=>file.id),selected);if(id){running.current=id;setJob(old=>old?.id===id?old:{id,state:'running',progress:0});}}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{starting.current=false;setBusy(false);}};
 const working=busy||job?.state==='running';
 return <><ToolTabs>{['organize','history'].map(key=><button key={key} aria-pressed={key===tab} onClick={()=>setTab(key)}>{t('fusion.product.tabs.'+key)}</button>)}</ToolTabs><div hidden={tab!=='organize'}><ToolBody busy={working} error={error||job?.error||''} cancel={job?.state==='running'?()=>void window.api.fusionFileJobCancel(job.id):undefined}>
 <div className="fusion-tool-actions"><select aria-label={t('fusion.utilities.mode')} disabled={working} value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setFiles([]);setEntries([]);setSelected([]);setJob(undefined);}}><option value="pack">{t('fusion.utilities.pack')}</option><option value="extract">{t('fusion.utilities.extract')}</option></select><button disabled={working} onClick={()=>void choose()}>{t('fusion.utilities.chooseFiles')}</button><button disabled={working||!files.length||mode==='extract'&&!selected.length} onClick={()=>void start()}>{t('fusion.utilities.execute')}</button></div>
 {!files.length&&<button className="float-file-drop" disabled={working} onClick={()=>void choose()}><FolderArchive size={32} strokeWidth={1.4}/><strong>{t('fusion.ui.archiveInput')}</strong><span><FilePlus2 size={14}/>{t('fusion.utilities.chooseFiles')}</span></button>}
 {mode==='extract'?<div className="fusion-file-list">{entries.map(entry=><label key={entry.name}><input type="checkbox" disabled={working} checked={selected.includes(entry.name)} onChange={e=>setSelected(old=>e.target.checked?[...old,entry.name]:old.filter(name=>name!==entry.name))}/>{entry.name} <small>{entry.size}</small></label>)}</div>:<div className="fusion-file-list">{files.map(file=><span key={file.id}>{file.name}</span>)}</div>}
 {job&&<progress max={1} value={job.progress} aria-label={t('fusion.utilities.progress')}/>}
 {job?.state==='done'&&job.output&&<ToolResult text={job.output}/>}
 </ToolBody></div>{tab==='history'&&<ProductHistory kind="zip"/>}</>;
}
