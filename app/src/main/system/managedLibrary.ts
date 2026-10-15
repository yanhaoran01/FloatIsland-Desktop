/* FloatIsland contributors. GPL-3.0. */
/** Durable, no-overwrite file moves. Never recursively deletes an unverified source. */
import {promises as fs,createReadStream,createWriteStream,existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {basename,dirname,extname,join,relative,resolve,isAbsolute,sep,parse} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {createRequire} from 'node:module';
import type {LibraryMoveJob,ManagedEntry} from '../../preload/types/managedLibrary';
interface Stamp {path:string;directory:boolean;device:number;inode:number;size:number;mtime:number;hash?:string;}
interface Journal extends LibraryMoveJob {manifests:Record<string,Stamp[]>;stages:string[];authorized?:Record<string,Stamp>;}
const inside=(root:string,path:string):boolean=>{const rel=relative(root,path);return rel===''||rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);};
export const libraryName=(name:string):string=>{if(typeof name!=='string'||!name.trim()||name.length>180||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)||name==='.'||name==='..'||name.startsWith('.float-'))throw Error('invalid-file-name');return name;};
async function digest(path:string,signal?:AbortSignal):Promise<string>{const hash=createHash('sha256');for await(const chunk of createReadStream(path,{signal})){signal?.throwIfAborted();hash.update(chunk);}return hash.digest('hex');}
async function manifest(root:string,signal?:AbortSignal):Promise<Stamp[]>{
 const result:Stamp[]=[];
 const walk=async(path:string):Promise<void>=>{signal?.throwIfAborted();const s=await fs.lstat(path);if(s.isSymbolicLink()||!s.isDirectory()&&!s.isFile())throw Error('linked-or-special-file');if(result.length>=100000)throw Error('library-entry-limit');const stamp:Stamp={path:relative(root,path),directory:s.isDirectory(),device:s.dev,inode:s.ino,size:s.size,mtime:s.mtimeMs};result.push(stamp);if(stamp.directory){for(const name of (await fs.readdir(path)).sort())await walk(join(path,name));}else{stamp.hash=await digest(path,signal);const after=await fs.lstat(path);if(after.ino!==stamp.inode||after.dev!==stamp.device||after.size!==stamp.size||after.mtimeMs!==stamp.mtime)throw Error('file-changed');}};
 await walk(root);return result;
}
async function verify(root:string,expected:Stamp[],identity:boolean,signal?:AbortSignal):Promise<void>{const actual=await manifest(root,signal);if(actual.length!==expected.length)throw Error('file-changed');for(let i=0;i<actual.length;i++){const a=actual[i],e=expected[i];if(a.path!==e.path||a.directory!==e.directory||!a.directory&&(a.size!==e.size||a.hash!==e.hash)||identity&&(a.inode!==e.inode||a.device!==e.device||a.mtime!==e.mtime))throw Error('file-changed');}}
/** Windows MoveFileEx without REPLACE_EXISTING is atomic and rejects an occupied target. */
async function noReplaceMove(source:string,target:string):Promise<void>{
 if(process.platform==='win32'){const require=createRequire(import.meta.url),koffi:typeof import('koffi')=require('koffi'),move=koffi.load('kernel32.dll').func('bool __stdcall MoveFileExW(str16,str16,uint32)');if(!move(source,target,0)){throw Error('native-move-failed');}return;}
 // Test/portable fallback: regular-file hard-link gives exclusive destination creation.
 const stat=await fs.lstat(source);if(stat.isFile()){await fs.link(source,target);try{await fs.unlink(source);}catch(error){await fs.unlink(target);throw error;}}else{if(existsSync(target))throw Error('target-exists');await fs.rename(source,target);}
}
async function deleteVerified(root:string,expected:Stamp[]):Promise<void>{
 // All identity/content checks run before deleting any file; unexpected entries stop removal.
 await verify(root,expected,true);
 for(const stamp of [...expected].reverse()){const path=join(root,stamp.path),s=await fs.lstat(path);if(s.isSymbolicLink()||s.dev!==stamp.device||s.ino!==stamp.inode||!stamp.directory&&(s.size!==stamp.size||s.mtimeMs!==stamp.mtime||await digest(path)!==stamp.hash))throw Error('file-changed');if(stamp.directory)await fs.rmdir(path);else await fs.unlink(path);}
}
export class ManagedLibrary {
 root:string;readonly jobs=new Map<string,Journal>();private controllers=new Map<string,AbortController>();private tail:Promise<unknown>=Promise.resolve();private reservations=new Set<string>();private mutations:Promise<unknown>=Promise.resolve();
 private serialize<T>(operation:()=>Promise<T>):Promise<T>{const result=this.mutations.then(operation,operation);this.mutations=result.catch(()=>{});return result;}
 constructor(readonly directory:string,defaultRoot:string,private notify:(job:LibraryMoveJob)=>void=()=>{},private changed:()=>void=()=>{},private protectedPaths:string[]=[]){
  mkdirSync(directory,{recursive:true});this.root=resolve(defaultRoot);try{const config=JSON.parse(readFileSync(join(directory,'managed-root.json'),'utf8'));if(config.version===1&&typeof config.root==='string')this.root=resolve(config.root);}catch{}
  for(const name of existsSync(join(directory,'moves'))?requireDirectory(join(directory,'moves')):[]){if(!name.endsWith('.json'))continue;try{const j:Journal=JSON.parse(readFileSync(join(directory,'moves',name),'utf8'));if(!/^[\w-]{1,100}$/.test(j.id)||!Array.isArray(j.entries)||!j.manifests||j.entries.some(e=>!isAbsolute(e.source)||!isAbsolute(e.target))||Object.values(j.manifests).some(stamps=>!Array.isArray(stamps)||stamps.some(s=>isAbsolute(s.path)||s.path.split(/[\\/]/).includes('..'))))continue;if(j.state==='running'){j.state='interrupted';j.entries.forEach(e=>{if(e.state==='copying')e.error='Interrupted: original retained; staging file available for recovery';});}this.jobs.set(j.id,j);}catch{}}
 }
 publicJob(job:Journal):LibraryMoveJob {const {manifests:_m,stages:_s,authorized:_a,...value}=structuredClone(job);return value;}
 snapshot():LibraryMoveJob[]{return [...this.jobs.values()].map(j=>this.publicJob(j));}
 private save(job:Journal):void{mkdirSync(join(this.directory,'moves'),{recursive:true});const path=join(this.directory,'moves',job.id+'.json');writeFileSync(path+'.tmp',JSON.stringify(job));renameSync(path+'.tmp',path);this.notify(this.publicJob(job));}
 async path(folder=''):Promise<string>{if(typeof folder!=='string'||isAbsolute(folder)||folder.split(/[\\/]/).some(x=>x==='..'||x.startsWith('.float-')))throw Error('invalid-library-folder');await fs.mkdir(this.root,{recursive:true});const root=await fs.realpath(this.root),path=resolve(root,folder);if(!inside(root,path))throw Error('invalid-library-folder');let cursor=path;while(cursor!==root){if(existsSync(cursor)){const s=await fs.lstat(cursor);if(s.isSymbolicLink()||!s.isDirectory())throw Error('invalid-library-folder');}cursor=dirname(cursor);}return path;}
 async list(folder=''):Promise<ManagedEntry[]>{const path=await this.path(folder);await fs.mkdir(path,{recursive:true});const names=await fs.readdir(path),rows:ManagedEntry[]=[];for(const name of names){if(name.startsWith('.float-'))continue;try{const s=await fs.lstat(join(path,name));if(s.isSymbolicLink()||!s.isFile()&&!s.isDirectory())continue;const relativePath=relative(this.root,join(path,name));rows.push({id:createHash('sha256').update(`${s.dev}:${s.ino}`).digest('hex'),name,relativePath,directory:s.isDirectory(),size:s.size,modified:s.mtimeMs});}catch{}}return rows.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));}
 async mkdir(folder:string,name:string):Promise<void>{return this.serialize(async()=>{await this.tail;await fs.mkdir(join(await this.path(folder),libraryName(name)));this.changed();});}
 private async unique(directory:string,name:string):Promise<string>{libraryName(name);const ext=extname(name),base=name.slice(0,name.length-ext.length);for(let n=0;n<100000;n++){const path=join(directory,n?`${base} (${n})${ext}`:name);if(!existsSync(path)&&!this.reservations.has(path.toLowerCase())){this.reservations.add(path.toLowerCase());return path;}}throw Error('name-conflict');}
 private async authorizeSource(source:string):Promise<string>{if(typeof source!=='string'||!isAbsolute(source))throw Error('file-not-authorized');const s=await fs.lstat(source);if(s.isSymbolicLink())throw Error('linked-or-special-file');const real=await fs.realpath(source);if(real===parse(real).root||inside(real,this.root)||this.protectedPaths.some(p=>inside(resolve(p),real)||resolve(p).toLowerCase()===real.toLowerCase()))throw Error('protected-library-path');return real;}
 async start(sources:string[],folder='',names?:string[],exact=false):Promise<LibraryMoveJob>{return this.serialize(async()=>{await this.tail;return this.startInternal(sources,folder,names,exact);});}
 private async startInternal(sources:string[],folder='',names?:string[],exact=false):Promise<LibraryMoveJob>{
  if(!Array.isArray(sources)||sources.length<1||sources.length>1000)throw Error('file-limit');const directory=await this.path(folder);await fs.mkdir(directory,{recursive:true});return this.startToDirectoryInternal(sources,directory,names,exact);
 }
 async startToDirectory(sources:string[],directory:string,names?:string[],exact=false):Promise<LibraryMoveJob>{return this.serialize(async()=>{await this.tail;return this.startToDirectoryInternal(sources,directory,names,exact);});}
 private async startToDirectoryInternal(sources:string[],directory:string,names?:string[],exact=false):Promise<LibraryMoveJob>{
  if(!Array.isArray(sources)||sources.length<1||sources.length>1000)throw Error('file-limit');const targetDirectory=await fs.realpath(directory);const directoryStat=await fs.lstat(directory);if(directoryStat.isSymbolicLink()||!directoryStat.isDirectory())throw Error('invalid-library-folder');directory=targetDirectory;const normalized:string[]=[];for(const source of sources){const path=await this.authorizeSource(source);if(inside(path,directory))throw Error('recursive-library-move');if(normalized.some(x=>inside(x,path)||inside(path,x)))throw Error('overlapping-library-input');normalized.push(path);}
  const job:Journal={id:randomUUID(),state:'running',phase:'checking',progress:0,entries:[],undoable:false,manifests:{},stages:[],authorized:{}};
  try{for(let i=0;i<normalized.length;i++){const target=exact?join(directory,libraryName(names?.[i]||basename(normalized[i]))):await this.unique(directory,names?.[i]||basename(normalized[i]));if(exact&&(existsSync(target)||this.reservations.has(target.toLowerCase())))throw Error('target-exists');if(exact)this.reservations.add(target.toLowerCase());const selected=await fs.lstat(normalized[i]);job.authorized![normalized[i]]={path:'',directory:selected.isDirectory(),device:selected.dev,inode:selected.ino,size:selected.size,mtime:selected.mtimeMs};job.entries.push({source:normalized[i],target,state:'pending'});}}catch(error){for(const entry of job.entries)this.reservations.delete(entry.target.toLowerCase());throw error;}
  this.jobs.set(job.id,job);const controller=new AbortController();this.controllers.set(job.id,controller);this.save(job);
  const run=async()=>{try{await this.run(job,controller.signal);}finally{this.controllers.delete(job.id);job.entries.forEach(e=>this.reservations.delete(e.target.toLowerCase()));}};this.tail=this.tail.then(run,run);return this.publicJob(job);
 }
 private async run(job:Journal,signal:AbortSignal):Promise<void>{
  for(let i=0;i<job.entries.length;i++){const entry=job.entries[i];if(signal.aborted)break;
   try{const selected=job.authorized?.[entry.source],current=await fs.lstat(entry.source);if(selected&&(current.dev!==selected.device||current.ino!==selected.inode||!selected.directory&&(current.size!==selected.size||current.mtimeMs!==selected.mtime)))throw Error('file-changed');job.phase='checking';const stamps=await manifest(entry.source,signal);job.manifests[entry.source]=stamps;this.save(job);signal.throwIfAborted();if(existsSync(entry.target))throw Error('target-exists');const dest=await fs.lstat(dirname(entry.target));
    if(stamps[0].device===dest.dev){job.phase='moving';await verify(entry.source,stamps,true,signal);signal.throwIfAborted();await noReplaceMove(entry.source,entry.target);entry.state='done';}
    else{job.phase='copying';entry.state='copying';const stage=join(dirname(entry.target),'.float-'+job.id+'-'+i);job.stages.push(stage);this.save(job);
     const totalBytes=stamps.reduce((n,s)=>n+(s.directory?0:s.size),0);let copied=0,lastEmit=0;
     for(const stamp of stamps){signal.throwIfAborted();const target=join(stage,stamp.path);if(stamp.directory)await fs.mkdir(target);else{await pipeline(createReadStream(join(entry.source,stamp.path)),new Transform({transform:(chunk:Buffer,_encoding,callback)=>{copied+=chunk.length;job.progress=(i+copied/Math.max(1,totalBytes))/job.entries.length;if(Date.now()-lastEmit>200){lastEmit=Date.now();this.notify(this.publicJob(job));}callback(null,chunk);}}),createWriteStream(target,{flags:'wx'}),{signal});if(await digest(target,signal)!==stamp.hash)throw Error('copy-verification-failed');}}
     await verify(stage,stamps,false,signal);await verify(entry.source,stamps,true,signal);signal.throwIfAborted();await noReplaceMove(stage,entry.target);entry.state='committed';this.save(job);await deleteVerified(entry.source,stamps);entry.state='done';
    }
   }catch(error){entry.error=error instanceof Error?error.message:String(error);if(entry.state!=='committed')entry.state='error';}
   job.progress=(i+1)/job.entries.length;job.undoable=job.entries.some(e=>e.state==='done');this.save(job);this.changed();
  }
  // Only owned staging paths are eligible for cleanup, and only if they still have their expected contents.
  for(let i=0;i<job.entries.length;i++){const stage=join(dirname(job.entries[i].target),'.float-'+job.id+'-'+i);if(!existsSync(stage))continue;try{const stamps=await manifest(stage),expected=job.manifests[job.entries[i].source];if(!expected||stamps.some(stamp=>{const original=expected.find(e=>e.path===stamp.path);return !original||original.directory!==stamp.directory||!stamp.directory&&(stamp.hash!==original.hash||stamp.size!==original.size);}))throw Error('staging-content-changed');await deleteVerified(stage,stamps);}catch{/* Keep uncertain output, visible in the persistent journal. */}}
  job.state=signal.aborted?'cancelled':job.entries.some(e=>e.state!=='done')?'error':'done';job.phase='finished';this.save(job);this.changed();
 }
 cancel(id:string):void{if(!this.controllers.has(id))throw Error('invalid-task');this.controllers.get(id)!.abort();}
 async recover():Promise<void>{for(const job of this.jobs.values()){if(job.state!=='interrupted')continue;for(const entry of job.entries){if(!['pending','committed','copying'].includes(entry.state))continue;const stamps=job.manifests[entry.source];if(!stamps)continue;try{if(existsSync(entry.target)){await verify(entry.target,stamps,false);if(!existsSync(entry.source)){entry.state='done';entry.error=undefined;}else entry.error='Source and verified destination retained; recovery requires manual review';}}catch(error){entry.error=String(error);}}job.undoable=job.entries.some(e=>e.state==='done');this.save(job);}this.changed();}
 async wait(id:string):Promise<LibraryMoveJob>{await this.tail;const job=this.jobs.get(id);if(!job)throw Error('invalid-task');return this.publicJob(job);}
 async undo(id:string):Promise<void>{return this.serialize(()=>this.undoInternal(id));}
 private async undoInternal(id:string):Promise<void>{
  await this.tail;const job=this.jobs.get(id);if(!job||job.state==='running')throw Error('invalid-task');
  for(const entry of [...job.entries].reverse().filter(e=>e.state==='done')){try{if(existsSync(entry.source))throw Error('original-position-occupied');await verify(entry.target,job.manifests[entry.source],false);await fs.mkdir(dirname(entry.source),{recursive:true});const originalRoot=this.root; // Transfer outside the library through the same verified engine.
    const restore:Journal={id:randomUUID(),state:'running',phase:'checking',progress:0,entries:[{source:entry.target,target:entry.source,state:'pending'}],undoable:false,manifests:{},stages:[]};this.jobs.set(restore.id,restore);this.save(restore);await this.run(restore,new AbortController().signal);this.root=originalRoot;if(restore.entries[0].state!=='done')throw Error(restore.entries[0].error||'undo-failed');restore.undoable=false;this.save(restore);entry.state='undone';entry.error=undefined;
   }catch(error){entry.error=String(error);}this.save(job);}
  job.undoable=job.entries.some(e=>e.state==='done');this.save(job);this.changed();
 }
 async saveBlob(bytes:Uint8Array,name:string,folder='Inbox'):Promise<string>{return this.serialize(async()=>{await this.tail;return this.saveBlobInternal(bytes,name,folder);});}
 /** Commits a verified download under the same lock as migration and moves. @param source - Completed temporary file. @param name - Display name. @returns Final library path. */
 async commitDownload(source:string,name:string,taskId:string=randomUUID(),folder:'Books'|'Music'='Books'):Promise<string>{return this.serialize(async()=>{
  await this.tail;libraryName(name);if(!/^[a-f\d-]{36}$/i.test(taskId))throw Error('invalid-download-id');
  const journal=join(this.directory,'imports',taskId+'.json');let prior:{id:string;target:string;stage:string;hash:string;size:number;state:string}|undefined;
  try{prior=JSON.parse(await fs.readFile(journal,'utf8'));}catch{}
  const matches=async(path:string)=>{const info=await fs.lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size!==prior!.size||await digest(path)!==prior!.hash)throw Error('download-commit-changed');};
  if(prior){if(prior.id!==taskId||!inside(this.root,prior.target)||prior.stage!==join(dirname(prior.target),'.float-import-'+taskId))throw Error('invalid-download-journal');
   if(existsSync(prior.target)){await matches(prior.target);this.changed();return prior.target;}
   if(prior.state==='verified'&&existsSync(prior.stage)){await matches(prior.stage);await noReplaceMove(prior.stage,prior.target);prior.state='committed';writeFileSync(journal+'.tmp',JSON.stringify(prior));renameSync(journal+'.tmp',journal);this.changed();return prior.target;}
   if(existsSync(prior.stage)){await matches(prior.stage);await fs.unlink(prior.stage);}
  }
  const expected=await manifest(source);if(expected.length!==1||expected[0].directory)throw Error('invalid-download-file');
  const directory=await this.path(folder);await fs.mkdir(directory,{recursive:true});const stage=join(directory,'.float-import-'+taskId),target=await this.unique(directory,name);
  const log=(state:string)=>{mkdirSync(dirname(journal),{recursive:true});writeFileSync(journal+'.tmp',JSON.stringify({version:1,id:taskId,source,stage,target,state,hash:expected[0].hash,size:expected[0].size}));renameSync(journal+'.tmp',journal);};
  try{log('copying');await fs.copyFile(source,stage,1);await verify(stage,expected,false);await verify(source,expected,true);log('verified');await noReplaceMove(stage,target);log('committed');this.changed();return target;}
  finally{this.reservations.delete(target.toLowerCase());}
 });}
 private async saveBlobInternal(bytes:Uint8Array,name:string,folder='Inbox'):Promise<string>{if(!(bytes instanceof Uint8Array)||bytes.byteLength>268435456)throw Error('file-too-large');const directory=await this.path(folder);await fs.mkdir(directory,{recursive:true});const target=await this.unique(directory,name);try{await fs.writeFile(target,bytes,{flag:'wx'});}finally{this.reservations.delete(target.toLowerCase());}this.changed();return target;}
 async relocate(root:string):Promise<void>{return this.serialize(()=>this.relocateInternal(root));}
 private async relocateInternal(root:string):Promise<void>{await this.tail;const chosen=await fs.realpath(root);if(inside(this.root,chosen)||inside(chosen,this.root)||chosen===parse(chosen).root)throw Error('invalid-library-root');const old=this.root,entries=await this.list();try{if(entries.length){const job=await this.startToDirectoryInternal(entries.map(e=>join(old,e.relativePath)),chosen,entries.map(e=>e.name),true);const result=await this.wait(job.id);if(result.state!=='done'){await this.undoInternal(job.id);throw Error('library-migration-incomplete');}}const path=join(this.directory,'managed-root.json');writeFileSync(path+'.tmp',JSON.stringify({version:1,root:chosen}));renameSync(path+'.tmp',path);this.root=chosen;}catch(error){this.root=old;throw error;}this.changed();}
}
function requireDirectory(path:string):string[]{const require=createRequire(import.meta.url);return (require('node:fs') as typeof import('node:fs')).readdirSync(path);}
