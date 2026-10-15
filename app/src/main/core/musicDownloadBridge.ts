/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file musicDownloadBridge.ts @description Song resolution and serialized Music commits through the common download queue. @author 鸡哥 */
import type {MusicDownloadOptions} from '../../preload/types/fusionMusic';
export interface SongDownload {name?:string;trackId:string;options:MusicDownloadOptions;}
export interface SongResolution {url:string;name:string;headers?:Record<string,string>;}
export interface SongOutput {outputs:string[];format:string;bitrate:number|null;sampleRate:number;bitsPerSample:number;qualityFallback:boolean;warnings:string[];}
let start:((songs:SongDownload[])=>string[])|undefined,resolve:((song:SongDownload,signal:AbortSignal)=>Promise<SongResolution>)|undefined,finish:((song:SongDownload,file:string,id:string,signal:AbortSignal)=>Promise<SongOutput>)|undefined,commit:((file:string,name:string,id:string)=>Promise<string>)|undefined;
/** Registers the persistent shared queue; no separate song history is created. */
export function setSongDownloader(handler:(songs:SongDownload[])=>string[]):void{start=handler;}
/** Registers provider work owned by the music service. */
export function setSongResolver(resolver:NonNullable<typeof resolve>,finalizer:NonNullable<typeof finish>):void{resolve=resolver;finish=finalizer;}
/** Registers the same file coordinator used for library moves and migration. */
export function setMusicCommit(handler:NonNullable<typeof commit>):void{commit=handler;}
/** Enqueues stable song identities, so a retry always resolves a fresh stream. */
export function downloadSongs(songs:SongDownload[]):string[]{if(!start)throw Error('download-engine-unavailable');return start(songs);}
/** Obtains a fresh stream only when a queued song starts. */
export function resolveSong(song:SongDownload,signal:AbortSignal):Promise<SongResolution>{if(!resolve)return Promise.reject(Error('music-source-missing'));return resolve(song,signal);}
/** Verifies, optionally converts and registers final files. */
export function finishSong(song:SongDownload,file:string,id:string,signal:AbortSignal):Promise<SongOutput>{if(!finish)return Promise.reject(Error('music-source-missing'));return finish(song,file,id,signal);}
/** Commits a completed audio/sidecar through the persistent operation journal. */
export function commitMusic(file:string,name:string,id:string):Promise<string>{if(!commit)return Promise.reject(Error('music-importer-unavailable'));return commit(file,name,id);}
