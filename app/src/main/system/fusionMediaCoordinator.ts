/* FloatIsland - https://github.com/yanhaoran01/FloatIsland; Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionMediaCoordinator.ts @description Single sound ownership across persistent native media hosts. @author 鸡哥 */
import type {MediaControlResult} from '../../preload/types/fusionTools';
type Participant={pause:()=>Promise<MediaControlResult>;active?:()=>boolean};
const participants=new Map<string,Participant>();let revision=0;
/** Registers existing hosts without exposing commands to remote pages. */
export function registerMediaParticipant(id:string,participant:Participant):()=>void {participants.set(id,participant);return()=>participants.delete(id);}
/** Keeps collapsed controls available while a retained source exists. */
export function hasRegisteredFusionMedia():boolean{return [...participants.values()].some(p=>p.active?.());}
/** Silences other sources and rejects an older concurrent activation. */
export async function acquireFusionMedia(id:string):Promise<void>{const current=++revision;const results=await Promise.all([...participants].filter(([key])=>key!==id).map(([,p])=>p.pause()));if(current!==revision)throw Error('media-activation-cancelled');if(results.some(r=>!r.paused&&!r.muted))throw Error('media-not-quiet');}
/** Confirms real pause or mute before microphone access. */
export async function pauseAllFusionMedia():Promise<MediaControlResult>{revision++;const result=await Promise.all([...participants.values()].map(p=>p.pause()));return {paused:result.every(r=>r.paused),muted:result.every(r=>r.paused||r.muted),controllable:result.every(r=>r.controllable||r.paused)};}
