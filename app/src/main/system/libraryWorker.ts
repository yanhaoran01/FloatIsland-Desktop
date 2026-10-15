/* FloatIsland contributors. GPL-3.0. */
/** @file libraryWorker.ts @description Bounded directory walking and streaming duplicate hashing in a terminable worker. */
export const libraryWorkerCode=String.raw`
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const skipped=new Set(['node_modules','.git','.cache','target','dist','out','$recycle.bin','system volume information']);
const errors=[],files=[],seen=new Set();let count=0;
function issue(p,e){if(errors.length<100)errors.push(p+': '+e.message);}
async function walk(scope,p,depth){
 if(depth>64){issue(p,Error('directory-depth-limit'));return;}
 let entries;try{entries=await fs.promises.readdir(p,{withFileTypes:true});}catch(e){issue(p,e);return;}
 for(const entry of entries){
  if(entry.name.startsWith('.')||skipped.has(entry.name.toLowerCase()))continue;
  const full=path.join(p,entry.name);let stat;try{stat=await fs.promises.lstat(full);}catch(e){issue(full,e);continue;}
  if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile()))continue;
  const real=await fs.promises.realpath(full).catch(()=>null);if(!real)continue;
  const rel=path.relative(scope.path,real);if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))continue;
  const key=real.toLowerCase();if(seen.has(key))continue;seen.add(key);
  if(++count>100000)throw Error('directory-entry-limit');
  files.push({id:crypto.randomUUID(),scopeId:scope.id,name:entry.name,path:real,size:stat.size,directory:stat.isDirectory(),device:stat.dev,inode:stat.ino,mtime:stat.mtimeMs});
  if(count%100===0)parentPort.postMessage({count,progress:0});
  if(stat.isDirectory())await walk(scope,real,depth+1);
 }
}
async function hash(file){
 const before=await fs.promises.lstat(file.path);if(before.isSymbolicLink()||before.dev!==file.device||before.ino!==file.inode||before.size!==file.size||before.mtimeMs!==file.mtime)throw Error('file-changed');
 const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file.path))h.update(chunk);
 const after=await fs.promises.lstat(file.path);if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ino!==before.ino)throw Error('file-changed');return h.digest('hex');
}
(async()=>{
 for(const scope of workerData.scopes){const s=await fs.promises.lstat(scope.path);if(!s.isDirectory()||s.isSymbolicLink()||s.dev!==scope.device||s.ino!==scope.inode)throw Error('file-changed');await walk(scope,scope.path,0);}
 const groups=[];
 if(workerData.mode==='duplicates'){
  const sizes=new Map();for(const file of files.filter(f=>!f.directory)){const key=String(file.size);if(!sizes.has(key))sizes.set(key,[]);sizes.get(key).push(file);}
  const candidates=[...sizes.values()].filter(g=>g.length>1).flat();const hashes=new Map();let done=0;
  for(const file of candidates){try{file.hash=await hash(file);const key=file.size+':'+file.hash;if(!hashes.has(key))hashes.set(key,[]);hashes.get(key).push(file);}catch(e){issue(file.path,e);}parentPort.postMessage({count,progress:++done/Math.max(1,candidates.length)});}
  groups.push(...[...hashes.values()].filter(g=>g.length>1));
 }
 parentPort.postMessage({done:true,files,groups,errors,count,progress:1});
})().catch(e=>parentPort.postMessage({error:e.message}));
`;
export const librarySearchWorkerCode=String.raw`
const {parentPort,workerData}=require('node:worker_threads');
try{const module=require(workerData.library),Fuse=module.default||module;const results=new Fuse(workerData.rows,{keys:['title','detail'],threshold:.35,ignoreLocation:true}).search(workerData.query).slice(0,100).map(x=>x.item);parentPort.postMessage({results});}catch(e){parentPort.postMessage({error:e.message});}
`;
export const libraryFeedWorkerCode=String.raw`
const {parentPort,workerData}=require('node:worker_threads');const Parser=require(workerData.library);
new Parser().parseString(workerData.xml).then(result=>parentPort.postMessage({result})).catch(e=>parentPort.postMessage({error:e.message}));
`;
