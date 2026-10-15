/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file localImportScan.ts @description Bounded native reference imports without moving source files. @author 鸡哥 */
import {promises as fs} from 'node:fs';
import {basename,extname,join,relative} from 'node:path';
export type ImportDomain='music'|'reading'|'files';
export interface ReferenceFile {path:string;name:string;relativePath:string;size:number;device:number;inode:number;}
export interface ReferenceRoot {path:string;device:number;inode:number;}
export const IMPORT_EXTENSIONS:Record<ImportDomain,readonly string[]>={music:['mp3','flac','m4a','wav','ogg','opus','aac','aiff','aif'],reading:['epub','mobi','azw3','fb2','cbz','txt','pdf','docx','xlsx','xls'],files:[]};
/** Scans only native selections, refuses symlinks and yields to cancellation between entries.
 * @param selections - Dialog or native drop paths. @param domain - Accepted formats.
 * @param signal - Cancellation. @param progress - Current accepted count.
 * @returns File references, directory identities and per-file errors.
 */
export async function scanReferences(selections:string[],domain:ImportDomain,signal:AbortSignal,progress:(count:number)=>void=()=>{}):Promise<{files:ReferenceFile[];roots:ReferenceRoot[];errors:Array<{name:string;error:string}>}>{
 if(!Array.isArray(selections)||selections.length>1000||selections.some(p=>typeof p!=='string'||!p||p.length>32768))throw Error('file-limit');
 const files:ReferenceFile[]=[],roots:ReferenceRoot[]=[],errors:Array<{name:string;error:string}>=[],seen=new Set<string>();let visited=0;
 async function walk(path:string,root:string,depth:number):Promise<void>{
  signal.throwIfAborted();if(++visited>100000||depth>64||files.length>=(domain==='files'?1000:10000))throw Error('file-limit');
  try{
   const s=await fs.lstat(path);signal.throwIfAborted();if(s.isSymbolicLink())throw Error('file-not-authorized');
   if(s.isDirectory()){
    if(depth===0)roots.push({path:await fs.realpath(path),device:s.dev,inode:s.ino});
    const dir=await fs.opendir(path);for await(const entry of dir)await walk(join(path,entry.name),root,depth+1);return;
   }
   if(!s.isFile()||IMPORT_EXTENSIONS[domain].length&&!IMPORT_EXTENSIONS[domain].includes(extname(path).slice(1).toLowerCase()))return;
   const canonical=await fs.realpath(path),identity=s.ino?`${s.dev}:${s.ino}`:canonical.toLowerCase();if(seen.has(identity))return;seen.add(identity);
   files.push({path:canonical,name:basename(path),relativePath:relative(root,path)||basename(path),size:s.size,device:s.dev,inode:s.ino});if(files.length%25===0)progress(files.length);
  }catch(error){if(signal.aborted||error instanceof Error&&error.message==='file-limit')throw error;errors.push({name:basename(path),error:error instanceof Error?error.message:String(error)});}
 }
 for(const path of selections)await walk(path,path,0);signal.throwIfAborted();progress(files.length);return {files,roots,errors};
}
