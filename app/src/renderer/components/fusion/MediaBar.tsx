/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file MediaBar.tsx @description 灵动岛内保留的实际媒体控制和进度；收起时显示迷你唱片与律动条。 @author 鸡哥 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Volume2, VolumeX, Maximize2, X } from 'lucide-react';
import useIslandStore from '../../store/slices';
import {prepareIslandTransition} from './islandTransition';
import { openMedia, useMediaState } from './mediaState';
import type { MediaCommand } from '../../../preload/types/fusionTools';
import './floatDesign.css';
import { useMusicState, controlMusic } from './musicState';
/** 收起时保留声音与控制；关闭才销毁媒体实例。 */
export function MediaBar({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  const media = useMediaState().find(item => item.active);
  const music = useMusicState();
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!collapsed || (!media && !music?.active)) return;
    const shell = root.current?.closest<HTMLElement>('.island-shell');
    shell?.classList.add('fusion-media-capsule');
    const timer=setTimeout(prepareIslandTransition,350);
    return()=>{clearTimeout(timer);shell?.classList.remove('fusion-media-capsule');};
  }, [collapsed, Boolean(media)||Boolean(music?.active)]);
  if (!media && music?.active) {
    const track=music.library.tracks.find(item=>item.id===music.library.current);
    const musicCommand=(name:Parameters<typeof controlMusic>[0],value?:Parameters<typeof controlMusic>[1])=>{setError('');void controlMusic(name,value).catch(reason=>setError(String(reason)));};
    const show=()=>{if(collapsed)useIslandStore.getState().setMaxExpand();window.dispatchEvent(new CustomEvent('fusion-open-tool',{detail:'music'}));};
    return <div ref={root} className={'fusion-media-bar'+(collapsed?' is-collapsed fi-media-capsule':'')} data-playing={music.playing} onClick={event=>event.stopPropagation()}>
      {collapsed&&<><button className="fi-mini-disc" title={track?.title} aria-label={t('fusion.media.expand')} onClick={show}><span/></button><div className="fi-media-copy"><strong>{track?.title}</strong></div></>}
      <div className="fusion-media-row"><button className="fusion-icon-button" aria-label={t(music.playing?'fusion.media.pause':'fusion.media.play')} onClick={()=>musicCommand('toggle')}>{music.playing?<Pause size={16}/>:<Play size={16}/>}</button><button className="fusion-icon-button" aria-label={t('fusion.media.mute')} aria-pressed={music.muted} onClick={()=>musicCommand('mute')}>{music.muted?<VolumeX size={16}/>:<Volume2 size={16}/>}</button><button className="fusion-icon-button" aria-label={t('fusion.media.expand')} onClick={show}><Maximize2 size={16}/></button><button className="fusion-icon-button" aria-label={t('fusion.media.close')} onClick={()=>{void controlMusic('close').then(()=>{if(collapsed)window.api.collapseWindow();}).catch(reason=>setError(String(reason)));}}><X size={16}/></button></div>
      {error&&<small role="alert">{error}</small>}
    </div>;
  }
  if (!media) return null;
  const command = (name: MediaCommand, value?: number): void => { setError(''); void window.api.fusionMediaCommand(name, value).then(() => { if (name === 'close' && collapsed) window.api.collapseWindow(); }).catch(reason => setError(String(reason))); };
  const expand = (): void => { if (collapsed) useIslandStore.getState().setMaxExpand(); openMedia(); };
  const controls = <>
    <button className="fusion-icon-button" disabled={!media.controllable} aria-label={t(`fusion.media.${media.playing ? 'pause' : 'play'}`)} onClick={() => command('toggle')}>{media.playing ? <Pause size={15} /> : <Play size={15} />}</button>
    <button className="fusion-icon-button" aria-label={t('fusion.media.mute')} aria-pressed={media.muted} onClick={() => command('mute')}>{media.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
    <button className="fusion-icon-button" aria-label={t('fusion.media.expand')} onClick={expand}><Maximize2 size={15} /></button>
    <button className="fusion-icon-button" aria-label={t('fusion.media.close')} onClick={() => command('close')}><X size={15} /></button>
  </>;
  if (collapsed) return <div ref={root} className="fusion-media-bar is-collapsed fi-media-capsule" data-playing={media.playing} onClick={event => event.stopPropagation()}>
    <button type="button" className="fi-mini-disc" aria-label={t('fusion.media.expand')} title={media.title} onClick={expand}><span /></button>
    <div className="fi-media-copy">
      <strong title={media.title}>{media.title || t('fusion.media.title')}</strong>
      <span className="fi-eq" aria-hidden="true">{[0, 1, 2, 3].map(index => <i key={index} style={{ '--bar': index } as CSSProperties} />)}</span>
    </div>
    <div className="fusion-media-row">{controls}</div>

    {error && <small role="alert">{error}</small>}
  </div>;
  return <div ref={root} className="fusion-media-bar" onClick={event => event.stopPropagation()}>
    <div className="fusion-media-row"><span className="fusion-media-indicator" aria-hidden="true" data-playing={media.playing} />{controls}</div>
    {!media.controllable&&<button className="fusion-media-fallback" title={t('fusion.media.return')} aria-label={t('fusion.media.return')} onClick={expand}><Maximize2 size={13}/></button>}
    {error && <small role="alert">{error}</small>}
  </div>;
}
