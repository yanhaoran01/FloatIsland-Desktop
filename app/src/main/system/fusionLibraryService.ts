/* FloatIsland contributors. GPL-3.0. */
/** @file fusionLibraryService.ts @description Main-owned local collections, selected scopes, reading, feeds and reminders. */
import {app,BrowserWindow,dialog,ipcMain,Notification,shell,type WebContents} from 'electron';
import {randomUUID,createHash} from 'node:crypto';
import {basename,join,relative,isAbsolute,sep} from 'node:path';
import {promises as fs,createReadStream,copyFileSync,existsSync,lstatSync,readFileSync,realpathSync,writeFileSync,renameSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {createRequire} from 'node:module';
import type Parser from 'rss-parser';
import {load} from 'cheerio';
import {broadcastFusion,isFusionView} from './fusionWindows';
import {grantArtifact,requireArtifact} from './productArtifacts';
import {registerManagedLibrary,registerReaderProtocol} from './managedLibraryService';
import {setLocalImportHandler} from './localImportService';
import {registerBookSources} from './bookSourceService';
import {LibraryStore,initLibraryStore,libraryText,type StoredLibraryItem} from './libraryStore';
import {libraryWorkerCode,librarySearchWorkerCode,libraryFeedWorkerCode} from './libraryWorker';
import {normalizeWebUrl} from './fusionToolStore';
import {importBookmarkHtml,exportBookmarkHtml} from './libraryBookmarks';
import {readFusionWebArticle,parseFusionArticleHtml} from './fusionBrowserService';
import {publicMusicRequest,publicMusicUrl,musicResponseText} from '../music/fusionMusicPluginHost';
import type {LibraryArticle,LibraryData,LibraryFileEntry,LibraryJob,LibrarySearchResult,LibraryWrite} from '../../preload/types/fusionLibrary';

interface IndexedFile extends LibraryFileEntry {device:number;inode:number;mtime:number;hash?:string;}
interface ScopeIdentity {id:string;path:string;device:number;inode:number;}
interface LibraryTask {owner:WebContents|null;value:LibraryJob;controller:AbortController;worker?:Worker;files:IndexedFile[];}
let store:LibraryStore;
const readings=new Map<string,LibraryArticle>();const tasks=new Map<string,LibraryTask>();let index:IndexedFile[]=[];const identities=new Map<string,ScopeIdentity>();
const searching=new WeakMap<WebContents,()=>void>(),moduleRequire=createRequire(import.meta.url);
function workerResult<T>(code:string,data:unknown,signal:AbortSignal):Promise<T>{signal.throwIfAborted();return new Promise((resolve,reject)=>{const worker=new Worker(code,{eval:true,workerData:data});let done=false;const finish=(error?:Error,result?:T)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);void worker.terminate();if(error)reject(error);else resolve(result!);};const cancel=()=>finish(Error('job-cancelled')),timer=setTimeout(()=>finish(Error('job-timeout')),20000);signal.addEventListener('abort',cancel,{once:true});worker.on('message',(message:{error?:string;result?:T;results?:T})=>message.error?finish(Error(message.error)):finish(undefined,message.result??message.results));worker.on('error',error=>finish(error instanceof Error?error:Error(String(error))));worker.on('exit',code=>{if(!done)finish(Error('worker-exited-'+code));});});}
const publish=():LibraryData=>{store.save();const data=store.snapshot();broadcastFusion('fusion:library:changed',data);return data;};
function validateFile(item:StoredLibraryItem|IndexedFile):string{
 if(!item.path)throw Error('file-not-authorized');const stat=lstatSync(item.path),identity='identity'in item?item.identity:('device'in item?item:undefined);
 if(stat.isSymbolicLink()||!identity||stat.dev!==identity.device||stat.ino!==identity.inode)throw Error('file-changed');
 if('directory'in item){if(item.directory!==stat.isDirectory())throw Error('file-changed');}
 else if('kind'in item&&((item.kind==='folder')!==stat.isDirectory()))throw Error('file-changed');return item.path;
}
function findItem(id:string):StoredLibraryItem|IndexedFile{const item=store.data.items.find(x=>x.id===id)||index.find(x=>x.id===id);if(!item)throw Error('invalid-id');if('scopeId'in item){const scope=store.data.scopes.find(s=>s.id===item.scopeId),identity=identities.get(item.scopeId);if(!scope||!identity)throw Error('file-not-authorized');const s=lstatSync(scope.path);if(s.isSymbolicLink()||s.dev!==identity.device||s.ino!==identity.inode)throw Error('file-changed');const rel=relative(realpathSync(scope.path),realpathSync(item.path));if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('file-not-authorized');}return item;}
function addPath(path:string,kind?:'app',id?:string):void{
 const stat=lstatSync(path);if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile()))throw Error('file-not-authorized');const target=realpathSync(path),old=store.data.items.find(x=>x.id===id)||store.data.items.find(x=>x.path===target);
 const value:StoredLibraryItem={id:old?.id||randomUUID(),kind:kind|| (stat.isDirectory()?'folder':'file'),path:target,title:old?.title||basename(target),group:old?.group||'',tags:old?.tags||[],note:old?.note||'',pinned:old?.pinned||false,createdAt:old?.createdAt||Date.now(),openedAt:old?.openedAt||0,identity:{device:stat.dev,inode:stat.ino}};
 if(old)Object.assign(old,value);else store.data.items.push(value);
}
function saveIndex():void{const path=join(store.directory,'index-v1.json');writeFileSync(path+'.tmp',JSON.stringify({version:1,files:index,identities:[...identities.values()]}));renameSync(path+'.tmp',path);}
const publicJob=(task:LibraryTask):LibraryJob=>structuredClone(task.value);
function emit(task:LibraryTask,patch:Partial<LibraryJob>):void{if(['done','error','cancelled'].includes(task.value.state)&&patch.state==='running')return;Object.assign(task.value,patch);broadcastFusion('fusion:library:job',publicJob(task));}
function createTask(owner:WebContents|null,mode:LibraryJob['mode']):LibraryTask{
 for(const task of tasks.values())if(task.owner===owner&&task.value.mode===mode&&task.value.state==='running'){task.controller.abort();void task.worker?.terminate();emit(task,{state:'cancelled'});}
 const task:LibraryTask={owner,value:{id:randomUUID(),mode,state:'running',progress:0,count:0,errors:[]},controller:new AbortController(),files:[]};tasks.set(task.value.id,task);emit(task,{});return task;
}
async function fetchPublic(url:string,signal:AbortSignal,limit=10_000_000):Promise<{text:string;url:string}>{
 let target=await publicMusicUrl(normalizeWebUrl(url));
 for(let n=0;n<5;n++){signal.throwIfAborted();const response=await publicMusicRequest(target,{signal,headers:{'User-Agent':'FloatIsland/1.3.0'}});if(response.status>=300&&response.status<400){const next=response.headers.get('location');await response.body?.cancel();if(!next)throw Error('invalid-url');target=await publicMusicUrl(new URL(next,target).href);continue;}if(!response.ok){await response.body?.cancel();throw Error('http-'+response.status);}return {text:await musicResponseText(response,limit),url:target};}throw Error('redirect-limit');
}
/** Drop active code, then retain only display markup and ordinary web links. Renderer additionally uses DOMPurify. */
export function cleanArticleHtml(html:string,url:string):string{
 const $=load(html);$('script,style,iframe,frame,object,embed,form,input,button,textarea,select,link,meta,base,svg,math').remove();
 $('*').each((_i,node)=>{const element=$(node);for(const key of Object.keys(node.type==='tag'?node.attribs:{})){if(!['href','src','alt','title','colspan','rowspan'].includes(key))element.removeAttr(key);}
  for(const key of ['href','src']){const raw=element.attr(key);if(!raw)continue;try{const target=normalizeWebUrl(new URL(raw,url).href);if(key==='src'){element.attr('data-remote-src',target);element.removeAttr('src');}else element.attr(key,target);}catch{element.removeAttr(key);}}
 });return $('body').html()||'';
}
function persistArticle(raw:LibraryArticle):LibraryArticle{
 const item=store.url(raw.url,{title:raw.title.slice(0,200)}),old=item.article?store.article(item.id):null;
 const article={...raw,id:item.id,html:cleanArticleHtml(raw.html,raw.url),progress:old?.progress||0,highlights:old?.highlights||[],savedAt:Date.now()};store.saveArticle(article);item.article=true;publish();return article;
}
async function refreshFeeds(task:LibraryTask,ids:string[]):Promise<void>{
 let done=0;
 try{for(const id of ids){task.controller.signal.throwIfAborted();const feed=store.data.feeds.find(x=>x.id===id);if(!feed)continue;try{
   const response=await fetchPublic(feed.url,AbortSignal.any([task.controller.signal,AbortSignal.timeout(20000)]));const parsed=await workerResult<Parser.Output<{[key:string]:unknown}>>(libraryFeedWorkerCode,{xml:response.text,library:moduleRequire.resolve('rss-parser')},task.controller.signal);task.controller.signal.throwIfAborted();if(!store.data.feeds.some(x=>x.id===id))continue;
   feed.title=parsed.title?.slice(0,200)||feed.title;feed.updatedAt=Date.now();feed.error=undefined;
   for(const entry of parsed.items){if(!entry.link)continue;let url:string;try{url=normalizeWebUrl(new URL(entry.link,response.url).href);}catch{continue;}const entryId=createHash('sha256').update(id+'\n'+(entry.guid||url)).digest('hex');const old=store.data.entries.find(x=>x.id===entryId);if(old)continue;store.data.entries.push({id:entryId,feedId:id,title:(entry.title||url).slice(0,500),url,summary:(entry.contentSnippet||'').slice(0,3000),date:entry.isoDate||entry.pubDate||'',read:false});}
  }catch(error){if(task.controller.signal.aborted)throw error;feed.error=String(error);task.value.errors.push(feed.title+': '+String(error));}emit(task,{count:++done,progress:done/Math.max(1,ids.length)});publish();}
  emit(task,{state:'done',progress:1});
 }catch(error){emit(task,{state:task.controller.signal.aborted?'cancelled':'error',errors:[...task.value.errors,String(error)]});}
}
function startJob(owner:WebContents|null,mode:LibraryJob['mode'],ids:string[]):LibraryJob{
 if(!['index','duplicates','feeds'].includes(mode)||!Array.isArray(ids)||ids.length>1000||ids.some(x=>typeof x!=='string'))throw Error('invalid-library-command');
 if(mode!=='feeds')for(const id of ids)if(!store.data.scopes.some(x=>x.id===id)||!identities.has(id))throw Error('file-not-authorized');
 const task=createTask(owner,mode);
 if(mode==='feeds'){void refreshFeeds(task,ids);return publicJob(task);}
 const scopes=ids.map(id=>{const scope=store.data.scopes.find(x=>x.id===id),identity=identities.get(id);if(!scope||!identity)throw Error('file-not-authorized');return identity;});
 if(!scopes.length){emit(task,{state:'done',progress:1});return publicJob(task);}
 const worker=new Worker(libraryWorkerCode,{eval:true,workerData:{mode,scopes}});task.worker=worker;
 const timer=setTimeout(()=>{task.controller.abort();void worker.terminate();emit(task,{state:'error',errors:['job-timeout']});},600000);
 task.controller.signal.addEventListener('abort',()=>{clearTimeout(timer);void worker.terminate();emit(task,{state:'cancelled'});},{once:true});
 worker.on('message',(value:{error?:string;done?:boolean;files?:IndexedFile[];groups?:IndexedFile[][];errors?:string[];count?:number;progress?:number})=>{
  if(task.controller.signal.aborted||task.value.state!=='running')return;
  if(value.error){clearTimeout(timer);emit(task,{state:'error',errors:[value.error]});void worker.terminate();}
  else if(value.done&&value.files){clearTimeout(timer);const previous=new Map(index.map(file=>[file.scopeId+'\n'+file.path,file]));for(const file of value.files){const old=previous.get(file.scopeId+'\n'+file.path);if(old&&old.device===file.device&&old.inode===file.inode)file.id=old.id;}task.files=value.files;const liveIds=new Set(store.data.scopes.map(s=>s.id));index=[...index.filter(x=>!ids.includes(x.scopeId)),...value.files.filter(x=>liveIds.has(x.scopeId))];saveIndex();emit(task,{state:'done',count:value.count||0,progress:1,errors:value.errors||[],groups:value.groups?.map(group=>group.map(({device:_d,inode:_i,mtime:_m,hash:_h,...entry})=>entry))});void worker.terminate();}
  else emit(task,{count:value.count||0,progress:value.progress||0});
 });worker.on('error',error=>{clearTimeout(timer);emit(task,{state:'error',errors:[error instanceof Error?error.message:String(error)]});});worker.on('exit',code=>{clearTimeout(timer);if(task.value.state==='running')emit(task,{state:'error',errors:['worker-exited-'+code]});});return publicJob(task);
}
async function hashFile(file:IndexedFile):Promise<string>{validateFile(file);const stat=lstatSync(file.path);if(stat.size!==file.size||stat.mtimeMs!==file.mtime)throw Error('file-changed');const hash=createHash('sha256');for await(const chunk of createReadStream(file.path))hash.update(chunk);const next=lstatSync(file.path);if(next.ino!==stat.ino||next.size!==stat.size||next.mtimeMs!==stat.mtimeMs)throw Error('file-changed');return hash.digest('hex');}

