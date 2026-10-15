/* FloatIsland contributors, GPL-3.0. */
/** @file DownloadStartTool.tsx @description Shared-text recognition, named actions and task preview before starting. @author 鸡哥 */
import {useEffect,useState} from 'react';
import {create} from 'zustand';
import {useTranslation} from 'react-i18next';
import {Download,FolderOpen,FilePlus2,Search} from 'lucide-react';
import {downloadInputs,type DownloadInput} from '../../../../shared/downloadInputs';
import {useProductStore,openProductTool} from '../productStore';
import {ToolBody} from './ToolControls';
import {prepareTorrentInput} from './TorrentDownloadTool';
interface Draft {text:string;preview:DownloadInput[];selected:string[];directory:{id:string;path:string}|null;set:(value:Partial<Draft>)=>void;}
const useDraft=create<Draft>(set=>({text:'',preview:[],selected:[],directory:null,set:value=>set(value)}));
/** Only explicit start enqueues files; media and BT first open their respective selection previews. */
export function DownloadStartTool({onStarted,openTorrent}:{onStarted:()=>void;openTorrent:()=>void}){
 const {t}=useTranslation(),draft=useDraft(),product=useProductStore(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(product.target==='download'&&product.tab!=='media'&&product.tab!=='torrent'&&product.inputs[0]?.kind==='text')void window.api.fusionProductRead(product.inputs[0].id).then(value=>draft.set({text:new TextDecoder().decode(value.bytes)})).catch(reason=>setError(String(reason)));},[product.nonce]);
 const inspect=()=>{const preview=downloadInputs(draft.text);draft.set({preview,selected:preview.filter(input=>input.kind==='file').map(input=>input.url)});setError(preview.length?'':'media-invalid-url');};
 const start=async()=>{if(busy)return;setBusy(true);setError('');try{await window.api.downloadFilesStart(draft.selected,draft.directory?.id);onStarted();}catch(reason){setError(String(reason));}finally{setBusy(false);}};
 const open=(input:DownloadInput)=>{if(input.kind==='torrent'){prepareTorrentInput(undefined,input.url);openTorrent();}else void window.api.fusionProductText(input.url).then(artifact=>openProductTool('download',[artifact],'media')).catch(reason=>setError(String(reason)));};
 return <ToolBody className="float-download-workspace" error={error}><div className="float-download-start" onDragOver={event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.stopPropagation();}}} onDrop={event=>{event.preventDefault();event.stopPropagation();const file=Array.from(event.dataTransfer.files).find(file=>file.name.toLowerCase().endsWith('.torrent'));if(file){prepareTorrentInput(file);openTorrent();}else{const text=event.dataTransfer.getData('text/plain');if(text)draft.set({text,preview:[],selected:[]});}}}>
 <textarea aria-label={t('fusion.download.urls')} value={draft.text} placeholder={t('fusion.enhance.download.placeholder')} onChange={event=>draft.set({text:event.target.value,preview:[],selected:[]})}/>
 <div className="fusion-tool-actions"><button className="float-primary-action" disabled={!draft.text.trim()||busy} onClick={inspect}><Search size={16}/>{t('fusion.enhance.download.new')}</button><button onClick={openTorrent}><FilePlus2 size={16}/>{t('fusion.enhance.bt.import')}</button></div>
 <div className="float-download-preview-list" aria-label={t('fusion.ui.taskPreview')}>{draft.preview.map(input=><article className="float-download-preview" key={input.url}>{input.kind==='file'&&<input type="checkbox" checked={draft.selected.includes(input.url)} aria-label={input.name} onChange={event=>draft.set({selected:event.target.checked?[...draft.selected,input.url]:draft.selected.filter(url=>url!==input.url)})}/>}<div><strong>{input.name}</strong><small>{input.url}</small></div><span>{t('fusion.download.tabs.'+input.kind)}</span>{input.kind!=='file'&&<button onClick={()=>open(input)}>{t(input.kind==='media'?'fusion.download.analyze':'fusion.enhance.bt.inspect')}</button>}</article>)}{!draft.preview.length&&<p className="float-empty-hint">{t('fusion.ui.downloadPreviewHint')}</p>}</div>
 <footer className="float-download-start-footer"><div><button onClick={()=>void window.api.downloadPickDirectory().then(directory=>{if(directory)draft.set({directory});}).catch(reason=>setError(String(reason)))}><FolderOpen size={16}/>{t('fusion.download.directory')}</button><small title={draft.directory?.path}>{draft.directory?.path||t('fusion.download.defaultDirectory')}</small></div><button className="float-primary-action" disabled={!draft.selected.length||busy} onClick={()=>void start()}><Download size={16}/>{t('fusion.enhance.download.startFiles',{count:draft.selected.length})}</button></footer>
 </div></ToolBody>;
}
