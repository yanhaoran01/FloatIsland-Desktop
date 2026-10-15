/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file localMusicMetadata.ts @description Bounded bundled metadata/artwork reads for authorized local references. @author 鸡哥 */
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {mediaRuntimeDirectory,ownMediaProcessTree} from '../core/mediaPrograms';
function run(binary:string,args:string[],signal:AbortSignal,max=1000000):Promise<Buffer>{return new Promise((resolve,reject)=>{
 signal.throwIfAborted();const child=spawn(join(mediaRuntimeDirectory(),binary),args,{windowsHide:true,shell:false,stdio:['ignore','pipe','ignore']});let owned:(()=>void)|undefined,done=false,size=0;const chunks:Buffer[]=[],finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);owned?.();child.kill();if(error)reject(error);else resolve(Buffer.concat(chunks));},abort=()=>finish(Error('music-cancelled')),timer=setTimeout(()=>finish(Error('music-probe-timeout')),12000);signal.addEventListener('abort',abort,{once:true});child.once('spawn',()=>{if(done)return;try{if(child.pid)owned=ownMediaProcessTree(child.pid);}catch(error){finish(Error(String(error)));}});child.stdout.on('data',(bytes:Buffer)=>{size+=bytes.length;if(size>max)finish(Error('file-too-large'));else chunks.push(bytes);});child.once('error',finish);child.once('close',code=>finish(code===0?undefined:Error('music-probe-failed')));if(signal.aborted)abort();
});}
/** Reads actual tags without changing the original file. */
export async function localMusicMetadata(path:string,signal:AbortSignal):Promise<{title:string;artist:string;album:string;duration:number}>{const bytes=await run('ffprobe.exe',['-v','error','-show_entries','format=duration:format_tags=title,artist,album','-of','json',path],signal),raw=JSON.parse(bytes.toString()),tags=raw.format?.tags||{},text=(value:unknown)=>typeof value==='string'?value.slice(0,1000):'';return {title:text(tags.title||tags.TITLE),artist:text(tags.artist||tags.ARTIST),album:text(tags.album||tags.ALBUM),duration:Number(raw.format?.duration)||0};}
/** Returns a small embedded cover only to the requesting app view. */
export async function localMusicArtwork(path:string,signal:AbortSignal):Promise<string>{const bytes=await run('ffmpeg.exe',['-nostdin','-v','error','-i',path,'-map','0:v:0','-frames:v','1','-vf','scale=256:256:force_original_aspect_ratio=decrease','-f','image2pipe','-c:v','mjpeg','pipe:1'],signal);return bytes.length?'data:image/jpeg;base64,'+bytes.toString('base64'):'';}
