/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file WebTool.tsx @description 原生隔离网页视口、收藏和独立视频会话。 @author 鸡哥 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, RotateCw, Star, ExternalLink, FolderOpen, Play, X, Download,Bookmark,BookOpen } from 'lucide-react';
import {ArticleReader} from './LibraryTool';
import type {LibraryArticle} from '../../../../preload/types/fusionLibrary';
import {useLibrary} from '../libraryState';
import type { WebKind } from '../../../../preload/types/fusionTools';
import { openProductTool } from '../productStore';
import { useMediaState } from '../mediaState';
import { ToolError,useToolVisible } from './ToolControls';
import {MusicMenu} from './MusicMenu';
import './musicSources.css';

/** WebContentsView 的位置仅由可信页面测量，外部站点没有应用接口。 */
export function WebTool({ kind }: { kind: WebKind }) {
  const { t } = useTranslation();
  const state = useMediaState().find(item => item.kind === kind);
  const [address, setAddress] = useState(kind === 'video' ? 'https://www.bilibili.com' : 'https://www.youtube.com');
  const [error, setError] = useState('');
  const [menuOpen,setMenuOpen]=useState(false);
  const library=useLibrary(),[reader,setReader]=useState<LibraryArticle|null>(null);
  const slot = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => { if (state?.url && !state.url.startsWith('fusion-file:')) setAddress(state.url); }, [state?.url]);
  const toolVisible=useToolVisible();
  useLayoutEffect(() => {
    if(!toolVisible)return;
    let frame = 0; let disposed = false; let previous = '';
    const attach = (): void => {
      frame = 0; if (disposed) return;
      const element = slot.current;
      const visible = Boolean(!reader&&!menuOpen&&!document.documentElement.dataset.floatToolPanel&&!document.documentElement.dataset.floatPopup&&document.querySelector<HTMLElement>('.island-shell')?.style.visibility!=='hidden'&&element?.getClientRects().length && state?.url && !state.error);
      const rect = visible ? element!.getBoundingClientRect() : null;
      const bounds = rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
      const key = JSON.stringify(bounds);
      if (key === previous) return; previous = key;
      void window.api.fusionWebAttach(kind, bounds).catch(reason => { if (!disposed) setError(String(reason)); });
    };
    const schedule = (): void => { if (!frame) frame = requestAnimationFrame(attach); };
    const resize = new ResizeObserver(schedule); if (slot.current) resize.observe(slot.current);
    const mutation = new MutationObserver(schedule); mutation.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    window.addEventListener('float-tool-panel',schedule);window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true); schedule();
    return () => { disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); window.removeEventListener('float-tool-panel',schedule);window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); void window.api.fusionWebAttach(kind, null).catch(() => {}); };
  }, [kind, Boolean(state?.url), Boolean(state?.error),menuOpen,Boolean(reader),toolVisible]);
  const run = (action: () => Promise<unknown>): void => { setError(''); void action().catch(reason => setError(reason instanceof Error ? reason.message : String(reason))); };
  const navigate = (url = address): void => run(() => window.api.fusionWebNavigate(kind, url));
  const local = (file?: File): void => run(() => window.api.fusionVideoFile(file));
  const isLocal = Boolean(state?.url.startsWith('fusion-file:'));
  const ratio = isLocal && state?.width && state.height ? state.width / state.height : 16 / 9;
  const icon=(label:string,action:()=>void,content:React.ReactNode,disabled=false)=><button type="button" className="fusion-icon-button" title={label} aria-label={label} disabled={disabled} onClick={action}>{content}</button>;
  return <section ref={root} className="fusion-web-tool" data-layout={isLocal ? 'video' : 'web'} data-video-ratio={ratio}
    onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); event.stopPropagation(); if (kind === 'video') local(event.dataTransfer.files[0]); }}>
    {!isLocal&&!reader&&<form className="fusion-web-address fusion-web-address-compact" onSubmit={event=>{event.preventDefault();navigate();}}>
      {icon(t('fusion.web.back'),()=>run(()=>window.api.fusionWebAction(kind,'back')),<ArrowLeft size={20} strokeWidth={1.6}/>,!state?.back)}
      {icon(t('fusion.web.forward'),()=>run(()=>window.api.fusionWebAction(kind,'forward')),<ArrowRight size={20} strokeWidth={1.6}/>,!state?.forward)}
      {icon(t('fusion.web.reload'),()=>run(()=>window.api.fusionWebAction(kind,'reload')),<RotateCw size={20} strokeWidth={1.6}/>,!state?.url)}
      <input aria-label={t('fusion.web.address')} value={address} onChange={event=>setAddress(event.target.value)} placeholder="https://"/>
    <div className="fusion-web-actions">
      {kind==='video'&&icon(t('fusion.media.local'),()=>local(),<FolderOpen size={20} strokeWidth={1.6}/>)}
      {isLocal?icon(t('fusion.media.close'),()=>run(()=>window.api.fusionMediaCommand('close')),<X size={20} strokeWidth={1.6}/>):<>
        {icon(t('fusion.web.favorite'),()=>{if(state)run(()=>library.write({type:'url',title:state.title.slice(0,200),url:state.url}));},<Star size={20} strokeWidth={1.6}/>,!state?.url)}
        <MusicMenu label={t('fusion.music.more')} onOpenChange={setMenuOpen}>
          <button onClick={()=>navigate('https://www.bilibili.com')}>{t('fusion.web.bilibili')}</button><button onClick={()=>navigate('https://www.youtube.com')}>YouTube</button>
          {kind==='browser'&&<button disabled={!state?.url} onClick={()=>run(async()=>{await window.api.fusionWebNavigate('video',state!.url);window.dispatchEvent(new CustomEvent('fusion-open-tool',{detail:'video'}));})}><Play size={16}/>{t('fusion.media.independent')}</button>}
          <button disabled={!state?.url} onClick={()=>run(async()=>{const item=await window.api.fusionProductText(state!.url);openProductTool('download',[item],'media');})}><Download size={16}/>{t('fusion.download.currentPage')}</button>
          <button disabled={!state?.url} onClick={()=>run(()=>window.api.fusionWebAction(kind,'external'))}><ExternalLink size={16}/>{t('fusion.web.external')}</button>
          {kind==='browser'&&<><button disabled={!state?.url} onClick={()=>run(()=>window.api.fusionLibraryReadPage(false).then(setReader))}><BookOpen size={16}/>{t('fusion.library.read')}</button><button disabled={!state?.url} onClick={()=>run(()=>window.api.fusionLibraryReadPage(true).then(article=>openProductTool('collections',[],'article:'+article.id)))}><Download size={16}/>{t('fusion.library.saveArticle')}</button></>}
          <button onClick={()=>openProductTool('collections',[])}><Bookmark size={16}/>{t('fusion.toolbox.items.collections')}</button>
          {library.data.items.filter(item=>item.kind==='url').slice(0,8).map(bookmark=><div className="fusion-web-bookmark" key={bookmark.id}><button title={bookmark.url} onClick={()=>navigate(bookmark.url!)}><Bookmark size={14}/>{bookmark.title}</button><button title={t('fusion.toolbox.delete')} aria-label={`${t('fusion.toolbox.delete')} ${bookmark.title}`} onClick={()=>run(()=>library.write({type:'remove',id:bookmark.id}))}><X size={14}/></button></div>)}
          <button onClick={()=>{if(confirm(t('fusion.web.clearConfirm')))run(()=>window.api.fusionWebAction(kind,'clear'));}}>{t('fusion.web.clear')}</button>
        </MusicMenu>
      </>}
    </div></form>}
    {isLocal&&!reader&&<div className="fusion-web-local-actions">{icon(t('fusion.media.local'),()=>local(),<FolderOpen size={20}/>)}{icon(t('fusion.media.close'),()=>run(()=>window.api.fusionMediaCommand('close')),<X size={20}/>)}</div>}
    <ToolError error={error || library.error || state?.error || ''} />
    {state?.error && <div className="fusion-tool-actions"><button onClick={() => run(() => window.api.fusionWebAction(kind, 'reload'))}>{t('fusion.web.retry')}</button>{!isLocal && <button onClick={() => run(() => window.api.fusionWebAction(kind, 'external'))}>{t('fusion.web.external')}</button>}</div>}
    {state?.loading && <small role="status">{t('fusion.web.loading')}</small>}
    {reader?<ArticleReader article={reader} onChange={setReader} onClose={()=>setReader(null)}/>:<div ref={slot} className="fusion-web-slot">{!state?.url && <div className="fusion-web-welcome">{kind==='browser'&&<span>{t('fusion.ui.browserStartHint')}</span>}{kind === 'video' && <button aria-label={t('fusion.media.local')} onClick={() => local()}><FolderOpen size={20} />{t('fusion.media.local')}</button>}</div>}</div>}
  </section>;
}
