/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file fusionBrowserService.ts @description 主进程保留隔离网页与媒体实例，跨页面不重新加载。 @author 鸡哥 */
import {bindBrowserDownloads,markBookBrowser,clearBookBrowser} from '../core/browserDownloadEngine';
import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell, WebContentsView, type WebFrameMain } from 'electron';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { createReadStream, statSync,readFileSync } from 'fs';
import {createRequire} from 'node:module';
import type {LibraryArticle} from '../../preload/types/fusionLibrary';
import {getLibraryStore} from './libraryStore';
import { Readable } from 'stream';
import { FusionToolStore, normalizeWebUrl } from './fusionToolStore';
import { broadcastFusion, isFusionView } from './fusionWindows';
import { registerFusionColorPicker } from './fusionColorPicker';
import { acquireFusionMedia, registerMediaParticipant, pauseAllFusionMedia, hasRegisteredFusionMedia } from './fusionMediaCoordinator';
import type { WebKind, WebRect, WebSnapshot, MediaCommand, MediaControlResult } from '../../preload/types/fusionTools';

interface Guest { view: WebContentsView; owner: BrowserWindow | null; state: WebSnapshot; pauseMute?: boolean; }
const guests = new Map<WebKind, Guest>();
/** Fixed extraction command: external sites never receive application preload or arbitrary IPC scripts. */
async function extractArticle(contents:Electron.WebContents,url:string):Promise<LibraryArticle>{
 const requireModule=createRequire(import.meta.url),core=readFileSync(requireModule.resolve('@mozilla/readability/Readability.js'),'utf8');
 const raw:unknown=await withDeadline(contents.executeJavaScript('(()=>{'+core+';const a=new Readability(document.cloneNode(true),{maxElemsToParse:100000}).parse();if(!a)return null;return {title:a.title,html:a.content,excerpt:a.excerpt};})()'),15000);
 if(!raw||typeof raw!=='object'||!('html'in raw)||typeof raw.html!=='string'||raw.html.length>5_000_000||!raw.html.trim())throw Error('article-unavailable');
 return {id:randomUUID(),url,html:raw.html,title:'title'in raw&&typeof raw.title==='string'?raw.title.slice(0,200):new URL(url).hostname,excerpt:'excerpt'in raw&&typeof raw.excerpt==='string'?raw.excerpt.slice(0,300):'',progress:0,highlights:[],savedAt:Date.now()};
}
export async function readFusionWebArticle():Promise<LibraryArticle>{const guest=guests.get('browser');if(!guest||guest.view.webContents.isDestroyed())throw Error('article-unavailable');return extractArticle(guest.view.webContents,normalizeWebUrl(guest.view.webContents.getURL()));}
/** Parses an already cleaned, inert document with the same Readability core. No app APIs or remote subresources. */
export async function parseFusionArticleHtml(html:string,url:string,signal:AbortSignal):Promise<LibraryArticle>{
 signal.throwIfAborted();const partition='float-reader-'+randomUUID(),sandbox=session.fromPartition(partition);sandbox.setPermissionRequestHandler((_w,_p,cb)=>cb(false));sandbox.setPermissionCheckHandler(()=>false);sandbox.webRequest.onBeforeRequest((details,cb)=>cb({cancel:!details.url.startsWith('data:')}));
 const view=new WebContentsView({webPreferences:{partition,sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false}}),close=()=>{if(!view.webContents.isDestroyed())view.webContents.close();};signal.addEventListener('abort',close,{once:true});
 try{await withDeadline(view.webContents.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html)),15000);signal.throwIfAborted();return await extractArticle(view.webContents,url);}finally{signal.removeEventListener('abort',close);close();}
}
const withDeadline = async <T>(work: Promise<T>, timeout = 1200): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([work, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('media-timeout')), timeout); timer.unref(); })]); } finally { clearTimeout(timer!); }
};
const mediaFiles = new Map<string, string>();
let activeKind: WebKind | null = null;
const empty = (kind: WebKind): WebSnapshot => ({ kind, url: '', title: '', loading: false, error: '', back: false, forward: false, active: false, playing: false, muted: false, controllable: false, time: 0, duration: 0, width: 0, height: 0 });
const snapshot = (): WebSnapshot[] => (['browser', 'video'] as const).map(kind => guests.get(kind)?.state || empty(kind));
const publish = (): void => broadcastFusion('fusion:web:changed', snapshot());

