/*
 * eIsland - A sleek, Apple Dynamic Island inspired floating widget for Windows, built with Electron.
 * https://github.com/JNTMTMTM/eIsland
 *
 * Copyright (C) 2026 JNTMTMTM
 * Copyright (C) 2026 pyisland.com
 *
 * Original author: JNTMTMTM[](https://github.com/JNTMTMTM)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */

/**
 * @file download.ts
 * @description 下载相关主进程 IPC 处理器注册。
 * @author 鸡哥
 */

import {BrowserDownloadEngine,setBrowserDownloadEngine,commitDownloadedBook} from '../../core/browserDownloadEngine';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import {setBookHttpDownloader} from '../../core/bookDownloadBridge';
import {publicMusicRequest,publicMusicUrl} from '../../music/fusionMusicPluginHost';
import { randomUUID, createHash } from 'node:crypto';
import { isFusionView, broadcastFusion } from '../../system/fusionWindows';
import { grantArtifact } from '../../system/productArtifacts';
import {setSongDownloader,resolveSong,finishSong} from '../../core/musicDownloadBridge';
import {musicDownloadOptions} from '../../music/musicQuality';
import {Aria2Rpc} from '../../core/aria2Rpc';
import {TorrentDownloadEngine} from '../../core/torrentDownloadEngine';
import {ownMediaProcessTree} from '../../core/mediaPrograms';
import { MediaDownloadEngine } from '../../core/mediaDownloadEngine';
import { downloadPreferences, mediaOptions, mediaSourceUrl } from '../../core/mediaDownloadModel';
import type { MediaAnalysis, MediaDownloadStart, DownloadPreferences } from '../../../preload/types/download';
import { dirname, join, basename, resolve } from 'path';
import { MultiThreadDownloadEngine, type DownloadTaskSnapshot } from '../../core/downloadEngine';
import type { RegisterDownloadIpcHandlersOptions, DownloadStartPayload } from './types';
import { PERSIST_DEBOUNCE_MS } from './config/download';

let registered = false;

function isDownloadTaskStatus(value: unknown): value is DownloadTaskSnapshot['status'] {
  return value === 'queued' || value === 'downloading' || value === 'paused' || value === 'completed' || value === 'failed' || value === 'canceled';
}

