/* FloatIsland - https://github.com/yanhaoran01/FloatIsland; Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionMusicService.ts @description Main-owned library, anonymous media protocol and sandboxed persistent audio host. @author 鸡哥 */
import {app,BrowserWindow,dialog,ipcMain,session} from 'electron';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,statSync,lstatSync,createReadStream,promises as files} from 'fs';
import {join,extname,basename} from 'path';
import {randomUUID,createHash} from 'crypto';
import {localMusicMetadata,localMusicArtwork} from './localMusicMetadata';
import {musicQuality,musicDownloadOptions,measuredMusicFallback} from './musicQuality';
import {playlistFilePreview,playlistFileExport} from './musicPlaylistFile';
import {playlistReference} from './musicPlaylistInput';
import {setSongResolver,downloadSongs,commitMusic} from '../core/musicDownloadBridge';
import {browserDownloadName} from '../core/browserDownloadEngine';
import {retainMusicStream} from './fusionMusicStream';
import {Readable} from 'stream';
import {spawn} from 'child_process';
import {musicRemoteUrl,type MusicStream} from './fusionMusicProviders';
import {MusicSources} from './fusionMusicSources';
import {publicMusicUrl,publicMusicRequest,musicPluginHeaders} from './fusionMusicPluginHost';
import {emptyMusicLibrary,normalizeMusicLibrary,editMusicLibrary,adjacentMusic} from './fusionMusicModel';
import {registerMediaParticipant,acquireFusionMedia} from '../system/fusionMediaCoordinator';
import {broadcastFusion,isFusionView} from '../system/fusionWindows';
import {mediaRuntimeDirectory,ownMediaProcessTree} from '../core/mediaPrograms';
import {setLocalImportHandler} from '../system/localImportService';
import type {MusicState,MusicCommand,MusicCommandValue,MusicTrack,MusicProvider,MusicLibrary,MusicSourceCommand,MusicPlaylistPreview,MusicPlaylist} from '../../preload/types/fusionMusic';
import type {MediaControlResult} from '../../preload/types/fusionTools';

