/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file ViewportHandles.tsx @description Isolated resize hit zones for the transparent expanded main window. @author 鸡哥 */
import {useEffect,useRef,useState,type JSX,type PointerEvent as ReactPointerEvent} from 'react';
import {useTranslation} from 'react-i18next';
import type {ResizeEdge} from '../../../preload/types/fusionWorkspace';
/** Owns one pointer gesture; the main process owns geometry and persistence. */
export function ViewportHandles():JSX.Element {
  const {t}=useTranslation(),token=useRef<string|null>(null),inFlight=useRef(false),cancelled=useRef(false);
  const [error,setError]=useState('');
  const stop=async(cancel:boolean):Promise<void>=>{
    cancelled.current=true;const current=token.current;token.current=null;
    delete document.documentElement.dataset.floatGesture;window.dispatchEvent(new Event('float-layout-gesture'));
    if(current)try{await window.api.fusionViewportControl(cancel?'cancel':'end',current);}catch{setError(t('fusion.settings.saveError'));}
  };
  useEffect(()=>{
    const key=(event:KeyboardEvent):void=>{if(event.key==='Escape'&&(token.current||inFlight.current)){event.stopPropagation();void stop(true);}};
    const blur=():void=>{void stop(false);};
    const off=window.api.onFusionViewport(state=>{if(!state.adjusting&&token.current){token.current=null;delete document.documentElement.dataset.floatGesture;}});
    window.addEventListener('keydown',key,true);window.addEventListener('blur',blur);
    return()=>{off();window.removeEventListener('keydown',key,true);window.removeEventListener('blur',blur);void stop(true);};
  },[]);
  const begin=async(event:ReactPointerEvent<HTMLDivElement>,edge:ResizeEdge):Promise<void>=>{
    if(event.button!==0||inFlight.current||token.current)return;
    event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
    cancelled.current=false;inFlight.current=true;setError('');
    document.documentElement.dataset.floatGesture='resize';window.dispatchEvent(new Event('float-layout-gesture'));
    try{const state=await window.api.fusionViewportControl('begin',edge);if(cancelled.current){if(state.token)await window.api.fusionViewportControl('cancel',state.token);}else token.current=state.token;}
    catch{delete document.documentElement.dataset.floatGesture;setError(t('fusion.settings.saveError'));}
    finally{inFlight.current=false;}
  };
  const move=(event:ReactPointerEvent<HTMLDivElement>):void=>{
    event.stopPropagation();if(!token.current||inFlight.current)return;
    inFlight.current=true;void window.api.fusionViewportControl('move',token.current).catch(()=>void stop(true)).finally(()=>{inFlight.current=false;});
  };
  return <>{(['n','s','e','w','ne','nw','se','sw'] as ResizeEdge[]).map(edge=><div key={edge} className={'float-resize-handle float-resize-'+edge} data-resize-edge={edge} aria-hidden="true" onPointerDown={event=>void begin(event,edge)} onPointerMove={move} onPointerUp={event=>{event.stopPropagation();void stop(false);}} onPointerCancel={()=>void stop(true)} onLostPointerCapture={()=>{if(token.current||inFlight.current)void stop(false);}}/>)}{error&&<span className="float-resize-error" role="alert">{error}</span>}</>;
}
