/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file MusicPlaylistPanel.tsx @description Visible domestic playlist discovery and selection before import. @author 鸡哥 */
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {create} from 'zustand';
import {useTranslation} from 'react-i18next';
import {Download,Search,X,Music2,Play,Plus,LoaderCircle} from 'lucide-react';
import type {MusicSource,RemoteMusicPlaylist,MusicPlaylistPreview} from '../../../../preload/types/fusionMusic';
import {ToolError} from './ToolControls';
import {controlMusic} from '../musicState';
interface Draft {source:string;share:string;category:string;query:string;page:number;searching?:boolean;lists:RemoteMusicPlaylist[];preview:MusicPlaylistPreview|null;selected:string[];more:boolean;loadedKey?:string;set:(value:Partial<Draft>)=>void;}
const useDraft=create<Draft>(set=>({source:'builtin:netease',share:'',category:'',query:'',page:1,lists:[],preview:null,selected:[],more:false,set:value=>set(value)}));
/** Keeps share text and preview while switching music pages without starting playback. */
export function MusicPlaylistPanel({sources,updated,imported,actionsHost}:{actionsHost?:HTMLElement|null;sources:MusicSource[];updated:(sources:MusicSource[])=>void;imported:(id:string)=>void}){
 const {t}=useTranslation(),draft=useDraft(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[categories,setCategories]=useState<Array<{id:string;name:string}>>([]);
 const generation=useRef(0);
 useEffect(()=>()=>{generation.current++;},[]);
 const source=sources.find(source=>source.id===draft.source),available=sources.filter(source=>source.capabilities.some(cap=>cap==='playlist'||cap==='playlist-discover'||cap==='playlist-details'));
 useEffect(()=>{let alive=true;setCategories([]);if(source?.enabled&&source.capabilities.includes('playlist-discover'))void window.api.fusionMusicPlaylistCategories(source.id).then(value=>{if(alive)setCategories(value);}).catch(reason=>{if(alive)setError(String(reason));});return()=>{alive=false;};},[draft.source,source?.enabled]);
 const run=async(work:(stamp:number)=>Promise<void>)=>{if(busy)return;const stamp=++generation.current;setBusy(true);setError('');try{await work(stamp);}catch(reason){if(stamp===generation.current)setError(String(reason));}finally{if(stamp===generation.current)setBusy(false);}};
 useEffect(()=>{
  if(!source?.enabled||!source.capabilities.includes('playlist-discover')){setBusy(false);return;}
  const key=source.id+':'+draft.category;if(draft.loadedKey===key&&draft.lists.length)return;
  const stamp=++generation.current;setBusy(true);setError('');
  void window.api.fusionMusicPlaylistDiscover(source.id,draft.category,1).then(result=>{if(stamp===generation.current)draft.set({lists:result.playlists,page:1,searching:false,more:result.hasMore,preview:null,loadedKey:key});}).catch(reason=>{if(stamp===generation.current)setError(String(reason));}).finally(()=>{if(stamp===generation.current)setBusy(false);});
  return()=>{generation.current++;};
 },[source?.id,source?.enabled,draft.category]);
 const discover=(page=1,search=false)=>run(async stamp=>{const result=search?await window.api.fusionMusicPlaylistSearch(draft.source,draft.query,page):await window.api.fusionMusicPlaylistDiscover(draft.source,draft.category,page);if(stamp===generation.current)draft.set({lists:result.playlists,page,searching:search,more:result.hasMore,preview:null,loadedKey:search?undefined:draft.source+':'+draft.category});});
 const preview=(reference:string,sourceId=draft.source)=>run(async()=>{const value=await window.api.fusionMusicPlaylistPreview(sourceId,reference);draft.set({preview:value,selected:value.tracks.map(track=>track.id)});});
 const commit=()=>run(async()=>{if(!draft.preview)return;const value=await window.api.fusionMusicPlaylistCommit(draft.preview.id,draft.selected);imported(value.id);});
 const importActions=<details className="float-playlist-import" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}>
   <summary><Plus size={15}/>{t('fusion.ui.importPlaylist')}</summary>
   <div className="float-playlist-share"><input value={draft.share} placeholder={t('fusion.enhance.music.share')} aria-label={t('fusion.enhance.music.share')} onChange={event=>draft.set({share:event.target.value})}/><button disabled={!draft.share.trim()||busy} onClick={()=>void preview(draft.share)}><Plus size={16}/>{t('fusion.enhance.music.previewImport')}</button><button disabled={busy} onClick={()=>void run(async()=>{const value=await window.api.fusionMusicPlaylistFilePreview();if(value)draft.set({preview:value,selected:value.tracks.map(track=>track.id)});})}>{t('fusion.enhance.music.importFile')}</button></div>
  </details>;
 return <section className="float-playlists">
  {actionsHost?createPortal(importActions,actionsHost):importActions}
  <form className="float-playlist-toolbar" onSubmit={event=>{event.preventDefault();void discover(1,Boolean(draft.query.trim()));}}>
   <select value={draft.source} aria-label={t('fusion.music.source')} onChange={event=>draft.set({source:event.target.value,category:'',lists:[],preview:null})}>{available.map(source=><option key={source.id} value={source.id}>{source.protocol==='builtin'?t('fusion.music.provider.'+source.name):source.name}</option>)}</select>
   <select value={draft.category} aria-label={t('fusion.enhance.music.category')} onChange={event=>draft.set({category:event.target.value,lists:[],preview:null,loadedKey:undefined})}><option value="">{t('fusion.enhance.music.allCategories')}</option>{categories.filter(category=>category.id).map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select>
   <div className="float-playlist-query"><Search size={15}/><input value={draft.query} placeholder={t('fusion.enhance.music.searchPlaylistHint')} aria-label={t('fusion.enhance.music.searchPlaylistHint')} onChange={event=>draft.set({query:event.target.value})}/><button type="submit" disabled={busy||!source?.enabled||(!draft.query.trim()&&!source.capabilities.includes('playlist-discover'))} title={t(draft.query.trim()?'fusion.enhance.music.searchPlaylists':'fusion.enhance.music.discover')} aria-label={t(draft.query.trim()?'fusion.enhance.music.searchPlaylists':'fusion.enhance.music.discover')}><Search size={16}/></button></div>
   {source&&!source.enabled&&<button type="button" onClick={()=>void run(async()=>updated(await window.api.fusionMusicSourceControl(source.id,'enable')))}>{t('fusion.enhance.music.enableSource')}</button>}
   {busy&&<button type="button" onClick={()=>void window.api.fusionMusicCancelSearch()}><X size={16}/>{t('fusion.toolbox.cancel')}</button>}

  </form>

  <ToolError error={error}/>{busy&&!draft.lists.length&&<div className="float-playlist-loading" role="status"><LoaderCircle size={22} className="fusion-tool-busy-icon"/><span>{t('fusion.download.analyzing')}</span></div>}
  {draft.preview?<section className="float-playlist-preview">
   <div className="float-playlist-info">{draft.preview.playlist.cover&&<img src={draft.preview.playlist.cover} alt=""/>}<div><strong>{draft.preview.playlist.name}</strong><p>{t('fusion.enhance.music.previewCount',{count:draft.preview.tracks.length,invalid:draft.preview.invalid})}</p></div></div>
   <div className="fusion-tool-actions float-playlist-selection"><label className="float-check"><input type="checkbox" checked={Boolean(draft.preview.tracks.length)&&draft.selected.length===draft.preview.tracks.length} onChange={event=>draft.set({selected:event.target.checked?draft.preview!.tracks.map(track=>track.id):[]})}/>{t('fusion.download.selectAll')}</label><button disabled={busy||!draft.selected.length} onClick={()=>void commit()}><Download size={16}/>{t('fusion.enhance.music.importSelected',{count:draft.selected.length})}</button><button onClick={()=>draft.set({preview:null})}>{t('fusion.tools.back')}</button></div>
   <div className="float-playlist-songs">{draft.preview.tracks.map(track=><div key={track.id} className="float-playlist-track"><input type="checkbox" checked={draft.selected.includes(track.id)} aria-label={track.title} onChange={event=>draft.set({selected:event.target.checked?[...draft.selected,track.id]:draft.selected.filter(id=>id!==track.id)})}/><span>{track.title}<small>{track.artist}{track.availability==='restricted'?' · '+t('fusion.music.restricted'):''}</small></span><button onClick={()=>void run(async()=>{await controlMusic('play',{id:track.id});})}><Play size={14}/>{t('songTab.controls.play')}</button></div>)}</div>
  </section>:<><div className="float-playlist-grid">{draft.lists.map(list=><button key={list.id} disabled={busy} onClick={()=>void preview(list.id,list.sourceId)}><div>{list.cover?<img src={list.cover} alt="" loading="lazy"/>:<Music2 size={30}/>}</div><strong>{list.name}</strong><small>{t('fusion.enhance.music.viewSongs')}</small></button>)}</div>
   {!draft.lists.length&&!busy&&<div className="float-playlist-empty"><Music2 size={28} strokeWidth={1.3}/><strong>{t('fusion.enhance.music.discover')}</strong></div>}
   {!!draft.lists.length&&<div className="float-playlist-pagination"><button disabled={busy||draft.page<=1} onClick={()=>void discover(draft.page-1,draft.searching)}>{t('fusion.music.previousPage')}</button><span>{draft.page}</span><button disabled={busy||!draft.more} onClick={()=>void discover(draft.page+1,draft.searching)}>{t('fusion.music.nextPage')}</button></div>}</>}
 </section>;
}