/** 播放实例存在时，收起仍保留可操作的播放条。
 * @returns 是否存在尚未关闭的媒体来源。
 */
export function hasFusionMedia(): boolean { return hasRegisteredFusionMedia() || activeKind !== null && Boolean(guests.get(activeKind)?.state.active); }

const readMediaScript = `(() => {
  const items = [...document.querySelectorAll('video,audio')];
  const media = items.find(m => !m.paused && !m.ended) || items.find(m => m.readyState > 0);
  if (!media) return null;
  return { playing: !media.paused && !media.ended, time: media.currentTime || 0,
    duration: Number.isFinite(media.duration) ? media.duration : 0,
    width: media.videoWidth || 0, height: media.videoHeight || 0, muted: media.muted || media.volume === 0 };
})()`;
async function mediaFrame(guest: Guest): Promise<{ frame: WebFrameMain; media: Partial<WebSnapshot> } | null> {
  const frames = guest.view.webContents.mainFrame.framesInSubtree;
  const results = await Promise.allSettled(frames.map(async frame => ({ frame, media: await withDeadline(frame.executeJavaScript(readMediaScript)) as Partial<WebSnapshot> | null })));
  const ready = results.flatMap(result => result.status === 'fulfilled' && result.value.media ? [result.value as { frame: WebFrameMain; media: Partial<WebSnapshot> }] : []);
  return ready.find(item => item.media.playing) || ready[0] || null;
}
/** 停声优先，固定脚本暂停所有实际媒体；不把静音误报成暂停。 */
export async function pauseFusionMedia(): Promise<MediaControlResult> {
  const current = activeKind ? guests.get(activeKind) : undefined;
  guests.forEach(guest => {
    if (guest.pauseMute === undefined) guest.pauseMute = guest.view.webContents.isAudioMuted();
    guest.view.webContents.setAudioMuted(true); guest.state.muted = true;
  });
  const targets = current ? [current] : [];
  const result = await Promise.allSettled(targets.flatMap(guest => guest.view.webContents.mainFrame.framesInSubtree.map(frame => withDeadline(frame.executeJavaScript(
    "(() => { const a=[...document.querySelectorAll('video,audio')]; a.forEach(m=>m.pause()); return { count:a.length, paused:a.every(m=>m.paused) }; })()"
  )))));
  const accessible = result.flatMap(item => item.status === 'fulfilled' ? [item.value as {count:number;paused:boolean}] : []);
  const controllable = accessible.some(item => item.count > 0);
  const paused = !current || (controllable && result.every(item => item.status === 'fulfilled') && accessible.every(item => item.paused));
  if (current && paused) current.state.playing = false;
  if (current) { const actual = await mediaFrame(current).catch(() => null); if (actual) Object.assign(current.state, actual.media); current.state.muted = true; }
  publish(); return { paused, muted: true, controllable };
}
function activate(kind: WebKind): void {
  activeKind = kind;
  guests.forEach((guest, key) => {
    guest.view.webContents.setAudioMuted(true);
    guest.state.active = key === kind;
    guest.view.webContents.backgroundThrottling = key !== kind;
  });
  app.emit('fusion-media-active');
  publish();
  void acquireFusionMedia('web').then(()=>{if(activeKind===kind){const guest=guests.get(kind);if(guest&&!guest.view.webContents.isDestroyed())guest.view.webContents.setAudioMuted(guest.state.muted);}}).catch(()=>{});
}
function detach(guest: Guest): void {
  if (guest.owner && !guest.owner.isDestroyed()) guest.owner.contentView.removeChildView(guest.view);
  guest.owner = null;
}
function createGuest(kind: WebKind): Guest {
  const existing = guests.get(kind);
  if (existing) return existing;
  const view = new WebContentsView({ webPreferences: { partition: 'persist:fusion-browser', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
  const guest: Guest = { view, owner: null, state: empty(kind) };
  guests.set(kind, guest);
  const contents = view.webContents;
  const changed = (): void => {
    if (contents.isDestroyed()) return;
    guest.state.back = contents.navigationHistory.canGoBack();
    guest.state.forward = contents.navigationHistory.canGoForward();
    publish();
  };
  contents.on('did-start-loading', () => { guest.state.loading = true; guest.state.error = ''; changed(); });
  contents.on('did-stop-loading', () => { guest.state.loading = false; changed(); });
  contents.on('did-fail-load', (_event, code, description, _url, mainFrame) => { if (mainFrame && code !== -3) { guest.state.error = description; changed(); } });
  contents.on('render-process-gone', (_event, details) => { guest.state.error = details.reason; guest.state.playing = false; changed(); });
  contents.on('page-title-updated', (_event, title) => { if (!guest.state.url.startsWith('fusion-file:')) guest.state.title = title.slice(0, 300); changed(); });
  contents.on('did-navigate', (_event, url) => { if (/^https?:/i.test(url)) guest.state.url = url; changed(); });
  contents.on('did-navigate-in-page', (_event, url, isMainFrame) => { if (isMainFrame && /^https?:/i.test(url)) guest.state.url = url; changed(); });
  contents.on('media-started-playing', () => {
    if (guest.owner && guest.pauseMute !== undefined) { guest.state.muted = guest.pauseMute; guest.pauseMute = undefined; }
    guest.state.playing = true; activate(kind);
  });
  contents.on('media-paused', () => { guest.state.playing = false; publish(); });
  contents.on('will-navigate', (event, url) => { try { normalizeWebUrl(url); } catch { event.preventDefault(); } });
  contents.on('will-redirect', (event, url) => { try { normalizeWebUrl(url); } catch { event.preventDefault(); } });
  contents.setWindowOpenHandler(({ url }) => {
    try { const target = normalizeWebUrl(url); void contents.loadURL(target).catch(error => { guest.state.error = String(error); publish(); }); } catch { /* 非网页协议不能创建窗口。 */ }
    return { action: 'deny' };
  });
  bindBrowserDownloads(contents.session);
  return guest;
}

export async function openBookWebsite(url:string,sourceId:string):Promise<void>{const guest=createGuest('browser');markBookBrowser(guest.view.webContents,sourceId);guest.state.url=normalizeWebUrl(url);guest.state.title=new URL(url).hostname;guest.state.error='';await guest.view.webContents.loadURL(guest.state.url);publish();}

/** 注册工具数据和有限网页命令。
 * @returns 无返回值；资源在应用退出时释放。
 */
export let playFusionNativeFile:(host:BrowserWindow,requested?:string,autoplay?:boolean)=>Promise<boolean>=async()=>{throw Error('media-service-not-ready');};

export function registerFusionBrowser(): void {
  registerMediaParticipant('web',{pause:async()=>{const result=await pauseFusionMedia();guests.forEach(guest=>{guest.state.active=false;});publish();return result;}});
  registerFusionColorPicker();
  const store = new FusionToolStore(join(app.getPath('userData'), 'fusion-workspace', 'tools-v1.json'));
  const browserSession = session.fromPartition('persist:fusion-browser');
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.protocol.handle('fusion-file', request => {
    const token = new URL(request.url).pathname.slice(1);
    const file = mediaFiles.get(token);
    if (!file) return new Response('Not found', { status: 404 });
    const size = statSync(file).size;
    const range = request.headers.get('range');
    const match = range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = match ? Number(match[1]) : 0;
    const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!Number.isSafeInteger(start) || start < 0 || start >= size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>;
    const mimeByExtension: Record<string,string> = {'.webm':'video/webm','.mp4':'video/mp4','.m4v':'video/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.m4a':'audio/mp4'};
    const mime = mimeByExtension[extname(file).toLowerCase()] || 'application/octet-stream';
    return new Response(body, { status: match ? 206 : 200, headers: { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), ...(match ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) } });
  });
  const trusted = (event: Electron.IpcMainInvokeEvent): void => { if (!isFusionView(event.sender)) throw new Error('untrusted-view'); };
  const kindOf = (kind: WebKind): WebKind => { if (kind !== 'browser' && kind !== 'video') throw new Error('invalid-web-kind'); return kind; };
  const toolSnapshot=()=>({...store.snapshot(),bookmarks:getLibraryStore().data.items.filter(item=>item.kind==='url').map(item=>({id:item.id,title:item.title,url:item.url!}))});
  ipcMain.handle('fusion:tools:data', event => { trusted(event); return toolSnapshot(); });
  ipcMain.handle('fusion:tools:write', (event, kind: string, value: unknown) => { trusted(event);
    if(kind==='bookmark'){const bookmark=value as {url:string;title:string;id:string};getLibraryStore().write({type:'url',...bookmark});getLibraryStore().save();broadcastFusion('fusion:library:changed',getLibraryStore().snapshot());}
    else if(kind==='deleteBookmark'){getLibraryStore().write({type:'remove',id:String(value)});getLibraryStore().save();broadcastFusion('fusion:library:changed',getLibraryStore().snapshot());}
    else store.write(kind,value);
    const data=toolSnapshot();broadcastFusion('fusion:tools:data-changed', data);return data;
  });
  ipcMain.handle('fusion:web:state', event => { trusted(event); return snapshot(); });
  ipcMain.handle('fusion:web:navigate', async (event, kind: WebKind, raw: string) => {
    trusted(event); const url = normalizeWebUrl(raw); const guest = createGuest(kindOf(kind));clearBookBrowser(guest.view.webContents);
    guest.state.url = url; guest.state.title = new URL(url).hostname; guest.state.error = '';
    if (kind === 'video') activate(kind);
    try { await withDeadline(guest.view.webContents.loadURL(url), 30000); } catch (error) { guest.view.webContents.stop(); guest.state.loading = false; guest.state.error = String(error); publish(); }
  });
  ipcMain.handle('fusion:web:attach', (event, kind: WebKind, rect: WebRect | null) => {
    trusted(event); const guest = createGuest(kindOf(kind)); const host = BrowserWindow.fromWebContents(event.sender);
    if (!host) return;
    if (!rect) { if (guest.owner === host) detach(guest); return; }
    const area = host.getContentBounds();
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width < 1 || rect.height < 1) throw new Error('invalid-web-rect');
    const x = Math.max(0, Math.round(rect.x)); const y = Math.max(0, Math.round(rect.y));
    if (x >= area.width || y >= area.height) { if (guest.owner === host) detach(guest); return; }
    if (guest.owner !== host) { detach(guest); host.contentView.addChildView(guest.view); guest.owner = host; }
    guest.view.setBorderRadius(10);
    guest.view.setBounds({ x, y, width: Math.max(1, Math.min(Math.round(rect.width), area.width - x)), height: Math.max(1, Math.min(Math.round(rect.height), area.height - y)) });
  });
  ipcMain.handle('fusion:web:action', async (event, kind: WebKind, action: string) => {
    trusted(event); const guest = createGuest(kindOf(kind)); const contents = guest.view.webContents;
    if (action === 'back' && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    else if (action === 'forward' && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
    else if (action === 'reload') contents.reload();
    else if (action === 'external') await shell.openExternal(normalizeWebUrl(guest.state.url));
    else if (action === 'clear') { await browserSession.clearStorageData(); await browserSession.clearCache(); guests.forEach(item => item.view.webContents.reload()); }
    else if (!['back', 'forward'].includes(action)) throw new Error('invalid-web-action');
  });
  playFusionNativeFile = async (host:BrowserWindow, requested?:string, autoplay=true) => {
    let file = requested;
    if (!file) { const selected = await dialog.showOpenDialog(host, { properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'm4v'] }] }); if (selected.canceled) return false; file = selected.filePaths[0]; }
    if (typeof file !== 'string' || !['.mp4', '.webm', '.m4v','.mp3','.wav','.ogg','.m4a'].includes(extname(file).toLowerCase()) || !statSync(file).isFile()) throw new Error('unsupported-video');
    const token = randomUUID(); mediaFiles.clear(); mediaFiles.set(token, file);
    const guest = createGuest('video'); guest.state.url = `fusion-file://media/${token}`; guest.state.title = file.split(/[\\/]/).at(-1)!; guest.state.error = '';
    activate('video');
    const suffix = `?lang=${app.getLocale().startsWith('zh') ? 'zh-CN' : 'en-US'}&autoplay=${autoplay?1:0}#${token}`;
    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) await guest.view.webContents.loadURL(`${process.env.ELECTRON_RENDERER_URL}/FusionVideo.html${suffix}`);
    else await guest.view.webContents.loadFile(join(app.getAppPath(), 'out/renderer/FusionVideo.html'), { query: { lang: app.getLocale().startsWith('zh') ? 'zh-CN' : 'en-US',autoplay:autoplay?'1':'0' }, hash: token });
    const player = await mediaFrame(guest);
    if (player&&autoplay) await player.frame.executeJavaScript(`document.querySelector('video')?.play()`, true).catch(() => undefined);
    publish(); return true;
  };
  ipcMain.handle('fusion:web:file',async(event,requested?:string)=>{trusted(event);return playFusionNativeFile(BrowserWindow.fromWebContents(event.sender)!,requested);});
  ipcMain.handle('fusion:web:media', async (event, command: MediaCommand, value?: number) => {
    trusted(event); if (!['play', 'pause', 'pause-all', 'toggle', 'mute', 'seek', 'rate', 'close'].includes(command)) throw new Error('invalid-media-command');
    if (command === 'pause-all') return pauseAllFusionMedia();
    if (command === 'pause') return pauseFusionMedia();
    if (!activeKind) return { paused: true, muted: false, controllable: false }; const guest = guests.get(activeKind)!;
    if (command === 'close') { detach(guest); guest.view.webContents.close(); guests.delete(activeKind); activeKind = null; mediaFiles.clear(); publish(); return { paused: true, muted: false, controllable: false }; }
    if (command === 'mute') {
      guest.pauseMute = undefined; guest.state.muted = !guest.state.muted; guest.view.webContents.setAudioMuted(guest.state.muted);
      await Promise.allSettled(guest.view.webContents.mainFrame.framesInSubtree.map(frame => withDeadline(frame.executeJavaScript(`document.querySelectorAll('video,audio').forEach(m=>{m.muted=${guest.state.muted};if(!m.muted&&m.volume===0)m.volume=1;})`))));
      publish(); return { paused: !guest.state.playing, muted: guest.state.muted, controllable: guest.state.controllable };
    }
    if ((command === 'seek' || command === 'rate') && (!Number.isFinite(value) || value! < 0 || (command === 'rate' && (value! < .25 || value! > 4)))) throw new Error('invalid-media-value');
    const selected = await mediaFrame(guest);
    if (!selected) { guest.state.controllable = false; publish(); return { paused: false, muted: guest.state.muted, controllable: false }; }
    if (guest.pauseMute !== undefined) { guest.state.muted = guest.pauseMute; guest.pauseMute = undefined; guest.view.webContents.setAudioMuted(guest.state.muted); }
    const operation = { play: 'm.play()', toggle: 'm.paused ? m.play() : m.pause()', seek: `m.currentTime = Math.min(${Number(value)}, Number.isFinite(m.duration) ? m.duration : ${Number(value)})`, rate: `m.playbackRate = ${Number(value)}` }[command];
    await withDeadline(selected.frame.executeJavaScript(`(() => { const a=[...document.querySelectorAll('video,audio')]; const m=a.find(m=>!m.paused&&!m.ended)||a.find(m=>m.readyState>0); if(m) return ${operation}; })()`, true));
    const actual = await mediaFrame(guest); if (actual) { Object.assign(guest.state, actual.media); guest.state.muted = guest.view.webContents.isAudioMuted() || Boolean(actual.media.muted); } publish();
    return { paused: !guest.state.playing, muted: guest.state.muted, controllable: Boolean(actual) };
  });
  let polling = false;
  const timer = setInterval(async () => {
    if (polling || !activeKind) return; const guest = guests.get(activeKind); if (!guest || guest.view.webContents.isDestroyed()) return;
    polling = true;
    try {
      const result = await mediaFrame(guest);
      guest.state.controllable = Boolean(result);
      if (result) { const data = result.media; guest.state.playing = Boolean(data.playing); guest.state.muted = guest.view.webContents.isAudioMuted() || Boolean(data.muted); (['time', 'duration', 'width', 'height'] as const).forEach(key => { guest.state[key] = Number.isFinite(data[key]) ? Math.max(0, Number(data[key])) : 0; }); }
      publish();
    } catch { guest.state.controllable = false; } finally { polling = false; }
  }, 1000);
  app.once('will-quit', () => { clearInterval(timer); guests.forEach(guest => { if (!guest.view.webContents.isDestroyed()) guest.view.webContents.close(); }); });
}

/** 必须在 app.ready 之前登记流式媒体协议。 */
export function registerFusionMediaScheme(): void {
  protocol.registerSchemesAsPrivileged(['fusion-file','fusion-music'].map(scheme=>({scheme,privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true}})));
}

/** Captures only the currently attached isolated native views, without destroying their sessions. */
export async function captureFusionGuestViews(host:BrowserWindow):Promise<import('../../preload/types/genie').GenieFrame[]>{return Promise.all([...guests.values()].filter(guest=>guest.owner===host&&!guest.view.webContents.isDestroyed()).map(async guest=>{const rect=guest.view.getBounds(),image=await guest.view.webContents.capturePage();if(image.isEmpty())throw Error('native-capture-unavailable');return {image:image.resize({width:rect.width,height:rect.height,quality:'good'}).toDataURL(),rect};}));}
