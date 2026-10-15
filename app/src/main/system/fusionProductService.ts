/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionProductService.ts @description Shared artifacts, capabilities and persisted step workflows. @author 鸡哥 */
import { app,BrowserWindow,clipboard,dialog,globalShortcut,ipcMain,nativeImage,shell,type WebContents } from 'electron';
import { readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,copyFileSync,rmSync } from 'node:fs';
import { basename,dirname,join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { createActor,fromPromise } from 'xstate';
import type { ProductAction,ProductArtifact,ProductData,ProductFlow,ProductJob,ProductOptions } from '../../preload/types/fusionProduct';
import { PRODUCT_ACTIONS,PRODUCT_PRESETS,validateProductFlow } from '../../shared/productActions';
import { playFusionNativeFile,pauseFusionMedia } from './fusionBrowserService';
import { isFusionView } from './fusionWindows';
import { requireArtifact,readArtifact,createArtifact,grantArtifact,artifactMetadata,artifactOutput } from './productArtifacts';
import { createProductTask,publishProductTask,productTasks,confirmProductTask,runProductFfmpeg,runProductWorker,type ProductTask } from './productJobs';
import { fusionRenameCapability,fusionArchiveWorkerCode } from './fusionFileTools';
import { recognizeCaptureText } from '../services/captureOcrService';

const requireModule=createRequire(__filename);
let data:ProductData={version:1,revision:0,flows:structuredClone(PRODUCT_PRESETS),history:[],hotkey:'Ctrl+Alt+K'};
let dataFile='';let registeredKey='';
const num=(options:ProductOptions,key:string,fallback:number,min:number,max:number):number=>{const value=Number(options[key]??fallback);if(!Number.isFinite(value)||value<min||value>max)throw Error('invalid-number');return value;};
const text=(options:ProductOptions,key:string,fallback=''):string=>String(options[key]??fallback);
function readAccountToken():string {try{const value:unknown=JSON.parse(readFileSync(join(app.getPath('userData'),'eIsland_store','user-account-token.json'),'utf8'));return typeof value==='string'?value:'';}catch{return '';}}
const persist=():void=>{mkdirSync(dirname(dataFile),{recursive:true});writeFileSync(dataFile+'.tmp',JSON.stringify(data));renameSync(dataFile+'.tmp',dataFile);};
const remember=(task:ProductTask):void=>{data.history=[{id:task.value.id,kind:task.value.action??task.value.kind,time:Date.now(),name:task.value.result.map(x=>x.name).join(', '),state:task.value.state},...data.history].slice(0,100);data.revision++;persist();};
/** Records each original ZIP task in its own versioned history. */
export function recordProductHistory(kind:string,id:string,state:string,name:string):void {data.history=[{id,kind,state,name,time:Date.now()},...data.history].slice(0,100);data.revision++;persist();}
const save=async(owner:WebContents,id:string):Promise<boolean>=>{const file=requireArtifact(owner,id),window=BrowserWindow.fromWebContents(owner);const selected=await dialog.showSaveDialog(window??BrowserWindow.getAllWindows()[0],{defaultPath:file.name});if(selected.canceled||!selected.filePath)return false;copyFileSync(file.path,selected.filePath);return true;};
const zip=async(task:ProductTask,ids:string[]):Promise<ProductArtifact[]>=>{
 const files=ids.map(id=>requireArtifact(task.owner,id));if(new Set(files.map(f=>f.name)).size!==files.length)throw Error('rename-conflict');
 const output=artifactOutput('archive.zip');try{await new Promise<void>((resolve,reject)=>{
  const worker=new Worker(fusionArchiveWorkerCode,{eval:true,workerData:{mode:'pack',files,library:requireModule.resolve('fflate'),temporary:output}});
  let settled=false;const done=(error?:Error):void=>{if(settled)return;settled=true;clearTimeout(timer);task.controller.signal.removeEventListener('abort',cancel);void worker.terminate();error?reject(error):resolve();};
  const cancel=():void=>done(Error('job-cancelled'));const timer=setTimeout(()=>done(Error('job-timeout')),120000);task.controller.signal.addEventListener('abort',cancel,{once:true});
  worker.on('message',(value:{done?:boolean;error?:string;progress?:number})=>{if(value.error)done(Error(value.error));else if(value.done)done();else if(value.progress!==undefined)publishProductTask(task,{progress:value.progress});});worker.on('error',done);worker.on('exit',code=>{if(!settled)done(Error('worker-exited-'+code));});
 });return [grantArtifact(task.owner,output,true)];}catch(error){rmSync(output,{force:true});throw error;}
};
/** Executes the same finite capabilities used by tools and saved flows. @param task - Owning task. @param action - Registered action. @param ids - File capabilities. @param options - Primitive options. @returns Result artifacts. */
export async function executeProductAction(task:ProductTask,action:ProductAction,ids:string[],options:ProductOptions):Promise<ProductArtifact[]> {
 const {owner,controller}=task;controller.signal.throwIfAborted();if(!Object.hasOwn(PRODUCT_ACTIONS,action)||!ids.length||ids.length>1000)throw Error('invalid-action');
 const files=ids.map(id=>({id,grant:requireArtifact(owner,id)}));const meta=files.map(f=>artifactMetadata(f.id,f.grant));if(meta.some(f=>!PRODUCT_ACTIONS[action].input.includes(f.kind)))throw Error('flow-type-mismatch');
 if(action==='rename'){
  const preview=fusionRenameCapability.preview(owner,ids,{prefix:text(options,'prefix'),suffix:text(options,'suffix'),find:text(options,'find'),replace:text(options,'replace'),numbered:options.numbered===true,start:num(options,'start',1,0,1e9),digits:num(options,'digits',3,1,12)});
  publishProductTask(task,{state:'waiting',preview:preview.entries});await confirmProductTask(task);if(preview.entries.some(x=>x.error))throw Error('rename-conflict');const result=fusionRenameCapability.execute(owner,preview.id);if(!result.ok)throw Error(JSON.stringify(result));return ids.map(id=>artifactMetadata(id,requireArtifact(owner,id)));
 }
 if(action==='zip')return zip(task,ids);
 if(action==='copy'){const file=files[0];if(meta[0].kind==='image')clipboard.writeImage(nativeImage.createFromPath(file.grant.path));else if(['text','table'].includes(meta[0].kind))clipboard.writeText(readFileSync(file.grant.path,'utf8'));else clipboard.writeText(files.map(f=>f.grant.path).join('\n'));return meta;}
 if(action==='export'){for(const id of ids){controller.signal.throwIfAborted();if(!await save(owner,id))throw Error('job-cancelled');}return meta;}
 if(action==='image-convert'){
  const format=text(options,'format','jpg');if(!['png','jpg','webp'].includes(format))throw Error('unsupported-image');const width=num(options,'width',1600,1,8192),quality=num(options,'quality',85,1,100);const result:ProductArtifact[]=[];
  for(const file of files){const output=artifactOutput(basename(file.grant.name).replace(/\.[^.]+$/,'')+'.'+format);
   try{const args=['-i',file.grant.path,'-vf','scale=min('+width+'\\,iw):-2','-frames:v','1'];if(format==='jpg')args.push('-q:v',String(Math.max(2,Math.round(31-quality*.29))));if(format==='webp')args.push('-quality',String(quality));await runProductFfmpeg([...args,output],controller.signal);controller.signal.throwIfAborted();result.push(grantArtifact(owner,output,true));publishProductTask(task,{result:[...result]});}catch(error){rmSync(output,{force:true});throw error;}
  }return result;
 }
 if(action==='ocr'){
  const value=readArtifact(owner,ids[0]),result=await recognizeCaptureText(readAccountToken(),'data:'+value.artifact.mime+';base64,'+Buffer.from(value.bytes).toString('base64'),controller.signal);if(!result.success)throw Error(result.message||result.code||'ocr-failed');return [createArtifact(owner,Buffer.from(result.text??''),'recognized.txt')];
 }
 if(action==='pdf'){
  const mode=text(options,'mode','merge');if(!['merge','extract','rotate','images'].includes(mode))throw Error('invalid-action');
  const input=files.map(f=>({...readArtifact(owner,f.id),name:f.grant.name}));const result=await runProductWorker({kind:'pdf',mode:mode as 'merge'|'extract'|'rotate'|'images',files:input.map(f=>({name:f.name,mime:f.artifact.mime,bytes:f.bytes})),pages:text(options,'pages'),rotation:num(options,'rotation',90,0,270)},controller.signal);
  controller.signal.throwIfAborted();if(!(result instanceof Uint8Array))throw Error('invalid-result');return [createArtifact(owner,result,'result.pdf')];
 }
 const input=readArtifact(owner,ids[0]);if(input.bytes.length>10_000_000&&action!=='hash')throw Error('text-too-large');let value=new TextDecoder(text(options,'encoding','utf-8')).decode(input.bytes);
 if(action==='hash'){const algorithm=text(options,'algorithm','sha256');if(!['sha256','sha512','md5'].includes(algorithm))throw Error('invalid-action');value=createHash(algorithm).update(input.bytes).digest('hex');}
 else if(action==='text-clean'){let lines=value.split(/\r?\n/);if(options.empty)lines=lines.filter(x=>x.trim());if(options.dedupe)lines=[...new Set(lines)];value=lines.join('\n');if(options.find)value=value.split(text(options,'find')).join(text(options,'replace'));}
 else if(action==='url'){const mode=text(options,'mode','encode');value=mode==='decode'?decodeURIComponent(value):encodeURIComponent(value);}
 else if(action==='csv'){const mode=text(options,'mode','csv-json');if(!['csv-json','json-csv'].includes(mode))throw Error('invalid-action');const result=await runProductWorker({kind:'csv',mode:mode as 'csv-json'|'json-csv',text:value,delimiter:text(options,'delimiter',',')},controller.signal);if(!result||typeof result!=='object'||!('text' in result)||typeof result.text!=='string')throw Error('invalid-result');value=result.text;}
 return [createArtifact(owner,Buffer.from(value),action==='csv'&&text(options,'mode')==='json-csv'?'result.csv':action==='csv'?'result.json':'result.txt')];
}
const perform=async(task:ProductTask,steps:ProductFlow['steps'],inputs:string[]):Promise<void>=>{
 try{let ids=inputs;for(let i=0;i<steps.length;i++){task.controller.signal.throwIfAborted();publishProductTask(task,{step:i,progress:i/steps.length});const step=steps[i],result=await executeProductAction(task,step.action,ids,step.options);ids=result.map(x=>x.id);publishProductTask(task,{result});}publishProductTask(task,{state:'done',progress:1});}
 catch(error){publishProductTask(task,{state:task.controller.signal.aborted||String(error).includes('job-cancelled')?'cancelled':'error',error:error instanceof Error?error.message:String(error)});}
 finally{remember(task);}
};
/** Starts an owned capability task. @param owner - View. @param action - Action. @param ids - Inputs. @param options - Options. @returns Initial snapshot. */
export function startProductAction(owner:WebContents,action:ProductAction,ids:string[],options:ProductOptions):ProductJob {
 const task=createProductTask(owner,'tool');task.value.action=action;void perform(task,[{id:action,action,options}],ids);return {...task.value};
}
/** Registers artifact and workflow APIs. @returns No value. */
export function registerFusionProduct():void {
 dataFile=join(app.getPath('userData'),'fusion-products','data.json');
 try{const loaded:ProductData=JSON.parse(readFileSync(dataFile,'utf8'));if(loaded.version===1&&Array.isArray(loaded.flows)&&Array.isArray(loaded.history)&&typeof loaded.hotkey==='string'){loaded.flows.forEach(validateProductFlow);data=loaded;}}catch{}
 const hotkey=(key:string):void=>{if(key===registeredKey)return;if(!key||!globalShortcut.register(key,()=>{for(const window of BrowserWindow.getAllWindows())if(isFusionView(window.webContents)){window.webContents.send('fusion:product:search');window.show();}}))throw Error('hotkey-conflict');if(registeredKey)globalShortcut.unregister(registeredKey);registeredKey=key;};
 try{hotkey(data.hotkey);data.hotkeyError=undefined;}catch(error){data.hotkeyError=error instanceof Error?error.message:String(error);}app.once('will-quit',()=>{if(registeredKey)globalShortcut.unregister(registeredKey);for(const task of productTasks.values())task.controller.abort();});
 const handle=<A extends unknown[],R>(channel:string,fn:(owner:WebContents,...args:A)=>R):void=>{ipcMain.handle('fusion:product:'+channel,(event,...args:A)=>{if(!isFusionView(event.sender))throw Error('untrusted-view');return fn(event.sender,...args);});};
 handle('pick',async owner=>{const window=BrowserWindow.fromWebContents(owner);const result=window?await dialog.showOpenDialog(window,{properties:['openFile','multiSelections']}):await dialog.showOpenDialog({properties:['openFile','multiSelections']});return result.canceled?[]:result.filePaths.map(path=>grantArtifact(owner,path));});
 handle('import',(owner,paths:string[])=>{if(!Array.isArray(paths)||paths.length>1000||paths.some(path=>typeof path!=='string'))throw Error('file-not-authorized');return paths.map(path=>grantArtifact(owner,path));});
 handle('read',readArtifact);handle('create',createArtifact);handle('text',(owner,value:string)=>{if(typeof value!=='string'||value.length>5_000_000)throw Error('text-too-large');return createArtifact(owner,Buffer.from(value),'input.txt');});
 handle('play',async(owner,id:string)=>{const host=BrowserWindow.fromWebContents(owner);if(!host)throw Error('untrusted-view');const result=await playFusionNativeFile(host,requireArtifact(owner,id).path,false);await pauseFusionMedia();return result;});
 handle('save',save);handle('open',async(owner,id:string)=>shell.openPath(requireArtifact(owner,id).path));
 handle('data',()=>structuredClone(data));
 handle('write',(_owner,next:ProductData,retryHotkey=false)=>{if(typeof retryHotkey!=='boolean')throw Error('invalid-command');if(next.version!==1||next.revision!==data.revision||!Array.isArray(next.flows)||next.flows.length>100)throw Error('data-conflict');next.flows.forEach(validateProductFlow);if(new Set(next.flows.map(f=>f.id)).size!==next.flows.length)throw Error('invalid-flow');if(next.hotkey!==data.hotkey||retryHotkey){hotkey(next.hotkey);data.hotkeyError=undefined;}data={...data,hotkey:next.hotkey,flows:next.flows,revision:data.revision+1};persist();return structuredClone(data);});
 handle('run',startProductAction);
 handle('flow',(owner,id:string,inputs:string[])=>{const flow=data.flows.find(f=>f.id===id);if(!flow)throw Error('invalid-flow');validateProductFlow(flow);const task=createProductTask(owner,'workflow');const actor=createActor(fromPromise(async({signal})=>{signal.addEventListener('abort',()=>task.controller.abort(),{once:true});await perform(task,flow.steps,inputs);return task.value;}));task.controller.signal.addEventListener('abort',()=>actor.stop(),{once:true});actor.start();return {...task.value};});
 handle('job',(owner,id:string,command:'cancel'|'confirm')=>{const task=productTasks.get(id);if(!task||task.owner!==owner)throw Error('invalid-task');if(command==='cancel'){task.controller.abort();publishProductTask(task,{state:'cancelled'});}else if(command==='confirm'&&task.value.state==='waiting'&&!task.value.preview?.some(x=>x.error))task.confirm?.();else throw Error('invalid-command');return {...task.value};});
 const applications=new WeakMap<WebContents,Set<string>>();
 handle('apps',owner=>{let saved:unknown;try{saved=JSON.parse(readFileSync(join(app.getPath('userData'),'eIsland_store','app-shortcuts.json'),'utf8'));}catch{saved=[];}const shortcuts=Array.isArray(saved)?saved.filter((x):x is {id:number;name:string;path:string}=>x&&typeof x==='object'&&typeof x.name==='string'&&typeof x.path==='string'):[];applications.set(owner,new Set(shortcuts.map(x=>x.path)));return shortcuts.map(x=>({...x,id:String(x.id)}));});
 handle('launch',async(owner,path:string)=>{if(!applications.get(owner)?.has(path)||!existsSync(path))throw Error('app-not-authorized');const error=await shell.openPath(path);if(error)throw Error(error);});
}
