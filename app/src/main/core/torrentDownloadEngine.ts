/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file torrentDownloadEngine.ts @description Owned BT metadata, selected-file downloads and verified exclusive output commits. @author 鸡哥 */
import {promises as fs,createReadStream} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {join,dirname,basename} from 'node:path';
import type {DownloadTask,DownloadPreferences,TorrentDraft,TorrentFile} from '../../preload/types/download';
import {magnetUrl,torrentRelativePath} from './torrentModel';
import {cleanupTorrentPending,stageTorrentFile} from './torrentPending';
interface Rpc {call<T>(method:string,params?:unknown[]):Promise<T>;close():void;}
interface RawStatus {gid:string;status:string;infoHash?:string;totalLength:string;completedLength:string;downloadSpeed:string;uploadSpeed:string;numPeers?:string;errorMessage?:string;followedBy?:string[];files?:Array<{index:string;path:string;length:string;completedLength:string;selected:string}>;bittorrent?:{info?:{name?:string}};}
interface Draft {value:TorrentDraft;url:string;gid:string;root:string;}
interface Job {value:DownloadTask;gid?:string;launching?:boolean;finishing?:boolean;controlling?:boolean;launch?:Promise<void>;}
interface Options {rpc:Rpc;root:string;preferences:()=>DownloadPreferences;capacity:()=>number;updated:(task:DownloadTask)=>void;}
/** Coordinates only tasks created by this app; metadata previews never become completed history records. */
export class TorrentDownloadEngine {
 private readonly drafts=new Map<string,Draft>();private readonly jobs=new Map<string,Job>();private readonly inspections=new Map<string,AbortController>();private timer:ReturnType<typeof setInterval>|undefined;private polling=false;private closing=false;
 constructor(private options:Options,restored:DownloadTask[]=[]){for(const value of restored)if(value.engine==='aria2'&&value.torrent&&/^[a-f\d-]{36}$/i.test(value.id)&&value.temporaryDirectory===join(options.root,value.id))this.jobs.set(value.id,{value:structuredClone(value)});}
 private async folder(id:string):Promise<string>{const root=join(this.options.root,id);await fs.mkdir(root,{recursive:true});const info=await fs.lstat(root);if(!info.isDirectory()||info.isSymbolicLink())throw Error('file-not-authorized');return root;}
 private publish(job:Job,patch:Partial<DownloadTask>={}):void{Object.assign(job.value,patch,{updatedAt:Date.now()});this.options.updated(structuredClone(job.value));}
 private metadata(raw:RawStatus,id:string,root:string):TorrentDraft{const files=(raw.files||[]).map(file=>({index:Number(file.index),path:torrentRelativePath(root,file.path),size:Number(file.length),completed:Number(file.completedLength),selected:file.selected==='true'}));if(files.length>10000||files.some(f=>!Number.isSafeInteger(f.index)||f.index<1||!Number.isSafeInteger(f.size)||f.size<0))throw Error('file-limit');return {id,name:(raw.bittorrent?.info?.name||basename(files[0]?.path||'download')).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,160),infoHash:raw.infoHash||'',files,totalBytes:files.reduce((total,file)=>total+file.size,0)};}
 /** Acquires metadata into a dedicated staging directory before downloading selected files.
  * @param requestId - Owned request. @param source - Magnet or selected torrent bytes. @returns Draft.
  */
 async inspect(requestId:string,source:{url?:string;bytes?:Uint8Array}):Promise<TorrentDraft>{
  if(this.closing||!/^[\w-]{1,100}$/.test(requestId)||this.inspections.has(requestId)||this.drafts.size>=20)throw Error('bt-invalid-source');
  const controller=new AbortController(),id=randomUUID(),root=await this.folder(id),firstGid=randomBytes(8).toString('hex');this.inspections.set(requestId,controller);let gid=firstGid,added=false;
  try{
   let url:string;if(source.bytes){if(!(source.bytes instanceof Uint8Array)||source.bytes.length>10000000)throw Error('file-too-large');await fs.writeFile(join(root,'source.torrent'),source.bytes,{flag:'wx'});url='torrent:'+id;const returned=await this.options.rpc.call<string>('addTorrent',[Buffer.from(source.bytes).toString('base64'),[],{gid,dir:root,pause:'true'}]);if(returned!==gid)throw Error('bt-duplicate-task');}
   else{url=magnetUrl(source.url||'');const returned=await this.options.rpc.call<string>('addUri',[[url],{gid,dir:root,'pause-metadata':'true'}]);if(returned!==gid)throw Error('bt-duplicate-task');}added=true;
   for(let n=0;n<450;n++){
    controller.signal.throwIfAborted();const raw=await this.options.rpc.call<RawStatus>('tellStatus',[gid]);
    if(raw.status==='error'||raw.status==='removed')throw Error('bt-engine-error: '+(raw.errorMessage||raw.status));
    if(raw.followedBy?.length){gid=raw.followedBy[0];controller.signal.throwIfAborted();continue;}
    if(raw.files?.length&&raw.bittorrent?.info){await this.options.rpc.call('pause',[gid]).catch(()=>{});const value=this.metadata(raw,id,root);if([...this.jobs.values()].some(j=>j.value.torrent?.infoHash===value.infoHash&& !['completed','canceled'].includes(j.value.status)))throw Error('bt-duplicate-task');this.drafts.set(id,{value,url,gid,root});return structuredClone(value);}
    await new Promise(resolve=>setTimeout(resolve,200));
   }throw Error('bt-metadata-timeout');
  }catch(error){if(added){await this.options.rpc.call('forceRemove',[gid]).catch(()=>{});if(gid!==firstGid)await this.options.rpc.call('removeDownloadResult',[firstGid]).catch(()=>{});}await fs.rm(root,{recursive:true,force:true});throw controller.signal.aborted?Error('job-cancelled'):error;}
  finally{this.inspections.delete(requestId);}
 }
 /** Cancels only a metadata request owned by its IPC caller. @param id - Request. @returns Found. */
 cancelInspection(id:string):boolean{const controller=this.inspections.get(id);controller?.abort();return Boolean(controller);}
 /** Releases a rejected preview after stopping its paused engine task. @param id - Draft. @returns Found. */
 async discard(id:string):Promise<boolean>{const draft=this.drafts.get(id);if(!draft)return false;await this.options.rpc.call('forceRemove',[draft.gid]).catch(()=>{});this.drafts.delete(id);await fs.rm(draft.root,{recursive:true,force:true});return true;}
 /** Starts an explicit file selection in the existing download history.
  * @param id - Draft. @param selected - File indices. @param directory - Native selected output. @returns Task.
  */
 async start(id:string,selected:number[],directory:string):Promise<DownloadTask>{
  const draft=this.drafts.get(id);if(!draft||!Array.isArray(selected)||!selected.length||selected.some(index=>!draft.value.files.some(f=>f.index===index)))throw Error('bt-invalid-selection');
  await fs.mkdir(directory,{recursive:true});const info=await fs.lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw Error('file-not-authorized');
  const indices=[...new Set(selected)];await this.options.rpc.call('changeOption',[draft.gid,{'select-file':indices.join(','),...this.taskOptions()}]);
  const now=Date.now(),torrent={...draft.value,files:draft.value.files.map(f=>({...f,selected:indices.includes(f.index)}))};
  const value:DownloadTask={id,url:draft.url,fileName:torrent.name,savePath:directory,outputDir:directory,temporaryDirectory:draft.root,torrent,engine:'aria2',status:'queued',phase:'queued',canPause:true,canResume:true,totalBytes:torrent.files.filter(f=>f.selected).reduce((sum,f)=>sum+f.size,0),downloadedBytes:0,progress:0,speedBytesPerSecond:0,estimatedFinishAt:null,threads:1,createdAt:now,updatedAt:now};
  const job={value,gid:draft.gid};this.jobs.set(id,job);this.drafts.delete(id);this.publish(job);this.watch();this.pump();return structuredClone(value);
 }
 private taskOptions():Record<string,string>{const p=this.options.preferences();return {'max-download-limit':String(p.downloadLimit||0),'max-upload-limit':String(p.uploadLimit||0),'seed-time':String(p.seedMinutes||0),'seed-ratio':String(p.seedRatio||1)};}
 /** Refreshes active limits from the shared preferences. @returns No value. */
 async configure():Promise<void>{for(const job of this.jobs.values())if(job.gid&&job.value.status==='downloading')await this.options.rpc.call('changeOption',[job.gid,this.taskOptions()]);}
 /** Counts committed tasks consuming shared concurrency. @returns Count. */
 activeCount():number{return [...this.jobs.values()].filter(j=>j.launching||j.value.status==='downloading').length;}
 /** Starts queued BT tasks only when shared capacity is available. @returns No value. */
 pump():void{if(this.closing)return;let free=this.options.capacity()-this.activeCount();for(const job of this.jobs.values())if(free>0&&job.value.status==='queued'&&!job.launching&&!job.controlling){free--;job.launching=true;job.launch=this.activate(job).catch(error=>{if(!job.controlling&&!this.closing)this.publish(job,{status:'failed',errorMessage:String(error),canPause:false,canResume:true});}).finally(()=>{job.launching=false;});}}
 private async activate(job:Job):Promise<void>{
  if(job.value.phase==='verifying'){job.finishing=true;try{await this.finish(job,job.value.torrent!.files);}finally{job.finishing=false;}return;}
  if(!job.gid){const root=await this.folder(job.value.id),gid=randomBytes(8).toString('hex'),source=join(root,'source.torrent'),options={gid,dir:root,pause:'true',...this.taskOptions(),'select-file':job.value.torrent!.files.filter(f=>f.selected).map(f=>f.index).join(',')};
   try{const bytes=await fs.readFile(source);job.gid=await this.options.rpc.call<string>('addTorrent',[bytes.toString('base64'),[],options]);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;job.gid=await this.options.rpc.call<string>('addUri',[[magnetUrl(job.value.url)],{...options,pause:'false','pause-metadata':'true'}]);this.publish(job,{phase:'metadata'});}
  }
  if(job.value.status!=='queued'||job.controlling||this.closing)return;await this.options.rpc.call('unpause',[job.gid]).catch(error=>{if(job.value.phase!=='metadata')throw error;});if(job.controlling||this.closing||job.value.status!=='queued')return;this.publish(job,{status:'downloading',phase:job.value.phase==='metadata'?'metadata':'downloading',canPause:true,canResume:true,errorMessage:undefined});this.watch();
 }
 private watch():void{if(!this.timer)this.timer=setInterval(()=>void this.poll(),500);}
 private async poll():Promise<void>{if(this.polling||this.closing)return;this.polling=true;try{for(const job of this.jobs.values()){
  if(!job.gid||job.finishing||job.controlling||job.value.status!=='downloading')continue;
  try{const raw=await this.options.rpc.call<RawStatus>('tellStatus',[job.gid]);if(job.controlling||this.closing||job.value.status!=='downloading')continue;if(raw.followedBy?.length){job.gid=raw.followedBy[0];await this.options.rpc.call('changeOption',[job.gid,{'select-file':job.value.torrent!.files.filter(f=>f.selected).map(f=>f.index).join(','),...this.taskOptions()}]);await this.options.rpc.call('unpause',[job.gid]);continue;}
   if(raw.status==='error')throw Error('bt-engine-error: '+(raw.errorMessage||''));if(raw.status==='removed')continue;
   if(job.controlling||this.closing||job.value.status!=='downloading')continue;
   if(!raw.bittorrent?.info){this.publish(job,{phase:'metadata',speedBytesPerSecond:Number(raw.downloadSpeed)||0,peers:Number(raw.numPeers)||0});continue;}
   const files=this.metadata(raw,job.value.id,job.value.temporaryDirectory!).files;
   const selected=files.filter(f=>f.selected),total=selected.reduce((sum,f)=>sum+f.size,0),done=selected.reduce((sum,f)=>sum+Math.min(f.size,f.completed),0),speed=Number(raw.downloadSpeed)||0;
   if(raw.status==='complete'){job.finishing=true;this.publish(job,{phase:'verifying',torrent:{...job.value.torrent!,files},canPause:false,canResume:false});try{await this.finish(job,files);}finally{job.finishing=false;}continue;}
   this.publish(job,{torrent:{...job.value.torrent!,files:files.length?files:job.value.torrent!.files},totalBytes:total,downloadedBytes:done,progress:total?done/total:0,speedBytesPerSecond:speed,estimatedFinishAt:speed?Date.now()+Math.max(0,total-done)/speed*1000:null,peers:Number(raw.numPeers)||0,uploadSpeed:Number(raw.uploadSpeed)||0,phase:files.length&&selected.every(f=>f.completed>=f.size)?'seeding':raw.bittorrent?.info?'downloading':'metadata'});
  }catch(error){if(!job.controlling&&!this.closing)this.publish(job,{status:'failed',canPause:false,canResume:true,speedBytesPerSecond:0,errorMessage:String(error)});}
 }}finally{this.polling=false;this.pump();}}
 private async finish(job:Job,files:TorrentFile[]):Promise<void>{
  const root=job.value.temporaryDirectory!;if(root!==join(this.options.root,job.value.id))throw Error('file-not-authorized');
  await cleanupTorrentPending(root,job.value.outputDir!,job.value.id);
  let committed:Record<string,{path:string;sha256:string}>={};const journal=join(root,'commit.json');try{committed=JSON.parse(await fs.readFile(journal,'utf8'));}catch{}
  const outputs:string[]=[];for(const file of files.filter(f=>f.selected)){
   if(this.closing)throw Error('job-cancelled');const source=join(root,file.path);torrentRelativePath(root,source);torrentRelativePath(root,await fs.realpath(source));const info=await fs.lstat(source);if(!info.isFile()||info.isSymbolicLink()||info.size!==file.size||file.completed!==file.size)throw Error('download-size-mismatch');
   const hash=createHash('sha256');for await(const data of createReadStream(source))hash.update(data);const sha256=hash.digest('hex'),old=committed[file.path];let target=old?.sha256===sha256?old.path:'';
   if(target){torrentRelativePath(job.value.outputDir!,target);try{const s=await fs.lstat(target);if(!s.isFile()||s.isSymbolicLink()||s.size!==file.size)target='';else{const h=createHash('sha256');for await(const data of createReadStream(target))h.update(data);if(h.digest('hex')!==sha256)target='';}}catch{target='';}}
   if(!target){const desired=join(job.value.outputDir!,file.path);torrentRelativePath(job.value.outputDir!,desired);await fs.mkdir(dirname(desired),{recursive:true});const parent=await fs.realpath(dirname(desired));torrentRelativePath(job.value.outputDir!,join(parent,basename(desired)));
    const pending=await stageTorrentFile(root,parent,job.value.id,source,sha256);
    try{for(let n=0;n<100000;n++){if(this.closing)throw Error('job-cancelled');const candidate=n?join(dirname(desired),`(${n}) `+basename(desired)):desired;committed[file.path]={path:candidate,sha256};await fs.writeFile(journal+'.tmp',JSON.stringify(committed));await fs.rename(journal+'.tmp',journal);try{await fs.link(pending,candidate);target=candidate;break;}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}}if(!target)throw Error('file-name-conflict');}finally{await cleanupTorrentPending(root,job.value.outputDir!,job.value.id);}
   }outputs.push(target);
  }
  if(!outputs.length)throw Error('bt-invalid-selection');if(this.closing)return;this.publish(job,{status:'completed',phase:'completed',outputs,savePath:outputs[0],progress:1,downloadedBytes:job.value.totalBytes,speedBytesPerSecond:0,canPause:false,canResume:false});
  await this.options.rpc.call('removeDownloadResult',[job.gid]).catch(()=>{});job.gid=undefined;await fs.rm(root,{recursive:true,force:true}).catch(error=>console.warn('BT staging cleanup:',error));
 }
 /** Pauses, resumes or cancels only an owned task. @param id - Task. @param command - Control. @returns Snapshot or null. */
 async control(id:string,command:'pause'|'resume'|'cancel'):Promise<DownloadTask|null>{
  const job=this.jobs.get(id);if(!job||job.finishing||job.controlling||['completed','canceled'].includes(job.value.status))return null;
  if(command==='resume'){if(!['failed','paused'].includes(job.value.status))return null;this.publish(job,{status:'queued',phase:job.value.phase==='verifying'?'verifying':'queued',errorMessage:undefined,canPause:true,canResume:true});this.watch();this.pump();return structuredClone(job.value);}
  job.controlling=true;try{await job.launch;if(job.gid)await this.options.rpc.call(command==='pause'?'forcePause':'forceRemove',[job.gid]);
   this.publish(job,{status:command==='pause'?'paused':'canceled',canPause:false,canResume:command==='pause',speedBytesPerSecond:0});
   if(command==='cancel'){job.gid=undefined;await cleanupTorrentPending(join(this.options.root,id),job.value.outputDir!,id);await fs.rm(join(this.options.root,id),{recursive:true,force:true});}return structuredClone(job.value);
  }finally{job.controlling=false;this.pump();}
 }
 /** Removes history only for stopped tasks. @param id - Task. @returns Removed. */
 async remove(id:string):Promise<boolean>{const job=this.jobs.get(id);if(!job||job.finishing||job.controlling||['downloading','queued'].includes(job.value.status))return false;if(job.value.status!=='completed'&&job.value.status!=='canceled')await this.control(id,'cancel');this.jobs.delete(id);return true;}
 /** Stops the owned engine; incomplete snapshots remain paused for explicit restart recovery. @returns No value. */
 close():void{this.closing=true;if(this.timer)clearInterval(this.timer);this.inspections.forEach(c=>c.abort());for(const job of this.jobs.values())if(['downloading','queued'].includes(job.value.status))this.publish(job,{status:'paused',speedBytesPerSecond:0,canPause:false});this.options.rpc.close();}
}
