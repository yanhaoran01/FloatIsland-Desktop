/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionFileTools.ts @description Main-owned file grants, rollback and ZIP workers. @author 鸡哥 */
import { app,ipcMain,dialog,BrowserWindow,type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { join,basename,dirname,resolve,relative,sep } from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync,writeFileSync,mkdirSync,renameSync,lstatSync,existsSync,linkSync,unlinkSync,rmSync } from 'node:fs';
import { isFusionView,broadcastFusion } from './fusionWindows';
import { inspectZip,renamedFile,validFileName } from './fileToolOperations';
import type { GrantedFile,RenameOptions,RenameEntry,RenamePreview,FileOperationResult,StopwatchState } from '../../preload/types/fusionFileTools';
import {recordProductHistory} from './fusionProductService';
import { productGrants,grantArtifact } from './productArtifacts';
interface Grant {path:string;name:string;size:number;device:number;inode:number;}
interface Plan {entries:RenameEntry[];paths:Array<{before:string;after:string;beforeName:string;grant:Grant}>;}
const fileRequire=createRequire(__filename);
export const fusionArchiveWorkerCode=`
 const {parentPort,workerData:d}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path'),z=require(d.library);
 const inspectZip=${inspectZip.toString()};
 const readGrant=file=>{const stat=fs.lstatSync(file.path);if(!stat.isFile()||stat.isSymbolicLink()||stat.ino!==file.inode||stat.dev!==file.device)throw Error('file-changed');if(stat.size>268435456)throw Error('archive-limit');return fs.readFileSync(file.path);};
 try{
  if(d.mode==='list'){parentPort.postMessage({entries:inspectZip(readGrant(d.files[0]))});}
  else if(d.mode==='pack'){
   const input=Object.create(null);let total=0;
   d.files.forEach((file,index)=>{const stat=fs.lstatSync(file.path);if(!stat.isFile()||stat.isSymbolicLink()||stat.ino!==file.inode||stat.dev!==file.device)throw Error('file-changed');total+=stat.size;if(total>268435456)throw Error('archive-limit');input[file.name]=readGrant(file);parentPort.postMessage({progress:(index+1)/d.files.length*.4});});
   const bytes=z.zipSync(input,{level:6});fs.writeFileSync(d.temporary,bytes,{flag:'wx'});parentPort.postMessage({done:true});
  }else{
   const bytes=readGrant(d.files[0]),entries=inspectZip(bytes),chosen=new Set(d.entries);
   if([...chosen].some(name=>!entries.some(entry=>entry.name===name&&!entry.directory)))throw Error('invalid-archive-selection');
   const output=z.unzipSync(bytes,{filter:entry=>{const meta=entries.find(item=>item.name===entry.name);if(!meta||meta.size!==entry.originalSize)throw Error('unsafe-archive-size');return chosen.has(entry.name);}});let index=0;
   for(const [name,buffer] of Object.entries(output)){const target=path.resolve(d.output,name),rel=path.relative(d.output,target);if((rel==='..'||rel.startsWith('..'+path.sep))||path.isAbsolute(rel))throw Error('unsafe-archive-path');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,buffer,{flag:'wx'});parentPort.postMessage({progress:++index/Math.max(1,chosen.size)});}
   parentPort.postMessage({done:true});
  }
 }catch(error){parentPort.postMessage({error:error.message||String(error)});}
`;
export const fusionRenameCapability:{preview:(sender:WebContents,ids:string[],options:RenameOptions)=>RenamePreview;execute:(sender:WebContents,id:string)=>FileOperationResult;undo:(sender:WebContents)=>FileOperationResult}={
 preview:()=>{throw Error('file-service-not-ready');},execute:()=>{throw Error('file-service-not-ready');},undo:()=>{throw Error('file-service-not-ready');},
};
/** Registers allowlisted capabilities; web guests cannot obtain file grants. */
export function registerFusionFileTools():void {
 const grants=productGrants,plans=new WeakMap<WebContents,Map<string,Plan>>(),undo=new WeakMap<WebContents,Plan>();
 const jobs=new Map<string,{owner:WebContents;worker:Worker;cleanup:()=>void;cancel:()=>Promise<boolean>}>();let renaming=false;
 const handle=(channel:string,fn:(sender:WebContents,...args:any[])=>unknown):void=>{ipcMain.handle(channel,(event,...args)=>{if(!isFusionView(event.sender))throw Error('untrusted-view');return fn(event.sender,...args);});};
 const select=(sender:WebContents,ids:string[]):Grant[]=>{
  if(!Array.isArray(ids)||!ids.length||ids.length>1000||new Set(ids).size!==ids.length)throw Error('choose-files');
  return ids.map(id=>{const grant=grants.get(sender)?.get(id);if(!grant)throw Error('file-not-authorized');const stat=lstatSync(grant.path);if(!stat.isFile()||stat.isSymbolicLink()||stat.ino!==grant.inode||stat.dev!==grant.device)throw Error('file-changed');return grant;});
 };
 handle('fusion:files:select',async(sender,kind:string):Promise<GrantedFile[]>=>{
  if(!['files','zip'].includes(kind))throw Error('invalid-file-kind');
  const options:Electron.OpenDialogOptions={properties:['openFile',...(kind==='files'?['multiSelections' as const]:[])],filters:kind==='zip'?[{name:'ZIP',extensions:['zip']}]:undefined};
  const parent=BrowserWindow.fromWebContents(sender),result=parent?await dialog.showOpenDialog(parent,options):await dialog.showOpenDialog(options);if(result.canceled)return [];
  const owned=grants.get(sender)??new Map<string,Grant>();grants.set(sender,owned);
  if(owned.size+result.filePaths.length>2000)throw Error('file-limit');
  return result.filePaths.map(path=>grantArtifact(sender,path));
 });
 fusionRenameCapability.preview=(sender:WebContents,ids:string[],options:RenameOptions):RenamePreview=>{
  const files=select(sender,ids),targets=new Set<string>();
  const paths=files.map((grant,index)=>({grant,before:grant.path,beforeName:grant.name,name:renamedFile(grant.name,index,options),after:join(dirname(grant.path),renamedFile(grant.name,index,options))}));
  const entries=paths.map((item,index)=>{const name=item.name,key=item.after.toLowerCase();let error=!validFileName(name)?'invalid-file-name':targets.has(key)?'rename-conflict':existsSync(item.after)&&item.after.toLowerCase()!==item.before.toLowerCase()?'rename-conflict':'';targets.add(key);return {id:ids[index],before:item.grant.name,after:name,error};});
  const id=randomUUID(),owned=plans.get(sender)??new Map<string,Plan>();owned.clear();owned.set(id,{paths,entries});plans.set(sender,owned);return {id,entries};
 };
 handle('fusion:files:rename-preview',fusionRenameCapability.preview);
 const execute=(plan:Plan,reverse=false):FileOperationResult=>{
  if(renaming)throw Error('file-busy');if(plan.entries.some(entry=>entry.error))throw Error('rename-conflict');
  renaming=true;const completed:Array<{before:string;after:string;previousName:string;grant:Grant}>=[],rollbackErrors:string[]=[];
  try{
   for(const item of plan.paths){const before=reverse?item.after:item.before,after=reverse?item.before:item.after;if(before===after)continue;
    const stat=lstatSync(before);if(!stat.isFile()||stat.isSymbolicLink()||stat.ino!==item.grant.inode||stat.dev!==item.grant.device)throw Error('file-changed');
    if(existsSync(after)&&after.toLowerCase()!==before.toLowerCase())throw Error('rename-conflict');
    // Exclusive hard link prevents races from overwriting a newly created target.
    if(after.toLowerCase()===before.toLowerCase()){const temporary=before+'.fusion-'+randomUUID();renameSync(before,temporary);try{renameSync(temporary,after);}catch(error){renameSync(temporary,before);throw error;}}
    else{linkSync(before,after);try{unlinkSync(before);}catch(error){try{unlinkSync(after);}catch(reason){rollbackErrors.push(after+': '+String(reason));}throw error;}}
    const previousName=item.grant.name;item.grant.path=after;item.grant.name=reverse?item.beforeName:basename(after);completed.push({before,after,previousName,grant:item.grant});
   }
   return {ok:true,entries:plan.entries};
  }catch(error){
   for(const item of completed.reverse())try{if(item.before.toLowerCase()===item.after.toLowerCase()){const temporary=item.after+'.fusion-'+randomUUID();renameSync(item.after,temporary);try{renameSync(temporary,item.before);}catch(error){renameSync(temporary,item.after);throw error;}}else{if(existsSync(item.before))throw Error('rollback-conflict');linkSync(item.after,item.before);unlinkSync(item.after);}item.grant.path=item.before;item.grant.name=item.previousName;}catch(reason){rollbackErrors.push(item.before+': '+String(reason));}
   return {ok:false,entries:plan.entries,rollbackErrors:[String(error),...rollbackErrors]};
  }finally{renaming=false;}
 };
 fusionRenameCapability.execute=(sender,id)=>{const plan=plans.get(sender)?.get(id);if(!plan)throw Error('stale-rename-preview');plans.get(sender)!.delete(id);const result=execute(plan);if(result.ok)undo.set(sender,plan);return result;};
 fusionRenameCapability.undo=sender=>{const plan=undo.get(sender);if(!plan)throw Error('nothing-to-undo');const result=execute(plan,true);if(result.ok)undo.delete(sender);return result;};
 handle('fusion:files:rename-execute',fusionRenameCapability.execute);
 handle('fusion:files:rename-undo',fusionRenameCapability.undo);
 handle('fusion:files:archive-list',(sender,id:string)=>new Promise((ok,fail)=>{
  const files=select(sender,[id]),worker=new Worker(fusionArchiveWorkerCode,{eval:true,workerData:{mode:'list',files,library:fileRequire.resolve('fflate')}});
  const destroyed=():void=>{void worker.terminate();fail(Error('cancelled'));};sender.once('destroyed',destroyed);
  const timer=setTimeout(()=>{void worker.terminate();fail(Error('job-timeout'));},15000);
  worker.on('message',result=>{clearTimeout(timer);sender.removeListener('destroyed',destroyed);void worker.terminate();result.error?fail(Error(result.error)):ok(result.entries.filter((entry:{directory:boolean})=>!entry.directory));});
  worker.on('error',error=>{clearTimeout(timer);sender.removeListener('destroyed',destroyed);fail(error);});
 }));
 handle('fusion:files:archive-start',async(sender,mode:string,ids:string[],entries:string[]=[]):Promise<string|null>=>{
  if(!['pack','extract'].includes(mode))throw Error('invalid-archive-operation');const files=select(sender,ids);
  if(mode==='extract'&&(files.length!==1||!Array.isArray(entries)||!entries.length||entries.length>10000||entries.some(name=>typeof name!=='string')))throw Error('invalid-archive-selection');
  if(mode==='pack'&&new Set(files.map(file=>file.name.toLowerCase())).size!==files.length)throw Error('rename-conflict');
  const parent=BrowserWindow.fromWebContents(sender);let output='',authorizedParent='';
  if(mode==='pack'){const options={defaultPath:'archive.zip',filters:[{name:'ZIP',extensions:['zip']}]};const target=parent?await dialog.showSaveDialog(parent,options):await dialog.showSaveDialog(options);if(target.canceled||!target.filePath)return null;output=resolve(target.filePath);if(existsSync(output))throw Error('output-exists');authorizedParent=dirname(output);}
  else{const options:Electron.OpenDialogOptions={properties:['openDirectory']};const target=parent?await dialog.showOpenDialog(parent,options):await dialog.showOpenDialog(options);if(target.canceled)return null;authorizedParent=resolve(target.filePaths[0]);output=join(authorizedParent,basename(files[0].name,'.zip')+'-'+randomUUID().slice(0,8));}
  const id=randomUUID(),temporary=join(authorizedParent,'.fusion-archive-'+id);mkdirSync(temporary);const archive=join(temporary,'archive.zip');
  if(mode==='extract')mkdirSync(output);
  const cleanup=():void=>{for(const target of [temporary,...(mode==='extract'?[output]:[])]){const rel=relative(authorizedParent,resolve(target));if(!rel||rel==='..'||rel.startsWith('..'+sep)||resolve(target)===authorizedParent)throw Error('unsafe-cleanup');if(existsSync(target))rmSync(target,{recursive:true,force:true});}};
  const worker=new Worker(fusionArchiveWorkerCode,{eval:true,workerData:{mode,files,entries,output,temporary:archive,library:fileRequire.resolve('fflate')}});
  const publish=(value:{state:string;progress:number;output?:string;error?:string}):void=>{if(['done','error','cancelled'].includes(value.state))recordProductHistory('zip',id,value.state,value.output?basename(value.output):files.map(file=>file.name).join(', '));if(!sender.isDestroyed())sender.send('fusion:files:job',{id,...value});};
  const destroyed=():void=>{void cancel();};
  const finish=():void=>{clearTimeout(timer);jobs.delete(id);sender.removeListener('destroyed',destroyed);};
  const cancel=async():Promise<boolean>=>{if(!jobs.has(id))return false;finish();await worker.terminate();cleanup();publish({state:'cancelled',progress:0});return true;};
  const timer=setTimeout(()=>void cancel(),120000);sender.once('destroyed',destroyed);jobs.set(id,{owner:sender,worker,cleanup,cancel});
  worker.on('message',result=>{if(!jobs.has(id))return;if(result.error){finish();void worker.terminate().then(()=>{cleanup();publish({state:'error',progress:0,error:result.error});});}
   else if(result.done){try{if(mode==='pack'){linkSync(archive,output);unlinkSync(archive);}rmSync(temporary,{recursive:true,force:true});finish();publish({state:'done',progress:1,output});void worker.terminate();}catch(error){finish();void worker.terminate().then(()=>{cleanup();publish({state:'error',progress:0,error:String(error)});});}}
   else publish({state:'running',progress:result.progress});});
  worker.on('error',error=>{if(!jobs.has(id))return;finish();cleanup();publish({state:'error',progress:0,error:String(error)});});
  return id;
 });
 handle('fusion:files:cancel',(sender,id:string)=>{const job=jobs.get(id);return job&&job.owner===sender?job.cancel():false;});
 // Stopwatch is persisted independently and never restarts recording or timing on launch.
 const watchFile=join(app.getPath('userData'),'eIsland_store','fusion-stopwatch.json');let stopwatch:StopwatchState={version:1,elapsedMs:0,startedAt:null,laps:[]},runAt=0;
 try{const saved=JSON.parse(readFileSync(watchFile,'utf8'));if(saved.version===1&&Number.isFinite(saved.elapsedMs)&&saved.elapsedMs>=0&&Array.isArray(saved.laps)&&saved.laps.every((value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0))stopwatch={version:1,elapsedMs:saved.elapsedMs,startedAt:null,laps:saved.laps.slice(0,10000)};}catch{}
 const snapshot=():StopwatchState=>({...stopwatch,elapsedMs:stopwatch.elapsedMs+(stopwatch.startedAt===null?0:performance.now()-runAt),startedAt:stopwatch.startedAt===null?null:Date.now(),laps:[...stopwatch.laps]});
 const persist=():void=>{mkdirSync(dirname(watchFile),{recursive:true});writeFileSync(watchFile+'.tmp',JSON.stringify({...snapshot(),startedAt:null}));renameSync(watchFile+'.tmp',watchFile);};
 handle('fusion:stopwatch:get',snapshot);
 handle('fusion:stopwatch:control',(_sender,action:string)=>{
  if(!['start','pause','lap','reset'].includes(action))throw Error('invalid-stopwatch-action');
  if(action==='start'&&stopwatch.startedAt===null){runAt=performance.now();stopwatch.startedAt=Date.now();}
  if(action==='pause'&&stopwatch.startedAt!==null){stopwatch.elapsedMs=snapshot().elapsedMs;stopwatch.startedAt=null;}
  if(action==='reset')stopwatch={version:1,elapsedMs:0,startedAt:null,laps:[]};
  if(action==='lap'&&stopwatch.startedAt!==null){if(stopwatch.laps.length>=10000)throw Error('record-limit');stopwatch.laps.push(snapshot().elapsedMs);}
  persist();const value=snapshot();broadcastFusion('fusion:stopwatch:updated',value);return value;
 });
 const interval=setInterval(()=>{if(stopwatch.startedAt!==null){persist();broadcastFusion('fusion:stopwatch:updated',snapshot());}},5000);interval.unref();
 app.once('before-quit',()=>{clearInterval(interval);persist();for(const job of jobs.values())void job.cancel();});
}
