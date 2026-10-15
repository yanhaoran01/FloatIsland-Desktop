/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file UnifiedTools.tsx @description Canonical tool pages share processing and retain their original histories. @author 鸡哥 */
import {DownloadStartTool} from './DownloadStartTool';
import {TorrentDownloadTool} from './TorrentDownloadTool';
import { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductAction,ProductOptions } from '../../../../preload/types/fusionProduct';
import { useProductStore } from '../productStore';
import {WebTool} from './WebTool';
import {DateTool} from './ExtraTools';
import {ProductRecorder} from './ProductRecorder';
import {CountdownTab} from '../../states/maxExpand/components/countdown/components/CountdownTab';
import { ImageTool } from './ImageTool';
import { PdfTool } from './TextPdfTools';
import { ProductPreview } from './ProductPreview';
import { ToolBody, ToolTabs,ToolModes } from './ToolControls';
import {LegacyTools} from './LegacyTools';
import {UrlTool,StopwatchTool} from './DailyTools';
import {FusionTimerPanel} from '../FusionTimerPanel';
import {CsvTool,RegexTool} from './DataTools';
import {JsonWorkbench,Base64Workbench} from './EncodingWorkbench';
import {TextTool} from './TextPdfTools';
import { FileCompressionToolSection } from '../../states/maxExpand/components/tools/components/FileCompressionToolSection';
import { MediaDownloadTool, UnifiedDownloadHistory } from './MediaDownloadTool';
import { SoftwareToolSection } from '../../states/maxExpand/components/tools/components/SoftwareToolSection';
import { ToolsTab } from '../../states/expand/components/ToolsTab';
import { ProductFlows } from './ProductFlows';
import {FocusPanel} from './DailyLibraryTools';
import {IndependentTimers} from './IndependentTimers';
/** Invokes shared main-process processors and shows actual results. @param action - Capability. @param defaults - Options. @returns Tool panel. */
export function ProductActionPanel({action,defaults}:{action:ProductAction;defaults:ProductOptions}) {
 const {t}=useTranslation(),store=useProductStore(),[options,setOptions]=useState(defaults),[id,setId]=useState(''),[error,setError]=useState('');
 const job=store.jobs[id],busy=job?.state==='running'||job?.state==='waiting';
 const run=async():Promise<void>=>{try{setError('');const task=await window.api.fusionProductRun(action,store.inputs.map(x=>x.id),options);store.job(task);setId(task.id);}catch(reason){setError(String(reason));}};
 return <ToolBody busy={busy} error={error||job?.error||''} cancel={()=>{if(id)void window.api.fusionProductJob(id,'cancel').catch(reason=>setError(String(reason)));}}>
  <div className="fusion-tool-row"><button onClick={()=>void window.api.fusionProductPick().then(inputs=>store.set({inputs})).catch(reason=>setError(String(reason)))}>{t('fusion.toolbox.chooseFiles')}</button><span>{store.inputs.map(x=>x.name).join(', ')}</span></div>
  <div className="fusion-product-options">{Object.entries(options).map(([key,value])=><label key={key}>{t('fusion.product.options.'+key)}{typeof value==='boolean'?<input type="checkbox" checked={value} onChange={event=>setOptions(old=>({...old,[key]:event.target.checked}))}/>:<input type={typeof value==='number'?'number':'text'} value={String(value)} onChange={event=>setOptions(old=>({...old,[key]:typeof value==='number'?Number(event.target.value):event.target.value}))}/>}</label>)}</div>
  <button disabled={busy||!store.inputs.length} onClick={()=>void run()}>{t('fusion.toolbox.run')}</button>
  {job&&<progress value={job.progress} max={1}/>}
  {job?.state==='waiting'&&<><div className="fusion-product-text">{job.preview?.map(row=><div key={row.before}>{row.before} → {row.after}{row.error&&<span role="alert">{row.error}</span>}</div>)}</div><button disabled={job.preview?.some(x=>x.error)} onClick={()=>void window.api.fusionProductJob(job.id,'confirm').catch(reason=>setError(String(reason)))}>{t('fusion.product.execute')}</button></>}
  {job?.state==='done'&&job.result.map(item=><ProductPreview key={item.id} artifact={item}/>)}
 </ToolBody>;
}
/** Consolidates canvas editing, conversion, compression and their own history. @returns Image workspace. */
export function ImageUnified() {
 const {t}=useTranslation(),store=useProductStore(),[tab,setTab]=useState('edit');
 useEffect(()=>{if(store.target==='image')setTab(store.tab||'edit');},[store.nonce]);
 return <><ToolTabs>{['edit','convert','compress','history','preview'].map(key=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{t('fusion.product.tabs.'+key)}</button>)}</ToolTabs>
  <ToolModes value={tab} children={{edit:<ImageTool/>,preview:<ProductPreview/>,history:<><FileCompressionToolSection fileCompressionPage="history" setFileCompressionPage={()=>setTab('compress')}/><ProductHistory kind="image-convert"/></>,compress:<ProductActionPanel action="image-convert" defaults={{format:'jpg',width:1600,quality:75}}/>,convert:<ProductActionPanel action="image-convert" defaults={{format:'png',width:1600,quality:90}}/>}}/>
 </>;
}
/** Shares PDF preview and existing page operations. @returns PDF workspace. */
export function PdfUnified() {
 const {t}=useTranslation(),store=useProductStore(),[tab,setTab]=useState('preview');useEffect(()=>{if(store.target==='pdf'&&store.tab)setTab(store.tab);},[store.nonce]);
 return <><ToolTabs>{['preview','organize'].map(key=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{t('fusion.product.tabs.'+key)}</button>)}</ToolTabs><ToolModes value={tab} children={{preview:<ProductPreview/>,organize:<PdfTool/>}}/></>;
}
/** Preserves download creation and its existing history in one entry. @returns Download workspace. */
export function DownloadUnified() {
 const {t}=useTranslation(),store=useProductStore(),[page,setPage]=useState<'file'|'media'|'torrent'|'history'>('file');
 useEffect(()=>{if(store.target==='download')setPage(store.tab==='history'?'history':store.tab==='media'?'media':store.tab==='torrent'?'torrent':'file');},[store.nonce]);
 return <><ToolTabs alwaysVisible>{(['file','media','torrent','history'] as const).map(tab=><button key={tab} aria-pressed={page===tab} onClick={()=>{setPage(tab);store.set({tab});}}>{t(tab==='file'?'fusion.ui.newDownload':'fusion.download.tabs.'+tab)}</button>)}</ToolTabs>
 <ToolModes value={page} children={{torrent:<TorrentDownloadTool onStarted={()=>setPage('history')}/>,media:<MediaDownloadTool onStarted={()=>setPage('history')}/>,history:<UnifiedDownloadHistory/>,file:<DownloadStartTool onStarted={()=>setPage('history')} openTorrent={()=>setPage('torrent')}/>}}/></>;
}
/** Consolidates related encoding inputs without remounting editors or adding another return row. */
export function EncodingUnified(){
 const {t}=useTranslation(),store=useProductStore(),[tab,setTab]=useState('json');
 useEffect(()=>{if(store.target==='encoding'&&['json','base64','url','csv'].includes(store.tab))setTab(store.tab);},[store.nonce]);
 return <><ToolTabs>{['json','csv','base64','url'].map(id=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{t('fusion.product.tabs.'+id)}</button>)}</ToolTabs><ToolModes value={tab} children={{json:<JsonWorkbench/>,base64:<Base64Workbench/>,url:<UrlTool/>,csv:<CsvTool/>}}/></>;
}
/** Text transformations and expression testing share a workspace with separate drafts. */
export function TextUnified(){
 const {t}=useTranslation(),store=useProductStore(),[tab,setTab]=useState<'process'|'compare'|'regex'>('process');
 useEffect(()=>{if(store.target==='text')setTab(store.tab==='regex'?'regex':store.tab==='compare'?'compare':'process');},[store.nonce]);
 return <><ToolTabs>{(['process','compare','regex'] as const).map(id=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{t(id==='regex'?'fusion.product.tabs.regex':id==='compare'?'fusion.toolbox.compare':'fusion.toolbox.workspace.process')}</button>)}</ToolTabs><ToolModes value={tab} children={{process:<TextTool mode="process" showModeTabs={false}/>,compare:<TextTool mode="compare" showModeTabs={false}/>,regex:<RegexTool/>}}/></>;
}
/** Keeps countdown and stopwatch on one page; both existing main-process timers continue in background. */
export function TimeUnified(){
 const {t}=useTranslation(),store=useProductStore(),[tab,setTab]=useState('countdown');
 useEffect(()=>{if(store.target==='timer')setTab(store.tab.startsWith('focus')?'focus':store.tab==='stopwatch'?'stopwatch':'countdown');},[store.nonce]);
 return <><ToolTabs>{['countdown','stopwatch','focus'].map(id=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{t(id==='focus'?'fusion.library.focus':'fusion.product.tabs.'+id)}</button>)}</ToolTabs><ToolModes value={tab} children={{countdown:<div className="float-timer-workspace"><FusionTimerPanel/><IndependentTimers/></div>,stopwatch:<StopwatchTool/>,focus:<FocusPanel/>}}/></>;
}
/** Preserves saved launch shortcuts and the existing software catalog. @returns Launcher workspace. */
export function LauncherUnified() {
 const {t}=useTranslation(),store=useProductStore(),[tab,setTab]=useState('favorites');useEffect(()=>{if(store.target==='launcher')setTab(store.tab||'favorites');},[store.nonce]);
 return <><ToolTabs>{['favorites','catalog'].map(key=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{t('fusion.product.tabs.'+key)}</button>)}</ToolTabs><ToolModes value={tab} children={{favorites:<ToolsTab/>,catalog:<SoftwareToolSection onFeedbackNavigate={()=>void window.api.openWorkspace({tab:'settings'})}/>}}/></>;
}
/** Shows only the corresponding new operation records. @param kind - Action category. @returns History list. */
export function ProductHistory({kind}:{kind:string}) {
 const {t}=useTranslation(),[rows,setRows]=useState<import('../../../../preload/types/fusionProduct').ProductData['history']>([]),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setError('');void window.api.fusionProductData().then(data=>{if(alive)setRows(data.history.filter(row=>row.kind===kind));}).catch(reason=>{if(alive)setError(String(reason));});return ()=>{alive=false;};},[kind]);
 return <ToolBody error={error}><div className="fusion-product-history">{rows.length?rows.map(row=><div key={row.id}>{new Date(row.time).toLocaleString()} · {row.name} · {t('fusion.product.state.'+row.state)}</div>):<span>{t('fusion.product.empty')}</span>}</div></ToolBody>;
}
export { ProductFlows };

