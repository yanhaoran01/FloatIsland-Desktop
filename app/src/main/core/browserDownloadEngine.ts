/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file browserDownloadEngine.ts @description Session-owned downloads with durable exclusive completion. @author 鸡哥 */
import type {DownloadItem, Session, WebContents} from 'electron';
import {randomUUID,createHash} from 'node:crypto';
import {constants,mkdirSync,readFileSync,writeFileSync,renameSync,readdirSync,existsSync,lstatSync,createReadStream} from 'node:fs';
import {copyFile,rm,lstat,link,unlink} from 'node:fs/promises';
import {basename,extname,join,resolve,isAbsolute} from 'node:path';
import type {DownloadTask} from '../../preload/types/download';
const sessions=new WeakSet<Session>(),contexts=new Map<number,string>();
let sink:BrowserDownloadEngine|undefined,booksDirectory:()=>string=()=>'';
let importBook:((file:string,name:string,id?:string)=>Promise<string>)|undefined;
/** Registers the collection destination. @param get - Current Books path. */
export function setBrowserBooksDirectory(get:()=>string):void {booksDirectory=get;}
/** Coordinates completed books with library moves and migration. @param commit - Serialized file import. */
export function setBrowserBookImporter(commit:(file:string,name:string,id?:string)=>Promise<string>):void {importBook=commit;}
/** Imports a finished file through the serialized library coordinator. @param file - Temporary file. @param name - Book name. @param id - Stable task. @returns Library path. */
export async function commitDownloadedBook(file:string,name:string,id:string):Promise<string>{if(!importBook)throw Error('book-importer-unavailable');return importBook(file,name,id);}
/** Marks a browser opened from a book source. @param contents - Isolated browser. @param sourceId - Source identity. */
export function markBookBrowser(contents:WebContents,sourceId:string):void {contexts.set(contents.id,sourceId);contents.once('destroyed',()=>contexts.delete(contents.id));}
/** Clears source attribution when ordinary browsing starts. @param contents - Browser. */
export function clearBookBrowser(contents:WebContents):void {contexts.delete(contents.id);}
/** Installs one listener per Electron session. @param session - Website session. */
export function bindBrowserDownloads(session:Session):void {if(sessions.has(session))return;sessions.add(session);session.on('will-download',(_event,item,contents)=>{try{if(!sink)throw Error('download-engine-unavailable');sink.accept(item,contents);}catch(error){item.cancel();console.error('Website download could not start:',error);}});}
/** Registers the shared task engine. @param engine - Session engine. */
export function setBrowserDownloadEngine(engine:BrowserDownloadEngine):void {sink=engine;}
/** Sanitizes names while preserving extensions. @param input - Website filename. @returns Safe basename. */
export function browserDownloadName(input:string):string {
 let name=basename(input.replace(/\\/g,'/')).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[ .]+$/,'');
 if(!name||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))name='download-'+(name||'file');
 const extension=extname(name).slice(0,20);return name.length>180?name.slice(0,180-extension.length)+extension:name;
}
interface Record {item?:DownloadItem;task:DownloadTask;temporary:string;directory:string;done:boolean;lastSaved:number;removed?:boolean;}
async function digest(file:string):Promise<string>{const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');}
/** One native DownloadItem owns one task and its temporary directory. */
export class BrowserDownloadEngine {
 private items=new Map<string,Record>();private closing=false;
 constructor(private output:()=>string,private publish:(task:DownloadTask)=>void,private journalDirectory?:string){
  if(journalDirectory){mkdirSync(journalDirectory,{recursive:true});for(const name of readdirSync(journalDirectory)){if(!name.endsWith('.json'))continue;try{
   const value=JSON.parse(readFileSync(join(journalDirectory,name),'utf8')) as Record;
   if(!value.task||!/^[a-f\d-]{36}$/i.test(value.task.id)||name!==value.task.id+'.json'||!isAbsolute(value.directory)||resolve(value.temporary)!==resolve(value.directory,'.float-download-'+value.task.id))continue;
   value.item=undefined;value.done=true;value.lastSaved=0;value.task.canPause=false;value.task.canResume=false;
   if(!['completed','canceled'].includes(value.task.status)||value.task.status==='completed'&&(!existsSync(value.task.savePath)||!lstatSync(value.task.savePath).isFile()||lstatSync(value.task.savePath).size!==value.task.downloadedBytes||!value.task.sha256||createHash('sha256').update(readFileSync(value.task.savePath)).digest('hex')!==value.task.sha256)){value.task.status='failed';value.task.phase='downloading';value.task.outputs=undefined;value.task.requiresSourceRefresh=true;value.task.errorMessage='browser-source-refresh-required';value.task.speedBytesPerSecond=0;value.task.progress=Math.min(.999,value.task.progress);}
   this.items.set(value.task.id,value);
  }catch{/* An invalid journal never authorizes filesystem cleanup. */}}}
 }
 private emit(record:Record,force=false):void {
  if(record.removed||this.items.get(record.task.id)!==record)return;
  record.task.updatedAt=Date.now();
  if(this.journalDirectory&&(force||Date.now()-record.lastSaved>1000)){const file=join(this.journalDirectory,record.task.id+'.json');writeFileSync(file+'.tmp',JSON.stringify({task:record.task,temporary:record.temporary,directory:record.directory,done:record.done,lastSaved:Date.now()}));renameSync(file+'.tmp',file);record.lastSaved=Date.now();}
  this.publish({...record.task});
 }
 private async clean(record:Record):Promise<void>{if(resolve(record.temporary)!==resolve(record.directory,'.float-download-'+record.task.id))throw Error('invalid-download-temporary');await rm(record.temporary,{recursive:true,force:true});}
 /** Returns journal-backed history after startup. @returns Safe non-resumable snapshots. */
 restoredTasks():DownloadTask[]{return [...this.items.values()].map(value=>({...value.task}));}
 /** Accepts the actual website request without refetching its URL. @param item - Electron item. @param contents - Owner. @returns Initial task. */
 accept(item:DownloadItem,contents:WebContents):DownloadTask {
  const id=randomUUID(),now=Date.now(),sourceId=contexts.get(contents.id),directory=sourceId?booksDirectory():this.output();
  if(!directory)throw Error('download-directory-unavailable');const temporary=join(directory,'.float-download-'+id);mkdirSync(temporary,{recursive:true});
  const fileName=browserDownloadName(item.getFilename());item.setSavePath(join(temporary,fileName));
  const task:DownloadTask={id,url:item.getURL(),sourcePage:typeof contents.getURL==='function'?contents.getURL():undefined,savePath:join(directory,fileName),fileName,sourceId,libraryFolder:sourceId?'Books':undefined,engine:'browser',phase:'downloading',status:'downloading',totalBytes:item.getTotalBytes(),downloadedBytes:0,progress:0,speedBytesPerSecond:0,estimatedFinishAt:null,threads:1,canPause:true,canResume:false,createdAt:now,updatedAt:now};
  const record:Record={item,task,temporary,directory,done:false,lastSaved:0};this.items.set(id,record);this.emit(record,true);
  item.on('updated',(_event,state)=>{if(record.done)return;Object.assign(task,{totalBytes:item.getTotalBytes(),downloadedBytes:item.getReceivedBytes(),speedBytesPerSecond:item.getCurrentBytesPerSecond(),status:state==='interrupted'?'paused':item.isPaused()?'paused':'downloading',canPause:state==='progressing'&&!item.isPaused(),canResume:item.canResume()});task.progress=task.totalBytes?Math.min(.999,task.downloadedBytes/task.totalBytes):0;this.emit(record);});
  item.once('done',(_event,state)=>{
   record.done=true;task.canPause=false;task.canResume=false;
   if(state!=='completed'){task.status=state==='cancelled'&&!this.closing?'canceled':'failed';task.requiresSourceRefresh=task.status==='failed';task.errorMessage=task.requiresSourceRefresh?'browser-source-refresh-required':undefined;task.speedBytesPerSecond=0;this.emit(record,true);if(task.status==='canceled')void this.clean(record).catch(error=>{task.errorDetail=String(error);this.emit(record,true);});return;}
   task.phase='merging';this.emit(record,true);
   void (async()=>{
    const source=item.getSavePath(),info=await lstat(source);if(!info.isFile()||info.isSymbolicLink()||(item.getTotalBytes()>0&&info.size!==item.getTotalBytes()))throw Error('download-size-mismatch');
    task.sha256=await digest(source);
    if(sourceId&&importBook)task.savePath=await importBook(source,fileName,id);
    else {
     const ready=join(temporary,'verified-output');await copyFile(source,ready,constants.COPYFILE_EXCL);if(await digest(ready)!==task.sha256)throw Error('download-copy-mismatch');
     const extension=extname(fileName),stem=fileName.slice(0,fileName.length-extension.length);
     for(let n=0;n<10000;n++){const target=join(directory,n?stem+' ('+n+')'+extension:fileName);try{await link(ready,target);task.savePath=target;break;}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if(n===9999)throw Error('download-name-conflict');}}
    }
    task.fileName=basename(task.savePath);task.outputs=[task.savePath];task.status='completed';task.phase='completed';task.downloadedBytes=info.size;task.progress=1;task.requiresSourceRefresh=false;
    this.emit(record,true);await this.clean(record);
   })().catch(error=>{if(task.status!=='completed'){task.status='failed';task.outputs=undefined;task.progress=Math.min(.999,task.progress);task.requiresSourceRefresh=true;task.errorMessage=String(error);}else task.errorDetail=String(error);}).finally(()=>{task.speedBytesPerSecond=0;this.emit(record,true);});
  });return {...task};
 }
 /** Applies only controls supported by the actual native item. @param id - Task. @param command - Control. @returns Snapshot or unavailable. */
 control(id:string,command:'pause'|'resume'|'cancel'):DownloadTask|false {
  const record=this.items.get(id);if(!record)return false;
  if(record.done){if(command!=='cancel'||record.task.status!=='failed')return false;record.task.status='canceled';record.task.requiresSourceRefresh=false;record.task.errorMessage=undefined;this.emit(record,true);void this.clean(record).catch(error=>{record.task.errorDetail=String(error);this.emit(record,true);});return {...record.task};}
  const item=record.item!;
  if(command==='pause'){item.pause();if(!item.isPaused())return false;record.task.status='paused';}
  else if(command==='resume'){if(!item.canResume())return false;item.resume();record.task.status='downloading';}
  else {item.cancel();return {...record.task};}
  record.task.canPause=!item.isPaused();record.task.canResume=item.canResume();this.emit(record,true);return {...record.task};
 }
 /** Removes terminal history and its owned incomplete data. @param id - Task. @returns Whether removable. */
 remove(id:string):boolean {const record=this.items.get(id);if(record&&(!record.done||record.task.status==='downloading'))return false;if(record){record.removed=true;void this.clean(record).then(async()=>{if(this.journalDirectory)await unlink(join(this.journalDirectory,record.task.id+'.json')).catch(()=>{});}).catch(error=>console.warn('Download cleanup:',error));}this.items.delete(id);return true;}
 /** Saves interruption without claiming restart resume support. */
 close():void {this.closing=true;for(const record of this.items.values())if(!record.done)record.item?.cancel();}
}