/** Registers IPC only after Electron is ready; never starts playback on startup. */
export function registerFusionMusic():void {
  const directory=join(app.getPath('userData'),'fusion-workspace'),file=join(directory,'music-v2.json'),legacyFile=join(directory,'music-v1.json');
  let library:MusicLibrary=emptyMusicLibrary(),localFiles:Record<string,string>={},localIdentities:Record<string,{device:number;inode:number}>={};
  try{const stored=JSON.parse(readFileSync(existsSync(file)?file:legacyFile,'utf8'));library=normalizeMusicLibrary(stored);if(stored.localIdentities&&typeof stored.localIdentities==='object')for(const [id,value] of Object.entries(stored.localIdentities)){const identity=value as {device?:unknown;inode?:unknown};if(typeof identity.device==='number'&&typeof identity.inode==='number')localIdentities[id]={device:identity.device,inode:identity.inode};}if(stored.localFiles&&typeof stored.localFiles==='object')for(const [id,path] of Object.entries(stored.localFiles))if(typeof path==='string'&&library.tracks.some(t=>t.provider==='local'&&t.id===id))localFiles[id]=path;}catch{/* New or malformed libraries are isolated from existing settings. */}
  const state:MusicState={library,active:false,playing:false,loading:false,time:0,duration:0,muted:false,error:'',lyrics:'',lyricError:'',format:'',bitrate:null};
  const publish=():void=>broadcastFusion('fusion:music:changed',state);
  const save=():void=>{mkdirSync(directory,{recursive:true});writeFileSync(file+'.tmp',JSON.stringify({...library,localFiles,localIdentities}));renameSync(file+'.tmp',file);publish();};
  const remember=(track:MusicTrack):void=>{const known=library.tracks.find(t=>t.id===track.id);if(known)Object.assign(known,track);else library.tracks.push(track);};
  const metadataController=new AbortController(),metadataPending=new Set<string>();let metadataRunning=0;
  const authorizedLocal=(id:string)=>{const path=localFiles[id];if(!path)throw Error('music-local-missing');const info=lstatSync(path),identity=localIdentities[id];if(!info.isFile()||info.isSymbolicLink()||identity&&(info.dev!==identity.device||info.ino!==identity.inode))throw Error('music-local-missing');return path;};
  const metadataPump=()=>{while(metadataRunning<2&&metadataPending.size){const id=metadataPending.values().next().value!;metadataPending.delete(id);metadataRunning++;void (async()=>{const path=authorizedLocal(id),metadata=await localMusicMetadata(path,metadataController.signal);if(localFiles[id]!==path)return;authorizedLocal(id);const track=library.tracks.find(track=>track.id===id);if(!track)return;if(metadata.title)track.title=metadata.title;if(metadata.artist)track.artist=metadata.artist;if(metadata.album)track.album=metadata.album;if(metadata.duration>0)track.duration=metadata.duration;library.revision++;save();})().catch(()=>{}).finally(()=>{metadataRunning--;if(!metadataController.signal.aborted)metadataPump();});}};
  setLocalImportHandler('music',async(_owner,files)=>{const ids:string[]=[];for(const file of files){const known=Object.entries(localFiles).find(([id,path])=>path===file.path||file.inode&&localIdentities[id]?.device===file.device&&localIdentities[id]?.inode===file.inode)?.[0],id=known??'local_'+randomUUID();localFiles[id]=file.path;localIdentities[id]={device:file.device,inode:file.inode};const old=library.tracks.find(t=>t.id===id);remember({id,provider:'local',title:old?.title||basename(file.path,extname(file.path)),artist:old?.artist||'',album:old?.album||'',cover:old?.cover||'',availability:'unknown'});ids.push(id);metadataPending.add(id);}library.revision++;save();metadataPump();return ids;});
  const vendor=app.isPackaged?join(process.resourcesPath,'music'):join(app.getAppPath(),'resources','music');
  const musicSession=session.fromPartition('fusion-music');musicSession.setPermissionRequestHandler((_c,_p,cb)=>cb(false));musicSession.setPermissionCheckHandler(()=>false);
  const apiSession=session.fromPartition('fusion-music-api');
  const providers=new MusicSources(directory,vendor,(url,options)=>apiSession.fetch(url,options),sources=>broadcastFusion('fusion:music:sources',sources));
  const sources=new Map<string,{file?:string;localId?:string;url?:string;headers?:Record<string,string>;plugin?:boolean}>(),streams=new Set<AbortController>(),searches=new Map<number,AbortController>();
  let host:BrowserWindow|null=null,ready:Promise<void>|null=null,generation=0,operation:AbortController|null=null,userMuted=false,advancing=false;
  let wantsPlayback=false;
  const trusted=(event:Electron.IpcMainInvokeEvent)=>{if(!isFusionView(event.sender)||event.senderFrame!==event.sender.mainFrame)throw Error('untrusted-view');};
  const cancel=():void=>{generation++;operation?.abort();operation=null;};
  musicSession.protocol.handle('fusion-music',async request=>{
    const source=sources.get(new URL(request.url).pathname.slice(1));if(!source)return new Response('Not found',{status:404});
    try{
      if(source.file){if(source.localId&&authorizedLocal(source.localId)!==source.file)throw Error('music-local-missing');const size=statSync(source.file).size,match=request.headers.get('range')?.match(/^bytes=(\d+)-(\d*)$/),start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),size-1):size-1;
        if(start<0||start>=size||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
        const mime:Record<string,string>={'.flac':'audio/flac','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.opus':'audio/ogg','.m4a':'audio/mp4','.aac':'audio/aac'};
        return new Response(Readable.toWeb(createReadStream(source.file,{start,end})) as ReadableStream<Uint8Array>,{status:match?206:200,headers:{'Content-Type':mime[extname(source.file).toLowerCase()]??'application/octet-stream','Accept-Ranges':'bytes','Content-Length':String(end-start+1),...(match?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})}});
      }
      const controller=new AbortController();streams.add(controller);
      const abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});
      const release=()=>{streams.delete(controller);request.signal.removeEventListener('abort',abort);};
      if(request.signal.aborted)controller.abort();
      const timer=setTimeout(()=>controller.abort(),30000);let url=source.plugin?await publicMusicUrl(source.url!):musicRemoteUrl(source.url!);
      try{for(let redirects=0;redirects<5;redirects++){
        const options={credentials:'omit' as const,redirect:'manual' as const,signal:controller.signal,headers:{...musicPluginHeaders(source.headers),...(request.headers.has('range')?{'Range':request.headers.get('range')!}:{})}};
        const response=await(source.plugin?publicMusicRequest(url,options):musicSession.fetch(url,options));
        if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('music-invalid-source');url=source.plugin?await publicMusicUrl(new URL(location,url).href):musicRemoteUrl(new URL(location,url).href);continue;}
        clearTimeout(timer);return retainMusicStream(response,release);
      }throw Error('music-too-many-redirects');}catch(error){release();throw error;}finally{clearTimeout(timer);}
    }catch(error){state.error=error instanceof Error?error.message:String(error);publish();return new Response('Media unavailable',{status:502});}
  });
  const ensureHost=async():Promise<BrowserWindow>=>{
    if(!host||host.isDestroyed()){
      host=new BrowserWindow({show:false,width:1,height:1,webPreferences:{partition:'fusion-music',sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
      host.webContents.setWindowOpenHandler(()=>({action:'deny'}));host.webContents.on('will-navigate',event=>event.preventDefault());
      const ownedHost=host;
      host.webContents.on('render-process-gone',()=>{if(host!==ownedHost)return;cancel();ownedHost.destroy();host=null;ready=null;state.active=false;state.playing=false;state.loading=false;state.error='music-host-crashed';publish();});
      ready=host.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; media-src fusion-music:"><audio id="music" preload="auto"></audio>'));
    }
    await ready;return host;
  };
  const pause=async(deactivate=false):Promise<MediaControlResult>=>{
    cancel();wantsPlayback=false;state.loading=false;if(deactivate)state.active=false;
    if(!host||host.isDestroyed()){state.playing=false;publish();return {paused:true,muted:true,controllable:false};}
    host.webContents.setAudioMuted(true);state.muted=true;
    let paused=false;try{paused=await host.webContents.executeJavaScript('(()=>{const a=document.querySelector("audio");a.pause();return a.paused})()');}catch{/* Muting is confirmed independently. */}
    if(paused)state.playing=false;publish();return {paused,muted:host.webContents.isAudioMuted(),controllable:paused};
  };
  registerMediaParticipant('music',{pause:()=>pause(true),active:()=>state.active});
  const clearSource=async():Promise<void>=>{for(const controller of streams)controller.abort();streams.clear();sources.clear();if(host&&!host.isDestroyed())await host.webContents.executeJavaScript('(()=>{const a=document.querySelector("audio");a.pause();a.removeAttribute("src");a.load()})()').catch(()=>{});};
  const probe=(input:string,signal:AbortSignal,headers?:Record<string,string>):Promise<{format:string;bitrate:number|null;duration:number;sampleRate:number;bitsPerSample:number}>=>new Promise((resolve,reject)=>{
    const headerArgs=headers&&Object.keys(headers).length?['-headers',Object.entries(musicPluginHeaders(headers)).map(([key,value])=>key+': '+value+'\r\n').join('')]:[];
    let child:ReturnType<typeof spawn>;try{child=spawn(join(mediaRuntimeDirectory(),'ffprobe.exe'),['-v','error','-rw_timeout','10000000','-probesize','131072','-analyzeduration','1000000','-show_entries','stream=codec_name,bit_rate,sample_rate,bits_per_sample,bits_per_raw_sample:format=duration,bit_rate','-of','json',...headerArgs,input],{windowsHide:true,shell:false});}catch(error){reject(error);return;}
    let output='',owned:(()=>void)|undefined,done=false;const timer=setTimeout(()=>finish(Error('music-probe-timeout')),12000);
    const abort=()=>finish(Error('music-cancelled'));signal.addEventListener('abort',abort,{once:true});
    const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);owned?.();if(!child.killed)child.kill();if(error){reject(error);return;}try{const data=JSON.parse(output),stream=data.streams?.[0],rate=Number(stream?.bit_rate??data.format?.bit_rate);resolve({format:typeof stream?.codec_name==='string'?stream.codec_name.toUpperCase():'',bitrate:Number.isFinite(rate)&&rate>0?rate:null,duration:Number(data.format?.duration)||0,sampleRate:Number(stream?.sample_rate)||0,bitsPerSample:Number(stream?.bits_per_raw_sample||stream?.bits_per_sample)||0});}catch{reject(Error('music-probe-failed'));}};
    child.once('spawn',()=>{if(done)return;try{if(child.pid)owned=ownMediaProcessTree(child.pid);}catch(error){finish(error instanceof Error?error:Error(String(error)));}});
    child.stdout?.on('data',chunk=>{output+=chunk.toString();if(output.length>100000)finish(Error('music-response-too-large'));});child.once('error',finish);child.once('close',code=>finish(code===0?undefined:Error('music-probe-failed')));if(signal.aborted)abort();
  });
  const sidecarId=(id:string,kind:string)=>{const hash=createHash('sha256').update(id+':'+kind).digest('hex').slice(0,32);return hash.slice(0,8)+'-'+hash.slice(8,12)+'-'+hash.slice(12,16)+'-'+hash.slice(16,20)+'-'+hash.slice(20);};
  const transcode=(source:string,target:string,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
    signal.throwIfAborted();const child=spawn(join(mediaRuntimeDirectory(),'ffmpeg.exe'),['-nostdin','-v','error','-y','-i',source,'-vn','-map_metadata','0','-c:a','libmp3lame','-b:a','320k',target],{windowsHide:true,shell:false,stdio:'ignore'});let owned:(()=>void)|undefined,done=false;const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);owned?.();child.kill();if(error)reject(error);else resolve();},abort=()=>finish(Error('job-cancelled')),timer=setTimeout(()=>finish(Error('media-convert-timeout')),600000);signal.addEventListener('abort',abort,{once:true});child.once('spawn',()=>{if(done)return;try{if(child.pid)owned=ownMediaProcessTree(child.pid);}catch(error){finish(Error(String(error)));}});child.once('error',finish);child.once('close',code=>finish(code===0?undefined:Error('media-convert-failed')));if(signal.aborted)abort();
  });
  const songTracks=new WeakMap<object,{sourceId:string}>();
  setSongResolver(async(song,signal)=>{
    const track=library.tracks.find(track=>track.id===song.trackId);if(!track||track.provider==='local')throw Error('music-track-missing');const stream=await providers.resolve(track,signal,new Set(),song.options.quality);songTracks.set(song,{sourceId:stream.sourceId!});
    const metadata=await probe(stream.url,signal,stream.headers).catch(error=>{if(signal.aborted)throw error;return {format:''};});const extension:Record<string,string>={FLAC:'flac',ALAC:'m4a',AAC:'aac',MP3:'mp3',OPUS:'opus',VORBIS:'ogg',PCM_S16LE:'wav',PCM_S24LE:'wav',PCM_S32LE:'wav'};let ext=extension[metadata.format]||'';if(!ext){const suffix=extname(new URL(stream.url).pathname).slice(1).toLowerCase();ext=['flac','mp3','m4a','aac','ogg','opus','wav'].includes(suffix)?suffix:'audio';}return {url:stream.url,headers:stream.headers,name:browserDownloadName(track.artist+' - '+track.title+'.'+ext)};
  },async(song,input,id,signal)=>{
    const track=library.tracks.find(track=>track.id===song.trackId);if(!track)throw Error('music-track-missing');let path=input;await probe(path,signal);
    if(song.options.format==='mp3'){path=join(join(input,'..'),'converted.mp3');await transcode(input,path,signal);}
    const metadata=await probe(path,signal),name=browserDownloadName(track.artist+' - '+track.title+extname(path)),target=await commitMusic(path,name,id);signal.throwIfAborted();const warnings:string[]=[],outputs=[target],resolved=songTracks.get(song)?.sourceId||track.sourceId||'builtin:'+track.provider;
    const sidecar=async(kind:string,name:string,bytes:Uint8Array)=>{const temporary=join(join(input,'..'),'sidecar-'+kind);await files.writeFile(temporary,bytes);outputs.push(await commitMusic(temporary,name,sidecarId(id,kind)));};
    if(song.options.lyrics)try{const text=await providers.lyrics(track,resolved,signal);if(text)await sidecar('lyrics',basename(target,extname(target))+'.lrc',Buffer.from(text));else warnings.push('music-lyrics-unavailable');}catch(error){if(signal.aborted)throw error;warnings.push(String(error));}
    if(song.options.cover&&track.cover)try{const url=await publicMusicUrl(track.cover),response=await publicMusicRequest(url,{signal});if(!response.ok){await response.body?.cancel();throw Error('music-cover-unavailable');}const type=response.headers.get('content-type')||'';if(!/^image\/(jpeg|png|webp)/.test(type)||Number(response.headers.get('content-length'))>5000000){await response.body?.cancel();throw Error('music-cover-unavailable');}const chunks:Uint8Array[]=[];let size=0;for await(const chunk of response.body!){size+=chunk.length;if(size>5000000)throw Error('file-too-large');chunks.push(chunk);}await sidecar('cover',basename(target,extname(target))+(/png/.test(type)?'.png':/webp/.test(type)?'.webp':'.jpg'),Buffer.concat(chunks));}catch(error){if(signal.aborted)throw error;warnings.push(String(error));}
    const info=lstatSync(target),known=Object.entries(localFiles).find(([key,file])=>file===target||localIdentities[key]?.device===info.dev&&localIdentities[key]?.inode===info.ino)?.[0],localId=known||'local_'+randomUUID();localFiles[localId]=target;localIdentities[localId]={device:info.dev,inode:info.ino};remember({...track,id:localId,provider:'local',sourceId:undefined,candidates:undefined});library.revision++;providers.downloaded(resolved);save();return {outputs,...metadata,qualityFallback:measuredMusicFallback(song.options.quality,metadata.format,metadata.sampleRate,metadata.bitsPerSample,metadata.bitrate),warnings};
  });
  const play=async(id:string,resume=0,skipSource?:string,manualTrack?:MusicTrack):Promise<void>=>{
    const track=library.tracks.find(t=>t.id===id);if(!track)throw Error('music-track-missing');
    await pause(false); // Stop the old audio while resolving; the queue is never discarded.
    const current=++generation,controller=new AbortController();operation=controller;state.loading=true;state.error='';state.lyricError='';state.lyrics='';publish();
    wantsPlayback=true;
    try{
      let path:string|undefined,attempts:MusicTrack[]=[manualTrack??track],failure:unknown=Error('music-unavailable');
      if(track.provider==='local'){path=localFiles[id];if(!path||!existsSync(path))throw Error('music-local-missing');const info=lstatSync(path),identity=localIdentities[id];if(!info.isFile()||info.isSymbolicLink()||identity&&(info.dev!==identity.device||info.ino!==identity.inode))throw Error('music-local-missing');}
      const failedSources=new Set<string>(skipSource?[skipSource]:[]);
      for(let index=0;index<attempts.length&&index<3;index++){
        const candidate=attempts[index];remember(candidate);let stream:MusicStream|undefined;
        try{
          if(!path)stream=await providers.resolve(candidate,controller.signal,failedSources,library.playbackQuality||'auto');
          if(current!==generation)return;
          const metadata=await probe(path??stream!.url,controller.signal,stream?.headers).catch(error=>{if(controller.signal.aborted)throw error;return {format:'',bitrate:null,duration:0,sampleRate:0,bitsPerSample:0};});
          if(current!==generation)return;await acquireFusionMedia('music');if(current!==generation)return;
          const player=await ensureHost();if(current!==generation)return;await clearSource();if(current!==generation)return;
          const token=randomUUID();sources.set(token,path?{file:path,localId:id}:{url:stream!.url,headers:stream!.headers,plugin:!stream!.sourceId?.startsWith('builtin:')});
          state.sampleRate=metadata.sampleRate;state.bitsPerSample=metadata.bitsPerSample;state.qualityFallback=measuredMusicFallback(library.playbackQuality||'auto',metadata.format,metadata.sampleRate,metadata.bitsPerSample,metadata.bitrate);state.format=metadata.format;state.bitrate=metadata.bitrate;state.lossless=['FLAC','ALAC','PCM_S16LE','PCM_S24LE','PCM_S32LE'].includes(metadata.format);state.duration=metadata.duration;state.time=0;state.muted=userMuted;player.webContents.setAudioMuted(userMuted);
          await player.webContents.executeJavaScript(`(async()=>{const a=document.querySelector('audio');a.src=${JSON.stringify('fusion-music://audio/'+token)};a.volume=${library.volume};await a.play();if(${resume}>0&&Number.isFinite(a.duration))a.currentTime=Math.min(${resume},Math.max(0,a.duration-.1))})()`,true);
          if(current!==generation){await player.webContents.executeJavaScript(`(()=>{const a=document.querySelector('audio');if(a.getAttribute('src')===${JSON.stringify('fusion-music://audio/'+token)})a.pause()})()`).catch(()=>{});return;}
          if(!library.queue.includes(id))library.queue.push(id);library.current=id;library.revision++;state.actualTrackId=candidate.id;state.actualSourceId=stream?.sourceId;state.active=true;state.playing=true;state.loading=false;state.error='';app.emit('fusion-media-active');save();
          if(candidate.provider!=='local')void providers.lyrics(candidate,stream!.sourceId!,controller.signal).then(text=>{if(current===generation){state.lyrics=text;publish();}}).catch(error=>{if(current===generation&&!controller.signal.aborted){state.lyricError=error instanceof Error?error.message:String(error);publish();}});
          else {const lrc=path!.replace(/\.[^.]+$/,'.lrc');if(existsSync(lrc)&&statSync(lrc).size<500000)state.lyrics=readFileSync(lrc,'utf8');publish();}
          return;
        }catch(error){if(controller.signal.aborted||current!==generation)throw error;failure=error;if(stream?.sourceId){failedSources.add(stream.sourceId);providers.fail(stream.sourceId,error instanceof Error?error.message:String(error));}await clearSource();
          if(index===0&&!path&&!manualTrack){const found=await providers.candidates(track,controller.signal);attempts=stream?[track,...found]:found;attempts.forEach(remember);track.candidates=[...new Set(attempts.map(t=>t.id))];}
        }
      }
      throw failure;
    }catch(error){if(current===generation){wantsPlayback=false;state.active=false;state.error=error instanceof Error?error.message:String(error);state.playing=false;state.loading=false;publish();}throw error;}
  };
  const control=async(command:MusicCommand,value:MusicCommandValue={}):Promise<MusicState>=>{
    if(!value||typeof value!=='object')throw Error('music-invalid-value');
    switch(command){
      case 'switch-source':{const original=library.current&&library.tracks.find(t=>t.id===library.current),candidate=library.tracks.find(t=>t.id===value.id);if(!original||!candidate||!original.candidates?.includes(candidate.id))throw Error('music-track-missing');await play(original.id,0,undefined,candidate);break;}
      case 'play':case 'toggle':{
        if(command==='toggle'&&state.playing){await pause();break;}
        const id=value.id??library.current??library.queue[0];if(!id)throw Error('music-empty-queue');
        if(!value.id&&host&&!host.isDestroyed()&&library.current&&await host.webContents.executeJavaScript('Boolean(document.querySelector("audio").getAttribute("src"))')){
          cancel();const current=generation,player=host;await acquireFusionMedia('music');if(current!==generation||player!==host||player.isDestroyed())break;
          state.muted=userMuted;player.webContents.setAudioMuted(userMuted);await player.webContents.executeJavaScript('document.querySelector("audio").play()',true);
          if(current!==generation){player.webContents.setAudioMuted(true);await player.webContents.executeJavaScript('document.querySelector("audio").pause()').catch(()=>{});break;}
          wantsPlayback=true;state.active=true;state.playing=true;app.emit('fusion-media-active');publish();
        }else await play(id);break;
      }
      case 'pause':await pause();break;
      case 'close':await pause(true);await clearSource();if(host&&!host.isDestroyed())host.destroy();host=null;ready=null;state.active=false;state.time=0;state.duration=0;state.actualSourceId=undefined;state.actualTrackId=undefined;state.error='';publish();break;
      case 'next':case 'previous':{const id=adjacentMusic(library,command==='next'?1:-1);if(id)await play(id);else await pause();break;}
      case 'seek':if(!Number.isFinite(value.number)||value.number!<0||!host||host.isDestroyed())throw Error('music-invalid-value');await host.webContents.executeJavaScript(`(()=>{const a=document.querySelector('audio');if(!Number.isFinite(a.duration))throw Error('music-seek-unavailable');a.currentTime=Math.min(${value.number},a.duration)})()`);state.time=value.number!;publish();break;
      case 'mute':userMuted=!userMuted;state.muted=userMuted;host?.webContents.setAudioMuted(userMuted);publish();break;
      default:editMusicLibrary(library,command,value);if(command==='volume'&&host&&!host.isDestroyed())await host.webContents.executeJavaScript(`document.querySelector('audio').volume=${library.volume}`);if(command==='queue-remove'&&value.id===library.current){await pause(true);await clearSource();library.current=null;}save();
    }
    return state;
  };
  ipcMain.handle('fusion:music:download',(event,ids:string[],raw)=>{trusted(event);const options=musicDownloadOptions(raw);if(!Array.isArray(ids)||!ids.length||ids.length>2000||ids.some(id=>typeof id!=='string'||!library.tracks.some(track=>track.id===id&&track.provider!=='local')))throw Error('music-track-missing');library.downloadQuality=options.quality;save();return downloadSongs([...new Set(ids)].map(trackId=>({trackId,options,name:library.tracks.find(track=>track.id===trackId)!.title})));});
  let artworkTail:Promise<unknown>=Promise.resolve();const artworkCache=new Map<string,string>();
  ipcMain.handle('fusion:music:artwork',(event,id:string)=>{trusted(event);const path=authorizedLocal(id);const key=id+':'+lstatSync(path).mtimeMs;if(artworkCache.has(key))return artworkCache.get(key);const work=artworkTail.then(async()=>{if(event.sender.isDestroyed())return '';try{const result=await localMusicArtwork(authorizedLocal(id),metadataController.signal);if(artworkCache.size>=100)artworkCache.delete(artworkCache.keys().next().value!);artworkCache.set(key,result);return result;}catch{return '';}});artworkTail=work.catch(()=>{});return work;});
  ipcMain.handle('fusion:music:relocate',async(event,id:string)=>{trusted(event);if(!library.tracks.some(track=>track.id===id&&track.provider==='local'))throw Error('music-track-missing');const selected=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!,{properties:['openFile'],filters:[{name:'Audio',extensions:['mp3','flac','m4a','wav','ogg','opus','aac','aiff','aif']}]});if(selected.canceled)return state;const path=selected.filePaths[0],info=lstatSync(path);if(info.isSymbolicLink()||!info.isFile())throw Error('music-local-missing');localFiles[id]=path;localIdentities[id]={device:info.dev,inode:info.ino};metadataPending.add(id);save();metadataPump();return state;});
  ipcMain.handle('fusion:music:quality',(event,playback,download)=>{trusted(event);if(playback!==undefined)library.playbackQuality=musicQuality(playback);if(download!==undefined)library.downloadQuality=musicQuality(download);if(playback!==undefined||download!==undefined)save();return {playback:library.playbackQuality||'auto',download:library.downloadQuality||'auto'};});
  ipcMain.handle('fusion:music:state',event=>{trusted(event);return state;});
  ipcMain.handle('fusion:music:search',async(event,provider:Exclude<MusicProvider,'local'>|'all',query:string,page:number,requestId?:string)=>{
    trusted(event);searches.get(event.sender.id)?.abort();const controller=new AbortController();searches.set(event.sender.id,controller);
    const send=(result:import('../../preload/types/fusionMusic').MusicSearchResult,done=false)=>{result.tracks.forEach(track=>{remember(track);track.candidates?.forEach(id=>{const candidate=providers.knownTrack(id);if(candidate&&candidate.id!==track.id)remember(candidate);});});if(!event.sender.isDestroyed()&&!controller.signal.aborted)event.sender.send('fusion:music:search-batch',{...result,query,page,requestId,done});};
    try{const result=await providers.search(provider,query,page,controller.signal,result=>send(result));if(controller.signal.aborted)throw Error('music-cancelled');send(result,true);return {...result,requestId};}finally{if(searches.get(event.sender.id)===controller)searches.delete(event.sender.id);}
  });
  ipcMain.handle('fusion:music:sources',event=>{trusted(event);return providers.list();});
  ipcMain.handle('fusion:music:source-control',async(event,id:string,command:MusicSourceCommand,value?:number)=>{trusted(event);searches.get(event.sender.id)?.abort();const controller=new AbortController();searches.set(event.sender.id,controller);try{const result=await providers.control(id,command,value,controller.signal);if((command==='disable'||command==='delete')&&state.actualSourceId===id){await pause(true);await clearSource();}return result;}finally{if(searches.get(event.sender.id)===controller)searches.delete(event.sender.id);}});
  ipcMain.handle('fusion:music:source-import',async(event,url?:string)=>{trusted(event);searches.get(event.sender.id)?.abort();const controller=new AbortController();searches.set(event.sender.id,controller);try{if(url!==undefined){if(typeof url!=='string'||url.length>8192)throw Error('music-invalid-source');return await providers.importUrl(url,controller.signal);}const selected=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!,{properties:['openFile'],filters:[{name:'Music source',extensions:['js','json']}]});if(selected.canceled)return providers.list();const path=selected.filePaths[0];if(!statSync(path).isFile()||statSync(path).size>2_000_000)throw Error('music-plugin-invalid');return await providers.import(readFileSync(path,'utf8'),'local',controller.signal);}finally{if(searches.get(event.sender.id)===controller)searches.delete(event.sender.id);}});
  ipcMain.handle('fusion:music:candidates',async(event,id:string)=>{trusted(event);const track=library.tracks.find(t=>t.id===id);if(!track)throw Error('music-track-missing');const controller=new AbortController();searches.get(event.sender.id)?.abort();searches.set(event.sender.id,controller);try{const found=await providers.search('all',track.title+' '+track.artist,1,controller.signal);found.tracks.forEach(remember);track.candidates=[track.id,...found.tracks.map(t=>t.id)];save();return found.tracks;}finally{if(searches.get(event.sender.id)===controller)searches.delete(event.sender.id);}});
  const playlists=new Map<number,AbortController>(),categories=new Map<number,AbortController>();
  const previews=new WeakMap<Electron.WebContents,Map<string,MusicPlaylistPreview>>();
  const playlistWork=async<T>(event:Electron.IpcMainInvokeEvent,work:(signal:AbortSignal)=>Promise<T>,channel=playlists):Promise<T>=>{trusted(event);channel.get(event.sender.id)?.abort();const controller=new AbortController();channel.set(event.sender.id,controller);try{return await work(controller.signal);}finally{if(channel.get(event.sender.id)===controller)channel.delete(event.sender.id);}};
  ipcMain.handle('fusion:music:playlist-categories',(event,id:string)=>playlistWork(event,signal=>providers.categories(id,signal),categories));
  ipcMain.handle('fusion:music:playlist-search',(event,id:string,query:string,page:number)=>playlistWork(event,signal=>providers.searchPlaylists(id,query,page,signal)));
  ipcMain.handle('fusion:music:playlist-discover',(event,id:string,category:string,page:number)=>playlistWork(event,signal=>providers.discover(id,category,page,signal)));
  ipcMain.handle('fusion:music:playlist-preview',(event,id:string,reference:string)=>playlistWork(event,async signal=>{
    if(typeof reference!=='string'||reference.length>8192)throw Error('music-invalid-source');
    let parsed=playlistReference(reference);if(!parsed){const match=reference.match(/https?:\/\/[^\s<>"“”]+/i);if(match){let url=musicRemoteUrl(match[0]);for(let n=0;n<5;n++){const response=await apiSession.fetch(url,{signal,credentials:'omit',redirect:'manual'});const location=response.headers.get('location');await response.body?.cancel();if(!location||response.status<300||response.status>=400)break;url=musicRemoteUrl(new URL(location,url).href);parsed=playlistReference(url);if(parsed)break;}}}
    const result=await providers.playlistPreview(parsed?.sourceId||id,parsed?.id||reference,signal),value:MusicPlaylistPreview={...result,id:randomUUID()};
    if(signal.aborted||event.sender.isDestroyed())throw Error('music-cancelled');const cache=previews.get(event.sender)||new Map<string,MusicPlaylistPreview>();if(cache.size>=20)cache.delete(cache.keys().next().value!);cache.set(value.id,value);previews.set(event.sender,cache);value.tracks.forEach(remember);return value;
  }));
  ipcMain.handle('fusion:music:playlist-file-preview',async event=>{
    trusted(event);const selected=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!,{properties:['openFile'],filters:[{name:'FloatIsland playlist',extensions:['json']}]});if(selected.canceled)return null;
    const path=selected.filePaths[0],info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||info.size>10_000_000)throw Error('file-too-large');
    const value:MusicPlaylistPreview={...playlistFilePreview(await files.readFile(path,'utf8'),new Set(Object.keys(localFiles))),id:randomUUID()};
    const cache=previews.get(event.sender)||new Map<string,MusicPlaylistPreview>();if(cache.size>=20)cache.delete(cache.keys().next().value!);cache.set(value.id,value);previews.set(event.sender,cache);value.tracks.forEach(remember);return value;
  });
  ipcMain.handle('fusion:music:playlist-export',async(event,id:string)=>{
    trusted(event);const playlist=library.playlists.find(playlist=>playlist.id===id);if(!playlist)throw Error('music-playlist-missing');const result=await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!,{defaultPath:browserDownloadName(playlist.name)+'.json',filters:[{name:'FloatIsland playlist',extensions:['json']}]});if(result.canceled||!result.filePath)return false;
    await files.writeFile(result.filePath,playlistFileExport(playlist.name,playlist.tracks.flatMap(id=>{const track=library.tracks.find(track=>track.id===id);return track?[track]:[];}),playlist.source),'utf8');return true;
  });
  ipcMain.handle('fusion:music:playlist-commit',(event,previewId:string,selected:string[])=>{
    trusted(event);const preview=previews.get(event.sender)?.get(previewId);if(!preview||!Array.isArray(selected)||!selected.length||selected.length>10000||selected.some(id=>typeof id!=='string'||!preview.tracks.some(track=>track.id===id)))throw Error('music-invalid-value');
    const ids=[...new Set(selected)],old=library.playlists.find(playlist=>playlist.source?.id===preview.playlist.id&&playlist.source?.sourceId===preview.playlist.sourceId);
    const playlist:MusicPlaylist=old||{id:randomUUID(),name:preview.playlist.name,tracks:[] as string[]};playlist.name=preview.playlist.name;playlist.tracks=[...new Set([...playlist.tracks,...ids])];playlist.source=preview.playlist;playlist.updatedAt=Date.now();if(!old)library.playlists.push(playlist);library.revision++;save();return playlist;
  });
  ipcMain.handle('fusion:music:playlist-import',async(event,id:string,url:string)=>{trusted(event);if(typeof url!=='string'||url.length>8192)throw Error('music-invalid-source');const tracks=await providers.playlist(id,url,new AbortController().signal);tracks.forEach(remember);library.playlists.push({id:randomUUID(),name:url.slice(0,120),tracks:tracks.map(t=>t.id)});library.revision++;save();metadataPump();return tracks;});
  ipcMain.handle('fusion:music:cancel-search',event=>{trusted(event);searches.get(event.sender.id)?.abort();playlists.get(event.sender.id)?.abort();categories.get(event.sender.id)?.abort();});
  ipcMain.handle('fusion:music:control',(event,command:MusicCommand,value?:MusicCommandValue)=>{trusted(event);return control(command,value);});
  ipcMain.handle('fusion:music:import',async event=>{
    trusted(event);const selected=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!,{properties:['openFile','multiSelections'],filters:[{name:'Audio',extensions:['mp3','flac','m4a','wav','ogg','opus','aac']}]});if(selected.canceled)return [];
    const tracks:MusicTrack[]=[];for(const path of selected.filePaths){if(!['.mp3','.flac','.m4a','.wav','.ogg','.opus','.aac'].includes(extname(path).toLowerCase())||!statSync(path).isFile())continue;
      const known=Object.entries(localFiles).find(([,file])=>file===path)?.[0],id=known??'local_'+randomUUID();localFiles[id]=path;const info=lstatSync(path);if(info.isSymbolicLink())continue;localIdentities[id]={device:info.dev,inode:info.ino};metadataPending.add(id);
      const track:MusicTrack={id,provider:'local',title:basename(path,extname(path)),artist:'',album:'',cover:'',availability:'unknown'};remember(track);tracks.push(track);
    }library.revision++;save();metadataPump();return tracks;
  });
  const timer=setInterval(async()=>{
    if(!host||host.isDestroyed()||advancing)return;
    const player=host,current=generation;
    try{const actual=await player.webContents.executeJavaScript('(()=>{const a=document.querySelector("audio");return {playing:!a.paused&&!a.ended,time:a.currentTime||0,duration:Number.isFinite(a.duration)?a.duration:0,ended:a.ended,error:a.error?.code||0,complete:a.played.length===1&&a.played.start(0)<.5&&a.played.end(0)>=a.duration-.5}})()') as {playing:boolean;time:number;duration:number;ended:boolean;error:number;complete:boolean};
      if(player!==host||current!==generation)return;
      state.playing=actual.playing;state.time=actual.time;if(actual.duration)state.duration=actual.duration;if(actual.error)state.error='music-decode-'+actual.error;publish();
      if(actual.error&&wantsPlayback&&state.active&&!state.loading&&library.current){advancing=true;const id=library.current,at=actual.time,source=state.actualSourceId;try{await play(id,at,source);}catch{/* Detailed bounded fallback failure is already published. */}finally{advancing=false;}}
      if(actual.ended&&state.active&&wantsPlayback){if(state.actualSourceId&&actual.duration>30&&actual.complete)providers.complete(state.actualSourceId);advancing=true;const id=adjacentMusic(library,1,true);try{if(id)await play(id);else await pause();}finally{advancing=false;}}
    }catch{/* A destroyed host cannot retain sound. */}
  },500);
  app.once('will-quit',()=>{metadataController.abort();cancel();providers.dispose();clearInterval(timer);searches.forEach(c=>c.abort());playlists.forEach(c=>c.abort());categories.forEach(c=>c.abort());streams.forEach(c=>c.abort());if(host&&!host.isDestroyed())host.destroy();});
}
