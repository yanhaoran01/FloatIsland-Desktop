/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file localImportService.ts @description Main-owned reference import dialogs, folder rescans and cancellation. @author 鸡哥 */
import {app,BrowserWindow,dialog,ipcMain,type WebContents} from 'electron';
import {lstatSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {scanReferences,IMPORT_EXTENSIONS,type ImportDomain,type ReferenceFile,type ReferenceRoot} from './localImportScan';
import {grantArtifact} from './productArtifacts';
import {isFusionView} from './fusionWindows';
import type {LocalImportRequest,LocalImportProgress,LocalImportResult} from '../../preload/types/fusionProduct';
const handlers=new Map<ImportDomain,(owner:WebContents,files:ReferenceFile[])=>Promise<string[]>>();
/** Supplies domain persistence without granting plugins or remote pages filesystem access.
 * @param domain - Existing destination. @param handler - Reference commit callback. @returns No value.
 */
export function setLocalImportHandler(domain:ImportDomain,handler:(owner:WebContents,files:ReferenceFile[])=>Promise<string[]>):void{handlers.set(domain,handler);}
/** Registers one import service for all trusted native app views. @returns No value. */
export function registerLocalImports():void{
 const active=new Map<number,{id:string;controller:AbortController}>(),file=join(app.getPath('userData'),'fusion-workspace','import-folders-v1.json');
 let roots:Partial<Record<ImportDomain,ReferenceRoot[]>>={};try{const raw=JSON.parse(readFileSync(file,'utf8'));if(raw.version===1)roots=raw.roots||{};}catch{/* A missing folder list does not affect imported files. */}
 const check=(owner:WebContents)=>{if(!isFusionView(owner))throw Error('untrusted-view');};
 ipcMain.handle('fusion:product:local-import',async(event,request:LocalImportRequest,dropped?:string[]):Promise<LocalImportResult>=>{
  const owner=event.sender;check(owner);if(event.senderFrame!==owner.mainFrame)throw Error('untrusted-view');
  if(!request||!['music','reading','files'].includes(request.domain)||!['files','folder','drop','rescan'].includes(request.mode)||typeof request.requestId!=='string'||!/^[\w-]{1,100}$/.test(request.requestId))throw Error('invalid-library-command');
  active.get(owner.id)?.controller.abort();const controller=new AbortController(),operation={id:request.requestId,controller};active.set(owner.id,operation);
  const emit=(value:Omit<LocalImportProgress,'requestId'>)=>{if(!owner.isDestroyed())owner.send('fusion:product:local-import-progress',{requestId:request.requestId,...value});};
  const destroyed=()=>controller.abort();owner.once('destroyed',destroyed);
  try{
   let selections:string[]=[];
   if(request.mode==='drop'){if(!Array.isArray(dropped)||!dropped.length)throw Error('file-not-authorized');selections=dropped;}
   else if(request.mode==='rescan'){
    if(!roots[request.domain]?.length)throw Error('import-no-folders');for(const root of roots[request.domain]||[]){const s=lstatSync(root.path);if(s.isSymbolicLink()||!s.isDirectory()||s.dev!==root.device||s.ino!==root.inode)throw Error('file-changed');selections.push(root.path);}
   }else{
    const properties:Electron.OpenDialogOptions['properties']=request.mode==='folder'?['openDirectory']:['openFile','multiSelections'];
    const extensions=IMPORT_EXTENSIONS[request.domain],options:Electron.OpenDialogOptions={properties,...(extensions.length&&request.mode==='files'?{filters:[{name:request.domain,extensions:[...extensions]}]}:{})};
    const window=BrowserWindow.fromWebContents(owner);const chosen=window?await dialog.showOpenDialog(window,options):await dialog.showOpenDialog(options);if(chosen.canceled)return {requestId:request.requestId,artifacts:[],items:[],errors:[],cancelled:true};selections=chosen.filePaths;
   }
   emit({state:'scanning',count:0});const scanned=await scanReferences(selections,request.domain,controller.signal,count=>emit({state:'scanning',count}));controller.signal.throwIfAborted();
   scanned.files=scanned.files.filter(file=>{try{const info=lstatSync(file.path);if(info.isSymbolicLink()||!info.isFile()||info.dev!==file.device||info.ino!==file.inode)throw Error('file-changed');return true;}catch(error){scanned.errors.push({name:file.name,error:String(error)});return false;}});
   const commit=handlers.get(request.domain),items=commit?await commit(owner,scanned.files):[];controller.signal.throwIfAborted();
   if(scanned.roots.length){const saved=roots[request.domain]||[];roots[request.domain]=[...new Map([...saved,...scanned.roots].map(r=>[r.path,r])).values()];mkdirSync(join(app.getPath('userData'),'fusion-workspace'),{recursive:true});writeFileSync(file+'.tmp',JSON.stringify({version:1,roots}));renameSync(file+'.tmp',file);}
   const artifacts=request.domain==='files'?scanned.files.map(f=>grantArtifact(owner,f.path)):[];emit({state:'done',count:scanned.files.length});return {requestId:request.requestId,artifacts,items,count:scanned.files.length,errors:scanned.errors,cancelled:false};
  }catch(error){if(controller.signal.aborted){emit({state:'cancelled',count:0});return {requestId:request.requestId,artifacts:[],items:[],errors:[],cancelled:true};}emit({state:'error',count:0});throw error;}
  finally{owner.removeListener('destroyed',destroyed);if(active.get(owner.id)===operation)active.delete(owner.id);}
 });
 ipcMain.handle('fusion:product:local-import-cancel',(event,id:string)=>{check(event.sender);if(event.senderFrame!==event.sender.mainFrame)throw Error('untrusted-view');const operation=active.get(event.sender.id);if(operation?.id===id){operation.controller.abort();return true;}return false;});
}
