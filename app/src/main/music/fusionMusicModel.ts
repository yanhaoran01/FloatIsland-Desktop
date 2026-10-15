/* FloatIsland - https://github.com/yanhaoran01/FloatIsland; Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionMusicModel.ts @description Validated local library edits with no persisted stream URLs. @author 鸡哥 */
import {randomUUID} from 'crypto';
import type {MusicLibrary,MusicTrack,MusicCommand,MusicCommandValue} from '../../preload/types/fusionMusic';
export const emptyMusicLibrary=():MusicLibrary=>({version:2,revision:0,tracks:[],queue:[],favorites:[],playlists:[],current:null,volume:.7,shuffle:false,repeat:'off'});
/** Copies only known metadata, never remote playback links or credentials. */
export function normalizeMusicTrack(input:unknown):MusicTrack|null {
  if(!input||typeof input!=='object')return null;
  const v=input as Record<string,unknown>;
  if(typeof v.id!=='string'||!v.id||v.id.length>240||!(/^(netease|qq|migu|kuwo|kugou|qianqian|local)$/.test(String(v.provider))||/^plugin:[a-zA-Z0-9_.:-]{1,180}$/.test(String(v.provider)))||typeof v.title!=='string')return null;
  const text=(x:unknown)=>typeof x==='string'?x.slice(0,1000):'';
  const safeUrl=(x:unknown)=>{try{const u=new URL(text(x));return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  const extra=v.extra&&typeof v.extra==='object'?v.extra as Record<string,unknown>:{};
  const data=safeMusicData(extra.data);
  return {id:v.id,provider:v.provider as MusicTrack['provider'],title:text(v.title),artist:text(v.artist),album:text(v.album),cover:safeUrl(v.cover),availability:v.availability==='restricted'?'restricted':'unknown',duration:typeof v.duration==='number'&&Number.isFinite(v.duration)&&v.duration>0&&v.duration<86400?v.duration:undefined,sourceId:typeof v.sourceId==='string'?v.sourceId.slice(0,200):undefined,candidates:Array.isArray(v.candidates)?[...new Set(v.candidates.filter((id):id is string=>typeof id==='string'&&id.length<=240))].slice(0,100):undefined,extra:{contentId:text(extra.contentId),quality:text(extra.quality),lyricUrl:safeUrl(extra.lyricUrl),translationUrl:safeUrl(extra.translationUrl),data:data&&typeof data==='object'&&!Array.isArray(data)?data:undefined}};
}
/** Retains provider IDs/hash metadata, excluding transient addresses and credentials. */
export function safeMusicData(input:unknown,depth=0):import('../../preload/types/fusionMusic').MusicJson|undefined {
  if(depth>8)return undefined;
  if(input===null||typeof input==='boolean')return input;
  if(typeof input==='number')return Number.isFinite(input)?input:undefined;
  if(typeof input==='string')return /^https?:\/\//i.test(input)?undefined:input.slice(0,2000);
  if(Array.isArray(input))return input.slice(0,100).flatMap(x=>{const v=safeMusicData(x,depth+1);return v===undefined?[]:[v];});
  if(input&&typeof input==='object'){const output:Record<string,import('../../preload/types/fusionMusic').MusicJson>={};for(const [key,x] of Object.entries(input).slice(0,100)){if(/url|cookie|token|password|authorization|^(__proto__|prototype|constructor)$/i.test(key))continue;const v=safeMusicData(x,depth+1);if(v!==undefined)output[key]=v;}return output;}
  return undefined;
}
/** Repairs invalid records while keeping valid user playlists and queue entries. */
export function normalizeMusicLibrary(input:unknown):MusicLibrary {
  const text=(value:unknown)=>typeof value==='string'?value.slice(0,1000):'';const safeUrl=(value:unknown)=>{try{const url=new URL(text(value));return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}};
  const base=emptyMusicLibrary();if(!input||typeof input!=='object')return base;
  const v=input as Record<string,unknown>;if(v.version!==1&&v.version!==2)return base;
  base.playbackQuality=['auto','standard','high','lossless','hires'].includes(String(v.playbackQuality))?v.playbackQuality as MusicLibrary['playbackQuality']:'auto';base.downloadQuality=['auto','standard','high','lossless','hires'].includes(String(v.downloadQuality))?v.downloadQuality as MusicLibrary['downloadQuality']:'auto';
  base.tracks=Array.isArray(v.tracks)?v.tracks.flatMap(x=>{const t=normalizeMusicTrack(x);return t?[t]:[];}):[];
  base.tracks=[...new Map(base.tracks.map(t=>[t.id,t])).values()];
  const ids=new Set(base.tracks.map(t=>t.id));const list=(x:unknown)=>Array.isArray(x)?[...new Set(x.filter((id):id is string=>typeof id==='string'&&ids.has(id)))]:[];
  base.queue=list(v.queue);base.favorites=list(v.favorites);base.current=typeof v.current==='string'&&base.queue.includes(v.current)?v.current:null;
  base.volume=typeof v.volume==='number'&&Number.isFinite(v.volume)?Math.min(1,Math.max(0,v.volume)):.7;
  base.shuffle=v.shuffle===true;base.repeat=v.repeat==='all'||v.repeat==='one'?v.repeat:'off';base.revision=typeof v.revision==='number'&&Number.isSafeInteger(v.revision)&&v.revision>=0?v.revision:0;
  if(Array.isArray(v.playlists))for(const p of v.playlists){if(p&&typeof p==='object'&&typeof p.id==='string'&&typeof p.name==='string')base.playlists.push({id:p.id,name:p.name.slice(0,120),tracks:list(p.tracks),favorite:p.favorite===true,...(p.source&&typeof p.source==='object'&&typeof p.source.id==='string'&&typeof p.source.sourceId==='string'?{source:{id:p.source.id.slice(0,8192),sourceId:p.source.sourceId.slice(0,200),name:text(p.source.name),cover:safeUrl(p.source.cover),url:safeUrl(p.source.url)}}:{}),...(typeof p.updatedAt==='number'&&Number.isFinite(p.updatedAt)?{updatedAt:p.updatedAt}:{})});}
  return base;
}
/** Applies validated library operations without starting any playback. */
export function editMusicLibrary(library:MusicLibrary,command:MusicCommand,value:MusicCommandValue={}):void {
  const track=library.tracks.find(t=>t.id===value.id),playlist=library.playlists.find(p=>p.id===value.playlist);
  const requireTrack=()=>{if(!track)throw Error('music-track-missing');return track.id;};
  const requirePlaylist=()=>{if(!playlist)throw Error('music-playlist-missing');return playlist;};
  const name=()=>{if(typeof value.name!=='string'||!value.name.trim()||value.name.length>120)throw Error('music-invalid-name');return value.name.trim();};
  switch(command){
    case 'queue-add':{const id=requireTrack();if(!library.queue.includes(id))library.queue.push(id);break;}
    case 'queue-remove':library.queue=library.queue.filter(id=>id!==requireTrack());break;
    case 'queue-move':{const at=library.queue.indexOf(requireTrack());if(at<0||!Number.isInteger(value.number)||value.number!<0||value.number!>=library.queue.length)throw Error('music-invalid-value');library.queue.splice(value.number!,0,...library.queue.splice(at,1));break;}
    case 'favorite':{const id=requireTrack();library.favorites=library.favorites.includes(id)?library.favorites.filter(x=>x!==id):[...library.favorites,id];break;}
    case 'playlist-create':library.playlists.push({id:randomUUID(),name:name(),tracks:[]});break;
    case 'playlist-delete':library.playlists=library.playlists.filter(p=>p.id!==requirePlaylist().id);break;
    case 'playlist-rename':requirePlaylist().name=name();break;
    case 'playlist-add':{const p=requirePlaylist(),id=requireTrack();if(!p.tracks.includes(id))p.tracks.push(id);break;}
    case 'playlist-remove':{const p=requirePlaylist();p.tracks=p.tracks.filter(id=>id!==requireTrack());break;}
    case 'playlist-move':{const p=requirePlaylist(),at=p.tracks.indexOf(requireTrack());if(at<0||!Number.isInteger(value.number)||value.number!<0||value.number!>=p.tracks.length)throw Error('music-invalid-value');p.tracks.splice(value.number!,0,...p.tracks.splice(at,1));break;}
    case 'playlist-favorite':{const p=requirePlaylist();p.favorite=!p.favorite;break;}
    case 'volume':if(!Number.isFinite(value.number)||value.number!<0||value.number!>1)throw Error('music-invalid-value');library.volume=value.number!;break;
    case 'shuffle':library.shuffle=!library.shuffle;break;
    case 'repeat':if(!['off','all','one'].includes(value.repeat??''))throw Error('music-invalid-value');library.repeat=value.repeat!;break;
    default:throw Error('music-invalid-command');
  }
  library.revision++;
}
/** Chooses queue positions, preserving one-track repeat only for natural completion. */
export function adjacentMusic(library:MusicLibrary,direction:1|-1,ended=false,random=Math.random):string|null {
  if(!library.queue.length)return null;const at=library.queue.indexOf(library.current??'');
  if(ended&&library.repeat==='one')return library.current;
  if(library.shuffle&&library.queue.length>1){const choices=library.queue.filter(id=>id!==library.current);return choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];}
  const next=at+direction;if(next>=0&&next<library.queue.length)return library.queue[next];
  return library.repeat==='all'?library.queue[(next+library.queue.length)%library.queue.length]:null;
}
