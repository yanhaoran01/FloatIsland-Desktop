/* FloatIsland - https://github.com/yanhaoran01/FloatIsland; Copyright (C) 2026 contributors. GPL-3.0. */
/** @file musicState.ts @description Shared retained music subscription across tool and collapsed controls. @author 鸡哥 */
import {useEffect,useSyncExternalStore} from 'react';
import type {MusicState,MusicCommand,MusicCommandValue} from '../../../preload/types/fusionMusic';
let state:MusicState|null=null,started=false,generation=0;const listeners=new Set<()=>void>();
const update=(next:MusicState)=>{state=next;generation++;listeners.forEach(fn=>fn());};
/** Keeps state mounted independently from the current visible page. */
export function useMusicState():MusicState|null {
  useEffect(()=>{if(started)return;started=true;const version=generation;window.api.onFusionMusicState(update);void window.api.fusionMusicState().then(next=>{if(generation===version)update(next);}).catch(()=>{});},[]);
  return useSyncExternalStore(listener=>{listeners.add(listener);return()=>listeners.delete(listener);},()=>state);
}
/** Applies actual main-process results without overwriting newer broadcasts. */
export async function controlMusic(command:MusicCommand,value?:MusicCommandValue):Promise<void>{const version=generation;const next=await window.api.fusionMusicControl(command,value);if(generation===version)update(next);}