function toPersistableTask(raw: unknown): DownloadTaskSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.id !== 'string'
    || typeof row.url !== 'string'
    || typeof row.savePath !== 'string'
    || typeof row.fileName !== 'string'
    || typeof row.totalBytes !== 'number'
    || typeof row.downloadedBytes !== 'number'
    || typeof row.progress !== 'number'
    || typeof row.speedBytesPerSecond !== 'number'
    || (row.estimatedFinishAt !== null && typeof row.estimatedFinishAt !== 'number')
    || typeof row.threads !== 'number'
    || !isDownloadTaskStatus(row.status)
    || typeof row.createdAt !== 'number'
    || typeof row.updatedAt !== 'number'
  ) {
    return null;
  }
  return {
    id: row.id,
    engine: row.engine === 'aria2' ? 'aria2' : row.engine === 'browser' ? 'browser' : row.engine === 'yt-dlp' ? 'yt-dlp' : 'http',
    torrent: row.engine === 'aria2' && row.torrent && typeof row.torrent === 'object' && Array.isArray((row.torrent as {files?:unknown}).files) ? row.torrent as DownloadTaskSnapshot['torrent'] : undefined,
    canResume: row.engine === 'browser' ? false : undefined,
    sourceId: typeof row.sourceId === 'string' ? row.sourceId : undefined,
    temporaryDirectory: typeof row.temporaryDirectory === 'string' ? row.temporaryDirectory : undefined,
    bookName: typeof row.bookName === 'string' ? row.bookName : undefined,
    sourcePage: typeof row.sourcePage === 'string' ? row.sourcePage : undefined,
    libraryFolder: row.libraryFolder === 'Books' ? 'Books' : row.libraryFolder==='Music'?'Music':undefined,
    song:row.song&&typeof row.song==='object'&&typeof (row.song as {trackId?:unknown}).trackId==='string'?{trackId:(row.song as {trackId:string}).trackId,options:musicDownloadOptions((row.song as {options:unknown}).options)}:undefined,
    audio:row.audio&&typeof row.audio==='object'?row.audio as DownloadTaskSnapshot['audio']:undefined,
    requiresSourceRefresh: row.engine === 'browser' && row.status !== 'completed' && row.status !== 'canceled',
    sha256: typeof row.sha256 === 'string' && /^[a-f\d]{64}$/i.test(row.sha256) ? row.sha256 : undefined,
    phase: ['queued','resolving','downloading','merging','converting','completed','metadata','verifying','seeding'].includes(String(row.phase)) ? row.phase as DownloadTaskSnapshot['phase'] : undefined,
    batchId: typeof row.batchId === 'string' ? row.batchId : undefined,
    playlistTitle: typeof row.playlistTitle === 'string' ? row.playlistTitle : undefined,
    outputDir: typeof row.outputDir === 'string' ? row.outputDir : undefined,
    mediaEntryIndex: typeof row.mediaEntryIndex === 'number' && Number.isInteger(row.mediaEntryIndex) && row.mediaEntryIndex > 0 ? row.mediaEntryIndex : undefined,
    media: row.engine === 'yt-dlp' ? mediaOptions(row.media) : undefined,
    outputs: Array.isArray(row.outputs) && row.outputs.every(x => typeof x === 'string') ? row.outputs : undefined,
    canPause: row.engine !== 'browser' && (row.status === 'queued' || row.status === 'downloading'),
    url: row.url,
    savePath: row.savePath,
    fileName: row.fileName,
    totalBytes: row.totalBytes,
    downloadedBytes: row.downloadedBytes,
    progress: row.progress,
    speedBytesPerSecond: row.speedBytesPerSecond,
    estimatedFinishAt: row.estimatedFinishAt,
    threads: row.threads,
    status: row.status,
    errorDetail: typeof row.errorDetail === 'string' ? row.errorDetail : undefined,
    errorMessage: typeof row.errorMessage === 'string' ? row.errorMessage : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sortTasks(tasks: DownloadTaskSnapshot[]): DownloadTaskSnapshot[] {
  return tasks.slice().sort((a, b) => b.createdAt - a.createdAt);
}

function normalizeLoadedTasks(raw: unknown): DownloadTaskSnapshot[] {
  if (raw && typeof raw === 'object' && 'version' in raw && 'tasks' in raw) raw = raw.tasks;
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const list: DownloadTaskSnapshot[] = [];
  const seen = new Set<string>();
  raw.forEach((item) => {
    let task: DownloadTaskSnapshot | null;
    try { task = toPersistableTask(item); } catch { return; }
    if (!task) return;
    if (seen.has(task.id)) return;
    seen.add(task.id);
    if (task.status === 'downloading' || task.status === 'queued') {
      task.status = ['yt-dlp','aria2'].includes(task.engine||'') ? 'paused' : 'failed';
      task.speedBytesPerSecond = 0;
      task.estimatedFinishAt = null;
      task.errorMessage = task.errorMessage || '应用重启后任务中断';
      task.updatedAt = now;
    }
    list.push(task);
  });
  return sortTasks(list);
}

function loadPersistedTasks(storePath: string): DownloadTaskSnapshot[] {
  try {
    if (!existsSync(storePath)) return [];
    const content = readFileSync(storePath, 'utf-8');
    if (!content.trim()) return [];
    const parsed = JSON.parse(content);
    return normalizeLoadedTasks(parsed);
  } catch (error) {
    console.error('[Download] load persisted tasks error:', error);
    return [];
  }
}

function savePersistedTasks(storePath: string, tasks: DownloadTaskSnapshot[]): void {
  try {
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(storePath + '.tmp', JSON.stringify({version: 2, tasks: sortTasks(tasks)}, null, 2), 'utf-8');
    renameSync(storePath + '.tmp', storePath);
  } catch (error) {
    console.error('[Download] save persisted tasks error:', error);
  }
}

function sanitizeThreads(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 8;
  return Math.max(1, Math.min(16, Math.floor(value)));
}

function sanitizeSuggestedName(input: unknown): string {
  if (typeof input !== 'string') return `download-${Date.now()}.bin`;
  const safe = input.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return safe || `download-${Date.now()}.bin`;
}

function normalizeStartPayload(payload: unknown): { url: string; savePath?: string; threads: number } {
  const row = (payload ?? {}) as DownloadStartPayload;
  const url = typeof row.url === 'string' ? row.url.trim() : '';
  const savePath = typeof row.savePath === 'string' ? row.savePath.trim() : '';
  const threads = sanitizeThreads(row.threads);
  return {
    url,
    savePath: savePath || undefined,
    threads,
  };
}

/**
 * 注册下载模块相关的 IPC 处理器。
 * @param options - IPC 注册配置项。
 */
export function registerDownloadIpcHandlers(options: RegisterDownloadIpcHandlersOptions): void {
  if (registered) return;
  registered = true;

  const handle = (channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!isFusionView(event.sender) || event.senderFrame !== event.sender.mainFrame) throw Error('untrusted-view');
      return listener(event, ...args);
    });
  };

  const taskStorePath = join(app.getPath('userData'), 'eIsland_store', 'download-tasks.json');
  const taskSnapshotMap = new Map<string, DownloadTaskSnapshot>();
  loadPersistedTasks(taskStorePath).forEach((task) => {
    taskSnapshotMap.set(task.id, task);
  });

  let persistTimer: NodeJS.Timeout | null = null;
  const persistSnapshots = (): void => {
    const tasks = Array.from(taskSnapshotMap.values());
    savePersistedTasks(taskStorePath, tasks);
  };
  const schedulePersist = (): void => {
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistSnapshots();
    }, PERSIST_DEBOUNCE_MS);
  };

  const upsertTaskSnapshot = (task: DownloadTaskSnapshot): void => {
    taskSnapshotMap.set(task.id, task);

  };

  const bookFinishing = new Set<string>(), bookWaiters=new Map<string,{resolve:(path:string)=>void;reject:(error:Error)=>void}>();
  const bookTemporary=(task:DownloadTaskSnapshot):string=>{
    if(!/^[a-f\d-]{36}$/i.test(task.id))throw Error('invalid-download-id');
    const owned=join(dirname(taskStorePath),'book-downloads',task.id);
    if(task.temporaryDirectory!==owned||resolve(dirname(task.savePath))!==resolve(owned))throw Error('invalid-download-temporary');return owned;
  };
  const finishBook=async(task:DownloadTaskSnapshot):Promise<void>=>{
    if(bookFinishing.has(task.id))return;bookFinishing.add(task.id);
    try{bookTemporary(task);const info=await fs.lstat(task.savePath);if(!info.isFile()||info.isSymbolicLink()||task.totalBytes>0&&info.size!==task.totalBytes)throw Error('download-size-mismatch');
      const hash=createHash('sha256');for await(const part of createReadStream(task.savePath))hash.update(part);const sha256=hash.digest('hex');
      const path=await commitDownloadedBook(task.savePath,task.bookName||task.fileName,task.id);
      const completed={...task,sha256,savePath:path,fileName:basename(path),outputs:[path],status:'completed' as const,phase:'completed' as const,progress:1,canPause:false,canResume:false};
      upsertTaskSnapshot(completed);persistSnapshots();broadcastFusion('download:task-updated',completed);bookWaiters.get(task.id)?.resolve(path);bookWaiters.delete(task.id);
      await fs.rm(task.temporaryDirectory!,{recursive:true,force:true}).catch(error=>console.warn('Book download cleanup:',error));
    }catch(error){const value={...task,status:'failed' as const,phase:'merging' as const,progress:Math.min(.999,task.progress),canPause:false,canResume:false,errorMessage:String(error)};upsertTaskSnapshot(value);persistSnapshots();broadcastFusion('download:task-updated',value);bookWaiters.get(task.id)?.reject(Error(String(error)));bookWaiters.delete(task.id);}
    finally{bookFinishing.delete(task.id);}
  };
  const songFinishing=new Map<string,AbortController>();
  const finishSongTask=async(task:DownloadTaskSnapshot):Promise<void>=>{
    if(songFinishing.has(task.id))return;const controller=new AbortController();songFinishing.set(task.id,controller);bookFinishing.add(task.id);
    try{const owned=join(dirname(taskStorePath),'music-downloads',task.id);if(!/^[a-f\d-]{36}$/i.test(task.id)||task.temporaryDirectory!==owned||resolve(dirname(task.savePath))!==resolve(owned)||!task.song)throw Error('invalid-download-temporary');
      const output=await finishSong(task.song,task.savePath,task.id,controller.signal);const value={...task,outputs:output.outputs,savePath:output.outputs[0],fileName:basename(output.outputs[0]),audio:{format:output.format,bitrate:output.bitrate,sampleRate:output.sampleRate,bitsPerSample:output.bitsPerSample,qualityFallback:output.qualityFallback},status:'completed' as const,phase:'completed' as const,progress:1,canPause:false,canResume:false,errorDetail:output.warnings.join('\n'),errorMessage:undefined};upsertTaskSnapshot(value);persistSnapshots();broadcastFusion('download:task-updated',value);await fs.rm(owned,{recursive:true,force:true}).catch(console.warn);
    }catch(error){if(!closing){const value={...task,status:'failed' as const,phase:task.song?.options.format==='mp3'?'converting' as const:'verifying' as const,progress:Math.min(.999,task.progress),canPause:false,canResume:true,errorMessage:String(error)};upsertTaskSnapshot(value);persistSnapshots();broadcastFusion('download:task-updated',value);}}
    finally{songFinishing.delete(task.id);bookFinishing.delete(task.id);}
  };
  const removedTasks=new Set<string>(),httpStopping=new Set<string>();
  const emitToRenderer = (incoming: DownloadTaskSnapshot): void => {
    if(removedTasks.has(incoming.id))return;
    if(httpStopping.has(incoming.id)&&!['paused','canceled'].includes(incoming.status))return;
    const prior=taskSnapshotMap.get(incoming.id);
    const task:DownloadTaskSnapshot={...(prior?.engine==='http'&&incoming.engine==='http'?prior:{}),...incoming};
    if(task.libraryFolder==='Music'&&task.song&&task.status==='completed'){const value={...task,status:'downloading' as const,phase:task.song.options.format==='mp3'?'converting' as const:'verifying' as const,canPause:false,canResume:false,progress:.999};upsertTaskSnapshot(value);persistSnapshots();broadcastFusion('download:task-updated',value);void finishSongTask(value);return;}
    if(task.libraryFolder==='Books'&&task.engine==='http'&&task.status==='completed'){
      upsertTaskSnapshot({...task,status:'downloading',phase:'merging',canPause:false,canResume:false,progress:.999});persistSnapshots();broadcastFusion('download:task-updated',taskSnapshotMap.get(task.id));void finishBook(task);return;
    }
    if(['failed','canceled'].includes(task.status)){bookWaiters.get(task.id)?.reject(Error(task.errorMessage||'job-cancelled'));bookWaiters.delete(task.id);}
    upsertTaskSnapshot(task);
    schedulePersist();
    broadcastFusion('download:task-updated', task);
    queueMicrotask(() => { if (!closing) { pumpHttp(); media.pump(); torrent.pump(); } });
  };

  const browser = new BrowserDownloadEngine(()=>options.getDownloadsPath()||app.getPath('downloads'),emitToRenderer,join(dirname(taskStorePath),'browser-downloads'));
  for(const task of browser.restoredTasks())taskSnapshotMap.set(task.id,task);
  setBrowserDownloadEngine(browser);
  const engine = new MultiThreadDownloadEngine({
    onTaskUpdated: emitToRenderer,
  });

  const preferencesPath = join(dirname(taskStorePath), 'download-preferences.json');
  let preferences: DownloadPreferences = {version: 1, concurrency: 2, presets: []};
  try { preferences = downloadPreferences(JSON.parse(readFileSync(preferencesPath, 'utf8'))); } catch {}
  let closing = false;
  const pendingHttp = new Map<string, {value: DownloadTaskSnapshot; resume: boolean}>();
  const launchingHttp = new Map<string, AbortController>();
  const httpLaunchWork=new Map<string,Promise<unknown>>();
  const httpCount = (): number => new Set([...engine.listTasks().filter(x => x.status === 'downloading').map(x => x.id), ...launchingHttp.keys()]).size;
  const media = new MediaDownloadEngine({onUpdate: emitToRenderer, capacity: () => preferences.concurrency - httpCount() - torrent.activeCount()}, Array.from(taskSnapshotMap.values()));
  const aria2Path=app.isPackaged?join(process.resourcesPath,'download-runtime','aria2c.exe'):join(app.getAppPath(),'resources','download-runtime','aria2c.exe');
  const torrent=new TorrentDownloadEngine({rpc:new Aria2Rpc(aria2Path,process.platform==='win32'?ownMediaProcessTree:undefined),root:join(dirname(taskStorePath),'torrent-downloads'),preferences:()=>preferences,capacity:()=>preferences.concurrency-httpCount()-media.activeCount(),updated:emitToRenderer},Array.from(taskSnapshotMap.values()));
  const pumpHttp = (): void => {
    if (closing) return;
    let capacity = preferences.concurrency - httpCount() - media.activeCount() - torrent.activeCount();
    for (const [id, queued] of pendingHttp) {
      if (capacity-- <= 0) break;
      pendingHttp.delete(id);
      const controller = new AbortController(); launchingHttp.set(id, controller);
      const work=(async()=>{
        let value=queued.value,request=value.libraryFolder==='Books'?protectedBookRequest:undefined;
        if(value.song){emitToRenderer({...value,phase:'resolving'});const result=await resolveSong(value.song,controller.signal);controller.signal.throwIfAborted();const owned=join(dirname(taskStorePath),'music-downloads',id);await fs.mkdir(owned,{recursive:true});value={...value,url:result.url,fileName:result.name,savePath:join(owned,result.name),temporaryDirectory:owned};emitToRenderer(value);const headers=result.headers;request=(input,init)=>protectedBookRequest(input,{...init,headers:{...headers,...Object.fromEntries(new Headers(init?.headers))}});}
        if(queued.resume&&engine.getTask(id))return engine.resumeDownload(id,controller.signal,value.song?{url:value.url,request:request!}:undefined);
        return engine.startDownload({id,url:value.url,savePath:value.savePath||undefined,threads:value.threads,inferName:!value.song&&!value.libraryFolder&&Boolean(value.outputDir),defaultDir:value.outputDir||options.getDownloadsPath(),signal:controller.signal,request});
      })();
      httpLaunchWork.set(id,work);
      void work.catch(reason => {
        if (!controller.signal.aborted) emitToRenderer({...queued.value, status: 'failed', canPause: false, errorMessage: reason instanceof Error ? reason.message : String(reason), updatedAt: Date.now()});
      }).finally(() => {launchingHttp.delete(id);httpLaunchWork.delete(id); pumpHttp(); media.pump(); torrent.pump();});
    }
  };
  const protectedBookRequest:typeof fetch=async(input,init)=>{
    let url=await publicMusicUrl(String(input));
    for(let n=0;n<6;n++){const response=await publicMusicRequest(url,{...init,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(60000)])});
      if(response.status>=300&&response.status<400){const next=response.headers.get('location');await response.body?.cancel();if(!next)throw Error('invalid-redirect');url=await publicMusicUrl(new URL(next,url).href);continue;}
      if(Number(response.headers.get('content-length')||0)>268435456){await response.body?.cancel();throw Error('file-too-large');}return response;
    }throw Error('redirect-limit');
  };
  const cleanupHttpLibrary=async(value:DownloadTaskSnapshot):Promise<void>=>{if(value.libraryFolder==='Music'&&value.song&&value.temporaryDirectory===join(dirname(taskStorePath),'music-downloads',value.id))await fs.rm(value.temporaryDirectory,{recursive:true,force:true});if(value.libraryFolder==='Books'&&value.engine==='http')await fs.rm(bookTemporary(value),{recursive:true,force:true});};
  const stopHttp = async(id: string, command: 'paused' | 'canceled'): Promise<boolean> => {
    const value = taskSnapshotMap.get(id); if (bookFinishing.has(id)) return false; if (!value || !['queued', 'downloading', 'paused', 'failed'].includes(value.status)) return false;
    if(httpStopping.has(id))return false;httpStopping.add(id);try{
    if (pendingHttp.has(id) || launchingHttp.has(id)) {
      pendingHttp.delete(id); launchingHttp.get(id)?.abort();
      emitToRenderer({...value, status: command, canPause: false, updatedAt: Date.now()});await httpLaunchWork.get(id)?.catch(()=>{});if(engine.getTask(id)?.status==='downloading'){if(command==='canceled')engine.cancelDownload(id);else engine.pauseDownload(id);}await engine.waitStopped(id);
      if(command==='canceled')await cleanupHttpLibrary(taskSnapshotMap.get(id)||value);return true;
    }
    const accepted=command === 'paused' ? engine.pauseDownload(id) : engine.cancelDownload(id);if(accepted){await engine.waitStopped(id);if(command==='canceled')await cleanupHttpLibrary(value);}return accepted;
    }finally{httpStopping.delete(id);}
  };
  setSongDownloader(songs=>{const batchId=randomUUID(),ids:string[]=[];for(const song of songs){const id=randomUUID(),now=Date.now(),task:DownloadTaskSnapshot={id,batchId,url:'song:'+song.trackId,fileName:song.name||song.trackId,savePath:'',song,libraryFolder:'Music',engine:'http',status:'queued',phase:'queued',canPause:true,canResume:false,totalBytes:0,downloadedBytes:0,progress:0,speedBytesPerSecond:0,estimatedFinishAt:null,threads:1,createdAt:now,updatedAt:now};pendingHttp.set(id,{value:task,resume:false});emitToRenderer(task);ids.push(id);}persistSnapshots();pumpHttp();return ids;});
  setBookHttpDownloader(async request=>{
    request.signal.throwIfAborted();const id=randomUUID(),now=Date.now(),temporaryDirectory=join(dirname(taskStorePath),'book-downloads',id);await fs.mkdir(temporaryDirectory,{recursive:true});
    const task:DownloadTaskSnapshot={id,url:request.url,fileName:request.name,savePath:join(temporaryDirectory,request.name),temporaryDirectory,bookName:request.name,sourceId:request.sourceId,libraryFolder:'Books',engine:'http',status:'queued',phase:'queued',canPause:true,totalBytes:0,downloadedBytes:0,progress:0,speedBytesPerSecond:0,estimatedFinishAt:null,threads:1,createdAt:now,updatedAt:now};
    const result=new Promise<string>((resolve,reject)=>bookWaiters.set(id,{resolve,reject}));
    const cancel=()=>{void stopHttp(id,'canceled').then(accepted=>{if(accepted){bookWaiters.get(id)?.reject(Error('job-cancelled'));bookWaiters.delete(id);}}).catch(error=>bookWaiters.get(id)?.reject(error));};
    request.signal.addEventListener('abort',cancel,{once:true});pendingHttp.set(id,{value:task,resume:false});emitToRenderer(task);persistSnapshots();pumpHttp();if(request.signal.aborted)cancel();
    try{return await result;}finally{request.signal.removeEventListener('abort',cancel);}
  });
  for(const task of taskSnapshotMap.values())if(task.engine==='http'&&task.libraryFolder==='Books'&&task.phase==='merging'&&task.status!=='completed'&&task.status!=='canceled')void finishBook(task);
  const analyses = new WeakMap<Electron.WebContents, Map<string, MediaAnalysis>>();
  const requests = new WeakMap<Electron.WebContents, Set<string>>();
  const directories = new WeakMap<Electron.WebContents, Map<string, string>>();
  const torrentDrafts=new WeakMap<Electron.WebContents,Set<string>>();
  const requestOwners = new Map<string, Electron.WebContents>();
  const ownedRequest = (sender: Electron.WebContents, id: string): Set<string> => {
    if (requestOwners.has(id)) throw Error('media-invalid-request');
    let owned = requests.get(sender);
    if (!owned) {
      owned = new Set<string>(); requests.set(sender, owned);
      sender.once('destroyed', () => {
        for (const request of owned!) {media.cancelAnalysis(request);torrent.cancelInspection(request); requestOwners.delete(request);}
        for(const draft of torrentDrafts.get(sender)||[])void torrent.discard(draft).catch(console.warn);
        owned!.clear();
      });
    }
    owned.add(id); requestOwners.set(id, sender); return owned;
  };
  handle('download:torrent-inspect',async(event,requestId,url,path)=>{
    if(typeof requestId!=='string'||!/^[\w-]{1,100}$/.test(requestId)||url!==undefined&&typeof url!=='string'||path!==undefined&&typeof path!=='string')throw Error('bt-invalid-source');
    const owned=ownedRequest(event.sender,requestId);
    try{
      let bytes:Uint8Array|undefined;
      if(!url){
        if(!path){const window=BrowserWindow.fromWebContents(event.sender);if(!window)throw Error('untrusted-view');const result=await dialog.showOpenDialog(window,{filters:[{name:'BitTorrent',extensions:['torrent']}],properties:['openFile']});if(result.canceled)return null;path=result.filePaths[0];}
        if(typeof path!=='string'||!path.toLowerCase().endsWith('.torrent'))throw Error('bt-invalid-source');
        const info=await fs.lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>10000000)throw Error('file-too-large');bytes=await fs.readFile(path);
      }
      const value=await torrent.inspect(requestId,{url:typeof url==='string'?url:undefined,bytes});
      if(event.sender.isDestroyed()){await torrent.discard(value.id);throw Error('job-cancelled');}
      const drafts=torrentDrafts.get(event.sender)||new Set<string>();drafts.add(value.id);torrentDrafts.set(event.sender,drafts);return value;
    }finally{owned.delete(requestId);requestOwners.delete(requestId);}
  });
  handle('download:torrent-cancel',(event,id)=>{
    if(typeof id!=='string')return false;
    if(requests.get(event.sender)?.has(id))return torrent.cancelInspection(id);
    const owned=torrentDrafts.get(event.sender);if(!owned?.has(id))return false;owned.delete(id);return torrent.discard(id);
  });
  handle('download:torrent-start',async(event,id,selected,directoryId)=>{
    if(typeof id!=='string'||!torrentDrafts.get(event.sender)?.has(id)||!Array.isArray(selected)||selected.some(x=>typeof x!=='number'))throw Error('bt-invalid-selection');
    const directory=typeof directoryId==='string'?directories.get(event.sender)?.get(directoryId):options.getDownloadsPath()||app.getPath('downloads');if(!directory)throw Error('file-not-authorized');
    const task=await torrent.start(id,selected,await fs.realpath(directory));torrentDrafts.get(event.sender)!.delete(id);persistSnapshots();return task;
  });
  handle('download:analyze', async (event, rawUrls, requestId) => {
    if (!Array.isArray(rawUrls) || rawUrls.some(x => typeof x !== 'string') || typeof requestId !== 'string') throw Error('media-invalid-request');
    const owned = ownedRequest(event.sender, requestId);
    try {
      const result = await media.analyze(rawUrls, requestId);
      const cache = analyses.get(event.sender) ?? new Map<string, MediaAnalysis>(); analyses.set(event.sender, cache);
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(result.id, result); return result;
    } finally { owned.delete(requestId); requestOwners.delete(requestId); }
  });
  handle('download:inspect', async (event, analysisId, entryId) => {
    const analysis = typeof analysisId === 'string' ? analyses.get(event.sender)?.get(analysisId) : undefined;
    const item = analysis?.entries.find(x => x.id === entryId); if (!item) throw Error('media-invalid-request');
    const request = randomUUID(), owned = ownedRequest(event.sender, request);
    try {
      const result = await media.analyze([item.url], request), detail = item.playlistIndex ? result.entries.find(x => x.playlistIndex === item.playlistIndex) : result.entries[0];
      if (!detail) throw Error(result.errors[0]?.message || 'media-no-results');
      const value = {...detail, id: item.id, playlistTitle: item.playlistTitle};
      analysis!.entries = analysis!.entries.map(x => x.id === entryId ? value : x); return value;
    } finally { owned.delete(request); requestOwners.delete(request); }
  });
  handle('download:cancel-analysis', (event, id) => typeof id === 'string' && requests.get(event.sender)?.has(id) ? media.cancelAnalysis(id) : false);
  handle('download:media-start', (event, raw) => {
    if (!raw || typeof raw !== 'object') throw Error('media-invalid-request');
    const value = raw as MediaDownloadStart, result = analyses.get(event.sender)?.get(value.analysisId);
    if (!result || !Array.isArray(value.entryIds) || !value.entryIds.length || value.entryIds.some(id => typeof id !== 'string')) throw Error('media-invalid-request');
    const selected = [...new Set(value.entryIds)].map(id => { const item = result.entries.find(x => x.id === id); if (!item) throw Error('media-invalid-request'); return item; });
    const directory = value.directoryId ? directories.get(event.sender)?.get(value.directoryId) : options.getDownloadsPath();
    if (!directory) throw Error('file-not-authorized');
    return media.enqueue(selected, mediaOptions(value.options), directory);
  });
  handle('download:files-start',async(event,rawUrls,directoryId)=>{
    if(!Array.isArray(rawUrls)||!rawUrls.length||rawUrls.length>1000)throw Error('media-invalid-request');const urls=[...new Set(rawUrls.map(mediaSourceUrl))];
    const directory=typeof directoryId==='string'?directories.get(event.sender)?.get(directoryId):options.getDownloadsPath()||app.getPath('downloads');if(!directory)throw Error('file-not-authorized');await fs.mkdir(directory,{recursive:true});const info=await fs.lstat(directory);if(info.isSymbolicLink()||!info.isDirectory())throw Error('file-not-authorized');
    const now=Date.now(),batchId=urls.length>1?randomUUID():undefined,tasks=urls.map(url=>{let name=new URL(url).pathname.split('/').at(-1)||'download.bin';try{name=decodeURIComponent(name);}catch{}const fileName=sanitizeSuggestedName(name);return {id:randomUUID(),url,fileName,savePath:join(directory,fileName),outputDir:directory,batchId,engine:'http' as const,phase:'queued' as const,status:'queued' as const,canPause:true,totalBytes:0,downloadedBytes:0,progress:0,speedBytesPerSecond:0,estimatedFinishAt:null,threads:8,createdAt:now,updatedAt:now};});
    for(const task of tasks){pendingHttp.set(task.id,{value:task,resume:false});emitToRenderer(task);}persistSnapshots();pumpHttp();return tasks;
  });
  handle('download:preferences', () => structuredClone(preferences));
  handle('download:save-preferences', async (_event, raw) => {
    const next = downloadPreferences(raw); mkdirSync(dirname(preferencesPath), {recursive: true});
    writeFileSync(preferencesPath + '.tmp', JSON.stringify(next), 'utf8'); renameSync(preferencesPath + '.tmp', preferencesPath);
    preferences = next; await torrent.configure(); pumpHttp(); media.pump(); torrent.pump(); return structuredClone(preferences);
  });
  handle('download:pick-directory', async event => {
    const window = BrowserWindow.fromWebContents(event.sender); if (!window) throw Error('untrusted-view');
    const selection = await dialog.showOpenDialog(window, {defaultPath: options.getDownloadsPath(), properties: ['openDirectory', 'createDirectory']});
    if (selection.canceled || !selection.filePaths[0]) return null;
    const id = randomUUID(), path = selection.filePaths[0], grants = directories.get(event.sender) ?? new Map<string, string>();
    grants.set(id, path); directories.set(event.sender, grants); return {id, path};
  });
  handle('download:artifacts', (event, id) => {
    const value = typeof id === 'string' ? taskSnapshotMap.get(id) : undefined;
    if (!value || value.status !== 'completed') throw Error('media-task-unavailable');
    return (value.outputs?.length ? value.outputs : [value.savePath]).map(path => grantArtifact(event.sender, path));
  });
  app.once('before-quit', () => { closing = true; for(const controller of songFinishing.values())controller.abort();browser.close(); for (const controller of launchingHttp.values()) controller.abort(); for (const queued of pendingHttp.values()) emitToRenderer({...queued.value, status: 'paused', canPause: false}); pendingHttp.clear(); media.close(); torrent.close(); for (const task of engine.listTasks()) if (task.status === 'downloading') engine.pauseDownload(task.id); if (persistTimer) clearTimeout(persistTimer); persistSnapshots(); });

  handle('download:start', async (_event, payload: unknown) => {
    try {
      const normalized = normalizeStartPayload(payload);
      if (!normalized.url) {
        return { ok: false, message: '下载地址不能为空' } as const;
      }
      const url = mediaSourceUrl(normalized.url), now = Date.now();
      const fileName = sanitizeSuggestedName(new URL(url).pathname.split('/').at(-1) || 'download.bin');
      const task: DownloadTaskSnapshot = {id: randomUUID(), url, savePath: normalized.savePath || join(options.getDownloadsPath(), fileName), fileName,
        totalBytes: 0, downloadedBytes: 0, progress: 0, speedBytesPerSecond: 0, estimatedFinishAt: null, threads: normalized.threads,
        engine: 'http', phase: 'queued', status: 'queued', canPause: true, createdAt: now, updatedAt: now};
      pendingHttp.set(task.id, {value: task, resume: false}); emitToRenderer(task); pumpHttp();

      return { ok: true, task } as const;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message } as const;
    }
  });

  handle('download:cancel', (_event, taskId: unknown) => {
    const id = typeof taskId === 'string' ? taskId.trim() : '';
    if (!id) return false;
    return taskSnapshotMap.get(id)?.engine === 'aria2' ? torrent.control(id,'cancel').then(Boolean) : taskSnapshotMap.get(id)?.engine === 'browser' ? Boolean(browser.control(id,'cancel')) : taskSnapshotMap.get(id)?.engine === 'yt-dlp' ? media.stop(id, 'canceled') : stopHttp(id, 'canceled');
  });

  handle('download:pause', (_event, taskId: unknown) => {
    const id = typeof taskId === 'string' ? taskId.trim() : '';
    if (!id) return false;
    return taskSnapshotMap.get(id)?.engine === 'aria2' ? torrent.control(id,'pause').then(Boolean) : taskSnapshotMap.get(id)?.engine === 'browser' ? Boolean(browser.control(id,'pause')) : taskSnapshotMap.get(id)?.engine === 'yt-dlp' ? media.stop(id, 'paused') : stopHttp(id, 'paused');
  });

  handle('download:resume', async (_event, taskId: unknown) => {
    try {
      const id = typeof taskId === 'string' ? taskId.trim() : '';
      if (!id) return { ok: false, message: '任务标识不能为空' } as const;
      const previous = taskSnapshotMap.get(id);
      if (!previous) throw Error('media-task-unavailable');
      let task: DownloadTaskSnapshot;
      if (previous.engine === 'browser') {const resumed=browser.control(id,'resume');if(!resumed)throw Error('browser-source-refresh-required');task=resumed;}
      else if (previous.engine === 'yt-dlp') task = media.resume(id);
      else if(previous.engine==='aria2'){const resumed=await torrent.control(id,'resume');if(!resumed)throw Error('media-task-unavailable');task=resumed;}
      else if(previous.song&&previous.status==='failed'&&['converting','verifying'].includes(previous.phase||'')){task={...previous,status:'downloading',canPause:false,canResume:false,errorMessage:undefined};upsertTaskSnapshot(task);broadcastFusion('download:task-updated',task);void finishSongTask(task);}
      else if(previous.libraryFolder==='Books'&&previous.phase==='merging'&&previous.status==='failed'){
        task={...previous,status:'downloading',phase:'merging',canPause:false,canResume:false,errorMessage:undefined};
        upsertTaskSnapshot(task);broadcastFusion('download:task-updated',task);void finishBook(task);
      }
      else {
        if (!['paused', 'failed'].includes(previous.status) || launchingHttp.has(id)||httpStopping.has(id)) throw Error('media-task-unavailable');
        task = {...previous, status: 'queued', phase: 'queued', canPause: true, errorMessage: undefined};
        pendingHttp.set(id, {value: task, resume: true}); emitToRenderer(task); pumpHttp();
      }
      upsertTaskSnapshot(task);
      schedulePersist();
      return { ok: true, task } as const;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message } as const;
    }
  });

  handle('download:remove', async(_event, taskId: unknown) => {
    const id = typeof taskId === 'string' ? taskId.trim() : '';
    if (!id) return false;
    const snapshot = taskSnapshotMap.get(id);
    if (!snapshot) return false;
    if(bookFinishing.has(id))return false;

    if(snapshot.engine==='aria2')return torrent.remove(id).then(removed=>{if(removed){removedTasks.add(id);taskSnapshotMap.delete(id);schedulePersist();}return removed;});
    const removedFromEngine = snapshot.engine === 'browser' ? browser.remove(id) : snapshot.engine === 'yt-dlp' ? media.remove(id) : engine.removeTask(id);
    if (!removedFromEngine && ['downloading', 'queued'].includes(snapshot.status)) {
      return false;
    }

    await httpLaunchWork.get(id)?.catch(()=>{});await engine.waitStopped(id);
    if(snapshot.song&&snapshot.status!=='completed'&&snapshot.temporaryDirectory===join(dirname(taskStorePath),'music-downloads',id))void fs.rm(snapshot.temporaryDirectory,{recursive:true,force:true}).catch(console.warn);
    if(snapshot.libraryFolder==='Books'&&snapshot.engine==='http'&&snapshot.status!=='completed'){try{const owned=bookTemporary(snapshot);void fs.rm(owned,{recursive:true,force:true}).catch(console.warn);}catch{}}
    removedTasks.add(id);taskSnapshotMap.delete(id);
    schedulePersist();
    return true;
  });

  handle('download:list', () => {
    return sortTasks(Array.from(taskSnapshotMap.values()));
  });

  handle('download:get', (_event, taskId: unknown) => {
    const id = typeof taskId === 'string' ? taskId.trim() : '';
    if (!id) return null;
    return taskSnapshotMap.get(id) ?? null;
  });

  handle('download:pick-save-path', async (event, suggestedName: unknown) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow();
      if (!win) return null;
      const fileName = sanitizeSuggestedName(suggestedName);
      const result = await dialog.showSaveDialog(win, {
        title: '选择保存位置',
        defaultPath: join(options.getDownloadsPath(), fileName),
      });
      if (result.canceled) return null;
      return result.filePath ?? null;
    } catch (error) {
      console.error('[Download] pick save path error:', error);
      return null;
    }
  });

  handle('download:get-default-dir', () => {
    return options.getDownloadsPath() || app.getPath('downloads');
  });
}
