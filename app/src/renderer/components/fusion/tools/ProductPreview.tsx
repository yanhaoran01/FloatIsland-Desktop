/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file ProductPreview.tsx @description Local PDF pages, text, image and archive previews using shared artifacts. @author 鸡哥 */
import {DocumentReader,isDocument} from './DocumentReader';
import { useEffect,useMemo,useRef,useState } from 'react';
import { Document,Page,pdfjs } from 'react-pdf';
import { useTranslation } from 'react-i18next';
import { useProductStore,openProductTool } from '../productStore';
import type { ProductArtifact } from '../../../../preload/types/fusionProduct';
import { ToolBody,ToolCommands,ToolResult } from './ToolControls';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parsePdfPages } from './utilityOperations';
import {useContentWidth} from '../useContentWidth';
import { FilePlus2, Files } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
const pdfOptions={cMapUrl:new URL('pdf/cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('pdf/standard_fonts/',location.href).href,wasmUrl:new URL('pdf/wasm/',location.href).href};
/** Shows shared inputs and visual PDF page selection. @param artifact - Optional embedded input. @returns Preview panel. */
export function ProductPreview({artifact,showActions=true}:{artifact?:ProductArtifact;showActions?:boolean}={}) {
 const {t}=useTranslation(),store=useProductStore(),[selected,setSelected]=useState(''),[url,setUrl]=useState(''),[text,setText]=useState(''),[error,setError]=useState(''),[count,setCount]=useState(0),[pages,setPages]=useState<number[]>([]),[pageDraft,setPageDraft]=useState(''),[page,setPage]=useState(1),[entries,setEntries]=useState<Array<{name:string;size:number}>>([]),[encoding,setEncoding]=useState('utf-8');
 const item=artifact??store.inputs.find(x=>x.id===selected)??store.inputs[0];
 const generation=useRef(0),canvas=useContentWidth<HTMLDivElement>();
 useEffect(()=>{let alive=true,object='';generation.current++;setError('');setUrl('');setText('');setCount(0);setPages([]);setPageDraft('');setEntries([]);setActiveJob('');if(!item)return;
  void window.api.fusionProductRead(item.id).then(result=>{if(!alive)return;object=URL.createObjectURL(new Blob([new Uint8Array(result.bytes).buffer],{type:item.mime}));setUrl(object);if(['text','table'].includes(item.kind))setText(new TextDecoder(encoding).decode(result.bytes));if(item.kind==='archive')void window.api.fusionArchiveList(item.id).then(value=>{if(alive)setEntries(value);}).catch(reason=>{if(alive)setError(String(reason));});}).catch(reason=>{if(alive)setError(String(reason));});
  return ()=>{alive=false;if(object)URL.revokeObjectURL(object);};
 },[item?.id,encoding]);
 const file=useMemo(()=>url||null,[url]);
 const [thumbStart,setThumbStart]=useState(0),[table,setTable]=useState<string[][]>([]),[activeJob,setActiveJob]=useState('');
 const active=store.jobs[activeJob];
 useEffect(()=>{let alive=true;setTable([]);if(!item||item.kind!=='table')return;
  void window.api.fusionProductRun('csv',[item.id],{mode:'csv-json',encoding}).then(job=>{store.job(job);if(alive)setActiveJob(job.id);}).catch(reason=>{if(alive)setError(String(reason));});return()=>{alive=false;};
 },[item?.id,encoding]);
 useEffect(()=>{let alive=true;if(item?.kind==='table'&&active?.state==='done'&&active.result[0])void window.api.fusionProductRead(active.result[0].id).then(result=>{const value:unknown=JSON.parse(new TextDecoder().decode(result.bytes));if(alive&&Array.isArray(value)&&value.every(row=>row&&typeof row==='object'&&!Array.isArray(row))){const keys=Object.keys(value[0]??{});setTable([keys,...value.slice(0,100).map(row=>keys.map(key=>String(row[key]??'')))]);}}).catch(reason=>{if(alive)setError(String(reason));});return()=>{alive=false;};
 },[active?.state,item?.id]);
 const pick=async():Promise<void>=>{try{store.set({inputs:await window.api.fusionProductPick()});}catch(reason){setError(String(reason));}};
 const run=async():Promise<void>=>{if(!item)return;const token=generation.current;try{setError('');parsePdfPages(pageDraft,count);const job=await window.api.fusionProductRun('pdf',[item.id],{mode:'extract',pages:pageDraft});store.job(job);if(token===generation.current)setActiveJob(job.id);}catch(reason){if(token===generation.current)setError(String(reason));}};
 if(item&&isDocument(item.name)&&!['pdf','text'].includes(item.kind))return <DocumentReader artifact={item}/>;
 return <ToolBody error={error||active?.error||''} busy={active?.state==='running'} cancel={()=>{if(activeJob)void window.api.fusionProductJob(activeJob,'cancel').catch(reason=>setError(String(reason)));}}>
  {!artifact&&item&&<ToolCommands><button onClick={()=>void pick()}>{t('fusion.toolbox.chooseFiles')}</button>{store.inputs.length>1&&<select value={item?.id??''} onChange={event=>setSelected(event.target.value)}>{store.inputs.map(input=><option key={input.id} value={input.id}>{input.name}</option>)}</select>}</ToolCommands>}
  {!item&&<div className="float-preview-empty"><Files size={30} strokeWidth={1.5} aria-hidden="true"/><p>{t('fusion.ui.previewEmpty')}</p><button onClick={()=>void pick()}><FilePlus2 size={16}/>{t('fusion.toolbox.chooseFiles')}</button></div>}
  {showActions&&item&&<ToolCommands><button onClick={()=>void window.api.fusionProductSave(item.id).catch(reason=>setError(String(reason)))}>{t('fusion.product.save')}</button><button onClick={()=>void window.api.fusionProductOpen(item.id).catch(reason=>setError(String(reason)))}>{t('fusion.product.external')}</button>{item.kind==='image'&&<><button onClick={()=>openProductTool('image',[item])}>{t('fusion.toolbox.items.image')}</button><button onClick={()=>void window.api.fusionProductPin(item.id).catch(reason=>setError(String(reason)))}>{t('fusion.product.pin')}</button></>}</ToolCommands>}
  {item?.kind==='image'&&url&&<img className="fusion-product-preview-image" src={url} alt={item.name}/>}
  {item?.kind==='pdf'&&file&&<Document key={item.id} className="fusion-product-pdf" file={file} options={pdfOptions} onLoadSuccess={value=>{setCount(value.numPages);setPage(1);setThumbStart(0);}} onLoadError={reason=>setError(reason.message)}>
   <aside className="fusion-product-thumbs" onScroll={event=>setThumbStart(Math.max(0,Math.floor(event.currentTarget.scrollTop/144)-1))}><div style={{height:count*144,position:'relative'}}>{Array.from({length:Math.min(6,count-thumbStart)},(_,index)=>{const i=thumbStart+index;return <button key={i} style={{position:'absolute',top:i*144}} className={pages.includes(i+1)?'is-selected':''} onClick={()=>{setPage(i+1);const next=pages.includes(i+1)?pages.filter(x=>x!==i+1):[...pages,i+1];setPages(next);setPageDraft(next.join(','));}} aria-label={t('fusion.toolbox.page',{page:i+1})}><Page pageNumber={i+1} width={84} renderAnnotationLayer={false} renderTextLayer={false}/><span>{i+1}</span></button>;})}</div></aside>
   <div ref={canvas.ref} className="fusion-product-pdf-page"><Page pageNumber={page} width={Math.max(100,canvas.width||300)}/></div>
  </Document>}
  {item?.kind==='pdf'&&<div className="fusion-tool-actions"><input aria-label={t('fusion.product.options.pages')} value={pageDraft} onChange={event=>{setPageDraft(event.target.value);try{setPages(event.target.value.trim()?parsePdfPages(event.target.value,count).map(index=>index+1):[]);}catch{setPages([]);}}}/><button disabled={!pageDraft.trim()||!count||active?.state==='running'} onClick={()=>void run()}>{t('fusion.toolbox.pdfModes.extract')}</button>{active?.state==='done'&&active.result.filter(result=>result.kind==='pdf').map(result=><button key={result.id} onClick={()=>void window.api.fusionProductSave(result.id).catch(reason=>setError(String(reason)))}>{t('fusion.product.save')}</button>)}</div>}
  {item&&['text','table'].includes(item.kind)&&<><select aria-label={t('fusion.product.encoding')} value={encoding} onChange={event=>setEncoding(event.target.value)}><option value="utf-8">UTF-8</option><option value="gb18030">GB18030</option></select>{item.mime==='text/markdown'?<div className="fusion-product-text"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>:table.length?<div className="fusion-data-preview"><table><tbody>{table.map((row,index)=><tr key={index}>{row.map((cell,column)=><td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>:<ToolResult text={text} filename={item.name}/>}</>}
  {item?.kind==='archive'&&<div className="fusion-product-text">{entries.map(entry=><div key={entry.name}>{entry.name} · {entry.size}</div>)}</div>}
  {item?.kind==='file'&&<p>{t('fusion.reader.systemOnly')}</p>}
  {item?.kind==='media'&&<button onClick={()=>{void window.api.fusionProductPlay(item.id).then(()=>openProductTool('video')).catch(reason=>setError(String(reason)));}}>{t('fusion.product.player')}</button>}
 </ToolBody>;
}