/** Registers finite operations only for trusted application views. */
export function registerFusionLibrary():void{
 store=initLibraryStore(join(app.getPath('userData'),'fusion-library'));store.migrateDisk(app.getPath('userData'));registerReaderProtocol();const managed=registerManagedLibrary(store,publish);registerBookSources(store.directory,managed);
 setLocalImportHandler('reading',async(_owner,files)=>{const ids:string[]=[];for(const file of files){const previous=store.data.items.find(x=>x.path===file.path||x.kind==='file'&&x.identity?.device===file.device&&x.identity.inode===file.inode);addPath(file.path,undefined,previous?.id);const item=store.data.items.find(x=>x.path===file.path)!;item.group=item.group||'Books';item.tags=[...new Set([...item.tags,'reading'])];item.unavailable=false;ids.push(item.id);}publish();return ids;});
 try{const saved=JSON.parse(readFileSync(join(store.directory,'index-v1.json'),'utf8'));if(saved.version===1&&Array.isArray(saved.files)&&Array.isArray(saved.identities)){index=saved.files;for(const identity of saved.identities)identities.set(identity.id,identity);}}catch{/* A missing cache is rebuilt explicitly. */}
 for(const scope of store.data.scopes)if(scope.identity)identities.set(scope.id,{id:scope.id,path:scope.path,...scope.identity});
 const handle=<A extends unknown[],R>(name:string,fn:(owner:WebContents,...args:A)=>R):void=>{ipcMain.handle('fusion:library:'+name,(event,...args:A)=>{if(!isFusionView(event.sender)||event.senderFrame!==event.sender.mainFrame)throw Error('untrusted-view');return fn(event.sender,...args);});};
 handle('reader-metadata',async(owner,id:string,metadata:{title:string;author:string;cover?:string})=>{
  const artifact=requireArtifact(owner,id),item=store.data.items.find(item=>item.path===artifact.path);if(!item)return store.snapshot();validateFile(item);if(!/^[\w-]{1,100}$/.test(item.id))throw Error('invalid-id');
  if(!metadata||typeof metadata.title!=='string'||metadata.title.length>1000||typeof metadata.author!=='string'||metadata.author.length>1000)throw Error('invalid-reader-state');
  if(metadata.cover!==undefined){if(typeof metadata.cover!=='string'||metadata.cover.length>1500000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(metadata.cover))throw Error('invalid-reader-state');await fs.mkdir(join(store.directory,'reader-covers'),{recursive:true});await fs.writeFile(join(store.directory,'reader-covers',item.id+'.json'),JSON.stringify({cover:metadata.cover}));}
  item.reading={...item.reading,title:metadata.title,author:metadata.author,cover:Boolean(metadata.cover)||item.reading?.cover};return publish();
 });
 handle('reader-cover',async(_owner,id:string)=>{const item=store.data.items.find(item=>item.id===id);if(!item)throw Error('invalid-id');validateFile(item);if(!/^[\w-]{1,100}$/.test(item.id))throw Error('invalid-id');try{const value=JSON.parse(await fs.readFile(join(store.directory,'reader-covers',item.id+'.json'),'utf8'));return typeof value.cover==='string'&&value.cover.length<=1500000?value.cover:'';}catch{return '';}});
 handle('get',()=>{const data=store.snapshot();for(const item of data.items)if(item.path)try{validateFile(store.data.items.find(x=>x.id===item.id)!);}catch{item.unavailable=true;}return data;});
 handle('write',(_owner,command:LibraryWrite)=>{const before=structuredClone(store.data);try{store.write(command);const result=publish();if(command.type==='removeScope'){index=index.filter(x=>x.scopeId!==command.id);identities.delete(command.id);saveIndex();}return result;}catch(error){store.data=before;throw error;}});
 handle('pick',async(owner,kind:string,id?:string)=>{
  if(!['file','folder','scope','app','rebind'].includes(kind))throw Error('invalid-library-command');const old=id?store.data.items.find(x=>x.id===id):undefined;if(kind==='rebind'&&(!old||old.kind==='url'))throw Error('invalid-id');
  const directory=kind==='folder'||kind==='scope'||kind==='rebind'&&old?.kind==='folder';const win=BrowserWindow.fromWebContents(owner);const result=await dialog.showOpenDialog(win||BrowserWindow.getAllWindows()[0],{properties:directory?['openDirectory']:['openFile','multiSelections'],...(kind==='app'?{filters:[{name:'Applications',extensions:['exe','lnk']}]}:{})});if(result.canceled)return store.snapshot();
  for(const path of result.filePaths){if(kind==='scope'){const stat=lstatSync(path);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('file-not-authorized');const real=realpathSync(path);let scope=store.data.scopes.find(s=>s.path===real);if(!scope){scope={id:randomUUID(),name:basename(real),path:real};store.data.scopes.push(scope);}scope.identity={device:stat.dev,inode:stat.ino};identities.set(scope.id,{id:scope.id,path:real,device:stat.dev,inode:stat.ino});}else addPath(path,kind==='app'||kind==='rebind'&&old?.kind==='app'?'app':undefined,kind==='rebind'?id:undefined);}
  const data=publish();saveIndex();if(kind==='scope')startJob(owner,'index',store.data.scopes.map(x=>x.id));return data;
 });
 handle('drop',async(_owner,paths:string[])=>{const job=await managed.start(paths,'Inbox');await managed.wait(job.id);return store.snapshot();});
 handle('collect',async(owner,ids:string[])=>{if(!Array.isArray(ids)||ids.length>1000)throw Error('file-limit');for(const id of ids){const file=requireArtifact(owner,id);if(file.temporary){const win=BrowserWindow.fromWebContents(owner);const chosen=await dialog.showSaveDialog(win||BrowserWindow.getAllWindows()[0],{defaultPath:file.name});if(chosen.canceled||!chosen.filePath)continue;copyFileSync(file.path,chosen.filePath);addPath(chosen.filePath);}else addPath(file.path);}return publish();});
 handle('artifact',(owner,id:string)=>{const item=findItem(id);return grantArtifact(owner,validateFile(item));});
 handle('open',async(_owner,ids:string[],action:'open'|'reveal')=>{if(!Array.isArray(ids)||ids.length>100||!['open','reveal'].includes(action))throw Error('invalid-library-command');const results:Array<{id:string;error?:string}>=[];for(const id of ids){try{const item=findItem(id);if('kind'in item&&item.kind==='url'){if(action==='reveal')throw Error('invalid-library-command');await shell.openExternal(normalizeWebUrl(item.url!));}else{const path=validateFile(item);if(action==='reveal')shell.showItemInFolder(path);else{const error=await shell.openPath(path);if(error)throw Error(error);}}if('openedAt'in item)item.openedAt=Date.now();results.push({id});}catch(error){results.push({id,error:String(error)});}}publish();return results;});
 handle('article',(_owner,id:string)=>store.article(id));
 handle('read-page',async(_owner,save:boolean)=>{if(typeof save!=='boolean')throw Error('invalid-library-command');const article=await readFusionWebArticle();if(save)return persistArticle(article);const value={...article,html:cleanArticleHtml(article.html,article.url)};readings.set(value.id,value);if(readings.size>30)readings.delete(readings.keys().next().value!);return value;});
 handle('save-reading',(_owner,id:string)=>{const article=readings.get(id);if(!article)throw Error('article-unavailable');return persistArticle(article);});
 handle('save-url',async(owner,url:string)=>{const task=createTask(owner,'article');try{const response=await fetchPublic(url,AbortSignal.any([task.controller.signal,AbortSignal.timeout(20000)]));const $=load(response.text);$('script,style,iframe,object,embed,link,meta,base').remove();$('img,source,video,audio').removeAttr('src').removeAttr('srcset');const html=$.html();const raw=await parseFusionArticleHtml(html,response.url,task.controller.signal);task.controller.signal.throwIfAborted();const result=persistArticle(raw);emit(task,{state:'done',progress:1});return result;}catch(error){emit(task,{state:task.controller.signal.aborted?'cancelled':'error',errors:[String(error)]});throw error;}});
 handle('images',async(owner,id:string)=>{
  const article=store.article(id),$=load(article.html),task=createTask(owner,'article'),images=$('img[data-remote-src]').toArray().slice(0,50);let total=0,count=0;const errors:string[]=[];
  try{for(const image of images){task.controller.signal.throwIfAborted();const node=$(image),url=node.attr('data-remote-src')!;
   try{const response=await publicMusicRequest(await publicMusicUrl(url),{signal:AbortSignal.any([task.controller.signal,AbortSignal.timeout(15000)])}),mime=response.headers.get('content-type')?.split(';')[0];
    if(!response.ok||!mime||!['image/png','image/jpeg','image/webp','image/gif'].includes(mime)){await response.body?.cancel();throw Error('image-unavailable');}
    const reader=response.body?.getReader();if(!reader)throw Error('image-unavailable');const chunks:Uint8Array[]=[];let size=0;
    try{while(true){task.controller.signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5_000_000||total+size>20_000_000)throw Error('image-limit');chunks.push(value);}total+=size;node.attr('src','data:'+mime+';base64,'+Buffer.concat(chunks).toString('base64'));node.removeAttr('data-remote-src');}finally{await reader.cancel();}
   }catch(error){task.controller.signal.throwIfAborted();errors.push(String(error));}count++;emit(task,{count,progress:count/Math.max(1,images.length),errors});
  }task.controller.signal.throwIfAborted();const latest=store.article(id);latest.html=$('body').html()||'';store.saveArticle(latest);emit(task,{state:'done',progress:1,errors});return latest;
  }catch(error){emit(task,{state:task.controller.signal.aborted?'cancelled':'error',errors:[String(error)]});throw error;}
 });
 handle('search',async(owner,query:string,requestId:string)=>{libraryText(query,500);libraryText(requestId,100);searching.get(owner)?.();const controller=new AbortController();searching.set(owner,()=>controller.abort());const live=new Set(store.data.scopes.map(x=>x.id));const rows:LibrarySearchResult[]=store.data.items.map(x=>({id:x.id,title:x.title,detail:[x.url||x.path||'',x.note,x.group,...x.tags].join(' '),kind:x.kind}));rows.push(...index.filter(x=>live.has(x.scopeId)).map(x=>({id:x.id,title:x.name,detail:x.path,kind:x.directory?'folder' as const:'file' as const,scopeId:x.scopeId})));return query.trim()?await workerResult<LibrarySearchResult[]>(librarySearchWorkerCode,{rows,query:query.trim(),library:moduleRequire.resolve('fuse.js')},controller.signal):rows.slice(0,100);});
 handle('job',startJob);handle('cancel',(owner,id:string)=>{const task=tasks.get(id);if(!task||task.owner!==owner)throw Error('invalid-task');task.controller.abort();});
 handle('trash',async(owner,jobId:string,ids:string[])=>{const task=tasks.get(jobId);if(!task||task.owner!==owner||task.value.mode!=='duplicates'||task.value.state!=='done'||!Array.isArray(ids)||!ids.length)throw Error('invalid-task');const selected=new Set(ids),results:Array<{id:string;error?:string}>=[];const groups=task.value.groups||[];if(ids.some(id=>!groups.some(g=>g.some(x=>x.id===id)))||groups.some(g=>g.every(x=>selected.has(x.id))))throw Error('duplicate-keep-one');
  for(const group of groups.filter(g=>g.some(x=>selected.has(x.id)))){try{const files=group.map(entry=>task.files.find(f=>f.id===entry.id)!);for(const file of files){findItem(file.id);if(await hashFile(file)!==file.hash)throw Error('file-changed');}for(const file of files.filter(x=>selected.has(x.id))){try{findItem(file.id);if(await hashFile(file)!==file.hash)throw Error('file-changed');for(const keep of files.filter(x=>!selected.has(x.id)))validateFile(keep);await shell.trashItem(file.path);index=index.filter(x=>x.id!==file.id);results.push({id:file.id});}catch(error){results.push({id:file.id,error:String(error)});}}}catch(error){for(const entry of group.filter(x=>selected.has(x.id)))results.push({id:entry.id,error:String(error)});}}
  task.value.groups=groups.map(group=>group.filter(x=>!results.some(r=>r.id===x.id&&!r.error))).filter(g=>g.length>1);saveIndex();emit(task,{});return results;
 });
 handle('transfer',async(owner,action:string,format:string)=>{if(!['import','export'].includes(action)||!['json','html'].includes(format))throw Error('invalid-library-command');const win=BrowserWindow.fromWebContents(owner)||BrowserWindow.getAllWindows()[0];if(action==='import'){const result=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Bookmarks',extensions:['json','html','htm']}]});if(result.canceled)return store.snapshot();if(lstatSync(result.filePaths[0]).size>20_000_000)throw Error('file-too-large');const text=readFileSync(result.filePaths[0],'utf8');let rows:unknown[];if(format==='html'){rows=importBookmarkHtml(text);}else{const raw=JSON.parse(text);rows=Array.isArray(raw)?raw:raw.items;if(!Array.isArray(rows))throw Error('invalid-library-data');}const before=structuredClone(store.data);try{if(existsSync(store.path))copyFileSync(store.path,store.path+'.before-import.bak');store.migrate(rows);return publish();}catch(error){store.data=before;throw error;}}
  const result=await dialog.showSaveDialog(win,{defaultPath:'FloatIsland-bookmarks.'+format});if(result.canceled||!result.filePath)return store.snapshot();const rows=store.data.items.filter(x=>x.kind==='url');const text=format==='json'?JSON.stringify(rows.map(x=>({...x,folder:x.group})),null,2):exportBookmarkHtml(rows);writeFileSync(result.filePath,text);return store.snapshot();
 });
 const tick=setInterval(()=>{let changed=false;for(const reminder of store.data.reminders){if(reminder.enabled&&!reminder.notified&&reminder.due<=Date.now()){if(reminder.todoId!==undefined){try{const todos:unknown=JSON.parse(readFileSync(join(app.getPath('userData'),'eIsland_store','todos.json'),'utf8'));if(Array.isArray(todos)&&todos.some(x=>x&&typeof x==='object'&&x.id===reminder.todoId&&x.done===true)){reminder.enabled=false;reminder.notified=true;changed=true;continue;}}catch{}}reminder.notified=true;changed=true;delete reminder.notificationError;const occurrence=Date.now();reminder.history=[occurrence,...reminder.history||[]].slice(0,30);try{if(!Notification.isSupported())throw Error('notification-unavailable');const notice=new Notification({title:'FloatIsland',body:reminder.title,silent:true});notice.once('failed',()=>{const current=store.data.reminders.find(item=>item.id===reminder.id);if(current?.history?.includes(occurrence)){current.notificationError='notification-failed';publish();}});notice.show();}catch(error){reminder.notificationError=String(error);}const interval=reminder.repeat==='daily'?86400000:reminder.repeat==='weekly'?604800000:0;if(interval){reminder.due+=Math.max(1,Math.floor((occurrence-reminder.due)/interval)+1)*interval;reminder.notified=false;}}}if(changed)publish();},1000);
 const feedTick=setInterval(()=>{const ids=store.data.feeds.filter(x=>x.auto&&Date.now()-x.updatedAt>=900000).map(x=>x.id);if(ids.length&&![...tasks.values()].some(x=>x.value.mode==='feeds'&&x.value.state==='running'))startJob(null,'feeds',ids);},60000);
 app.once('before-quit',()=>{clearInterval(tick);clearInterval(feedTick);for(const task of tasks.values()){task.controller.abort();void task.worker?.terminate();}});
 app.on('web-contents-created',(_event,contents)=>{contents.once('destroyed',()=>{searching.get(contents)?.();for(const task of tasks.values())if(task.owner===contents){task.controller.abort();void task.worker?.terminate();}});});
}
