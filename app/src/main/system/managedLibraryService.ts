/* FloatIsland contributors. GPL-3.0. */
import {setMusicCommit} from '../core/musicDownloadBridge';
import {setBrowserBooksDirectory,setBrowserBookImporter} from '../core/browserDownloadEngine';
import {app,BrowserWindow,dialog,ipcMain,shell,protocol,net,type WebContents} from 'electron';
import {promises as fs,watch,type FSWatcher} from 'node:fs';
import {join,basename,dirname,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {ManagedLibrary,libraryName} from './managedLibrary';
import {broadcastFusion,isFusionView} from './fusionWindows';
import {type LibraryStore} from './libraryStore';
import {requireArtifact} from './productArtifacts';
import type {ManagedCommand,ManagedLibraryState,ReaderState} from '../../preload/types/managedLibrary';
export const readerDefaults:ReaderState={location:'',progress:0,marks:[],preferences:{theme:'dark',font:'system-ui',fontSize:18,lineHeight:1.7,margin:28,paginated:false}};
export function validateReaderState(value:ReaderState):ReaderState{if(!value||typeof value.location!=='string'||value.location.length>5000||!Number.isFinite(value.progress)||value.progress<0||value.progress>1||!Array.isArray(value.marks)||value.marks.length>1000)throw Error('invalid-reader-state');const p=value.preferences;if(!p||!['dark','warm','light'].includes(p.theme)||typeof p.font!=='string'||!/^[\w ,'-]{1,100}$/.test(p.font)||!Number.isFinite(p.fontSize)||p.fontSize<12||p.fontSize>36||!Number.isFinite(p.lineHeight)||p.lineHeight<1||p.lineHeight>3||!Number.isFinite(p.margin)||p.margin<0||p.margin>100||typeof p.paginated!=='boolean'||p.pdfZoom!==undefined&&(!Number.isFinite(p.pdfZoom)||p.pdfZoom<.5||p.pdfZoom>3))throw Error('invalid-reader-state');for(const m of value.marks)if(!m||[m.id,m.location,m.quote,m.note].some(x=>typeof x!=='string'||x.length>10000))throw Error('invalid-reader-state');return structuredClone(value);}
/** A separate security origin. No files outside packaged reader resources are served. */
export function registerReaderProtocol():void{
 protocol.handle('float-reader',async request=>{const url=new URL(request.url),name=decodeURIComponent(url.pathname);if(url.hostname!=='local'||name.includes('..')||!/^\/(DocumentReader\.html|assets\/[\w.-]+|reader\/foliate\/[\w./-]+)$/.test(name))return new Response(null,{status:404});const root=join(app.getAppPath(),'out','renderer');const target=resolve(root,'.'+name);if(!target.startsWith(root+sep))return new Response(null,{status:403});const response=await net.fetch(pathToFileURL(target).href);const headers=new Headers(response.headers);headers.set('Content-Security-Policy',"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self' blob:; worker-src 'self' blob:; frame-src blob:; base-uri 'none'; form-action 'none'; object-src 'none'");return new Response(response.body,{status:response.status,headers});});
}
export function registerManagedLibrary(store:LibraryStore,publish:()=>unknown):ManagedLibrary{
 let watcher:FSWatcher|undefined,timer:ReturnType<typeof setTimeout>|undefined,refreshTail:Promise<void>=Promise.resolve(),stopped=false;
 const managed=new ManagedLibrary(store.directory,join(app.getPath('documents'),'FloatIsland Library'),job=>broadcastFusion('fusion:library:move',job),()=>schedule(),[app.getPath('exe'),app.getAppPath(),app.getPath('userData'),process.env.SystemRoot||'C:/Windows',process.env.ProgramFiles||'C:/Program Files']);
 setMusicCommit(async(file,name,id)=>{await managed.path();const target=await managed.commitDownload(file,name,id,'Music');await refresh();return target;});
 setBrowserBooksDirectory(()=>join(managed.root,'Books'));
 setBrowserBookImporter((file,name,id)=>managed.commitDownload(file,name,id));
 const sync=async():Promise<void>=>{
  const before=JSON.stringify({items:store.data.items,root:store.data.managedRoot});
  const seen=new Set<string>();await managed.path();
  const walk=async(folder:string):Promise<void>=>{for(const entry of await managed.list(folder)){const path=join(managed.root,entry.relativePath),s=await fs.lstat(path);let item=store.data.items.find(x=>x.managed&&x.identity?.device===s.dev&&x.identity.inode===s.ino)||store.data.items.find(x=>x.managed&&(x.path===path||x.relativePath===entry.relativePath));if(!item){item={id:randomUUID(),kind:entry.directory?'folder':'file',title:entry.name,group:'',tags:[],note:'',pinned:false,createdAt:Date.now(),openedAt:0};store.data.items.push(item);}else if(item.relativePath!==entry.relativePath&&item.title===basename(item.path||''))item.title=entry.name;Object.assign(item,{managed:true,relativePath:entry.relativePath,path,kind:entry.directory?'folder':'file',identity:{device:s.dev,inode:s.ino},unavailable:false});seen.add(item.id);if(seen.size>100000)throw Error('library-entry-limit');if(entry.directory)await walk(entry.relativePath);}};
  await walk('');for(const item of store.data.items)if(item.managed&&!seen.has(item.id))item.unavailable=true;store.data.version=2;store.data.managedRoot=managed.root;if(before!==JSON.stringify({items:store.data.items,root:store.data.managedRoot}))publish();
 };
 function schedule():void{if(stopped)return;clearTimeout(timer);timer=setTimeout(()=>{refreshTail=refreshTail.then(sync,sync).catch(error=>console.warn('Library refresh:',error));},180);}
 async function refresh():Promise<void>{refreshTail=refreshTail.then(sync,sync);await refreshTail;}
 async function attachWatcher():Promise<void>{watcher?.close();await managed.path();watcher=watch(managed.root,{recursive:true},()=>schedule());watcher.on('error',error=>console.warn('Library watcher:',error));}
 const snapshot=async(folder=''):Promise<ManagedLibraryState>=>{await refresh();const entries=await managed.list(folder);return {root:managed.root,folder,entries:entries.map(e=>({...e,id:store.data.items.find(x=>x.managed&&x.relativePath===e.relativePath&&!x.unavailable)?.id||e.id})),jobs:managed.snapshot()};};
 const find=(id:string)=>{const item=store.data.items.find(x=>x.id===id&&x.managed&&!x.unavailable);if(!item?.path||!item.relativePath)throw Error('file-not-authorized');return item;};
 const selected=async(ids:string[]):Promise<string[]>=>{if(!Array.isArray(ids)||!ids.length||ids.length>1000)throw Error('file-limit');return Promise.all(ids.map(async id=>{const item=find(id);const parent=await managed.path(dirname(item.relativePath!));const path=join(parent,basename(item.relativePath!)),s=await fs.lstat(path);if(s.isSymbolicLink()||s.dev!==item.identity?.device||s.ino!==item.identity.inode)throw Error('file-changed');return path;}));};
 const handle=<A extends unknown[],R>(name:string,fn:(owner:WebContents,...args:A)=>R)=>ipcMain.handle('fusion:library:'+name,(event,...args:A)=>{if(!isFusionView(event.sender))throw Error('untrusted-view');return fn(event.sender,...args);});
 handle('ingest',async(_owner,paths:string[],folder:string='Inbox')=>managed.start(paths,folder));
 handle('save-blob',async(_owner,bytes:Uint8Array,name:string,folder:string='Inbox')=>{await managed.saveBlob(bytes,libraryName(name),folder);return snapshot(folder);});
 handle('managed',async(owner,command:ManagedCommand)=>{
  if(!command||typeof command!=='object')throw Error('invalid-library-command');const window=BrowserWindow.fromWebContents(owner)||BrowserWindow.getAllWindows()[0];
  if(command.type==='list')return snapshot(command.folder||'');
  if(command.type==='mkdir')await managed.mkdir(command.folder,command.name);
  else if(command.type==='rename'){const paths=await selected([command.id]);await managed.start(paths,dirname(find(command.id).relativePath!),[libraryName(command.name)],true);}
  else if(command.type==='move')await managed.start(await selected(command.ids),command.folder);
  else if(command.type==='cancel')managed.cancel(command.id);
  else if(command.type==='undo')await managed.undo(command.id);
  else if(command.type==='export'){const paths=await selected(command.ids),result=await dialog.showOpenDialog(window,{properties:['openDirectory','createDirectory']});if(!result.canceled){const job=await managed.startToDirectory(paths,result.filePaths[0]);await managed.wait(job.id);}}
  else if(command.type==='trash'){const paths=await selected(command.ids);const answer=await dialog.showMessageBox(window,{type:'question',message:'FloatIsland',detail:paths.map(path=>basename(path)).join('\n'),buttons:[app.getLocale().startsWith('zh')?'取消':'Cancel',app.getLocale().startsWith('zh')?'移入回收站':'Move to recycle bin'],defaultId:0,cancelId:0});if(answer.response===1){const checked=await selected(command.ids);for(let i=0;i<checked.length;i++){if(checked[i]!==paths[i])throw Error('file-changed');await shell.trashItem(checked[i]);}}}
  else if(command.type==='root'){const result=await dialog.showOpenDialog(window,{properties:['openDirectory','createDirectory']});if(!result.canceled){await managed.relocate(result.filePaths[0]);await attachWatcher();}}
  else if(command.type==='reveal'){await managed.path();await shell.openPath(managed.root);}
  else throw Error('invalid-library-command');return snapshot();
 });
 const readerWrites=new Map<string,Promise<void>>();let readerPublishTimer:ReturnType<typeof setTimeout>|undefined;
 handle('reader',async(owner,id:string,value?:ReaderState)=>{const file=requireArtifact(owner,id);const item=store.data.items.find(x=>x.path===file.path);const stable=item?.id||createHash('sha256').update(file.temporary?file.name:file.path).digest('hex');if(!/^[\w-]{1,100}$/.test(stable))throw Error('invalid-id');const path=join(store.directory,'reader',stable+'.json');if(value){const checked=validateReaderState(value),bytes=JSON.stringify(checked);const previous=readerWrites.get(path)||Promise.resolve();const pending=previous.catch(()=>{}).then(async()=>{await fs.mkdir(dirname(path),{recursive:true});await fs.writeFile(path+'.tmp',bytes);await fs.rename(path+'.tmp',path);if(item){item.reading={...item.reading,progress:checked.progress,updatedAt:Date.now()};item.openedAt=Date.now();if(!readerPublishTimer)readerPublishTimer=setTimeout(()=>{readerPublishTimer=undefined;publish();},2000);}});readerWrites.set(path,pending);try{await pending;return checked;}finally{if(readerWrites.get(path)===pending)readerWrites.delete(path);}}await readerWrites.get(path)?.catch(()=>{});try{return validateReaderState(JSON.parse(await fs.readFile(path,'utf8')));}catch{return structuredClone(readerDefaults);}});
 void managed.recover().then(attachWatcher).then(refresh).catch(error=>console.warn('Managed library initialization:',error));app.once('before-quit',(event)=>{clearTimeout(readerPublishTimer);if(readerWrites.size&&event){event.preventDefault();void Promise.allSettled([...readerWrites.values()]).then(()=>{publish();app.quit();});}else publish();stopped=true;clearTimeout(timer);watcher?.close();for(const job of managed.snapshot())if(job.state==='running')managed.cancel(job.id);});return managed;
}