/** Video acquisition, playback and conversion share existing services. */
export function VideoUnified(){const {t}=useTranslation(),store=useProductStore(),[tab,setTab]=useState('play');useEffect(()=>{if(store.target==='video')setTab(['record','convert'].includes(store.tab)?store.tab:'play');},[store.nonce]);return <><ToolTabs>{['play','record','convert'].map(id=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{t('fusion.product.tabs.'+id)}</button>)}</ToolTabs><ToolModes value={tab} children={{play:<WebTool kind="video"/>,record:<ProductRecorder/>,convert:<LegacyTools id="formatFactory-video"/>}}/></>;}
export function DateUnified(){const {t}=useTranslation(),store=useProductStore(),[tab,setTab]=useState('dates');useEffect(()=>{if(store.target==='dates')setTab(['timestamp','clock','anniversary'].includes(store.tab)?store.tab:'dates');},[store.nonce]);return <><ToolTabs>{['dates','timestamp','clock','anniversary'].map(id=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{t(id==='anniversary'?'fusion.toolbox.items.anniversary':'fusion.toolbox.workspace.'+id)}</button>)}</ToolTabs><ToolModes value={tab} children={{dates:<DateTool mode="dates" showModeTabs={false}/>,timestamp:<DateTool mode="timestamp" showModeTabs={false}/>,clock:<DateTool mode="clock" showModeTabs={false}/>,anniversary:<CountdownTab/>}}/></>;}
