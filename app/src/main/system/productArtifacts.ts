/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file productArtifacts.ts @description Main-owned file grants and generated artifacts. @author 鸡哥 */
import { app,type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { basename,extname,join,resolve } from 'node:path';
import { lstatSync,mkdirSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import type { ProductArtifact,ArtifactKind } from '../../preload/types/fusionProduct';
export interface ProductGrant {path:string;name:string;size:number;device:number;inode:number;temporary?:boolean;}
export const productGrants=new WeakMap<WebContents,Map<string,ProductGrant>>();
const attached=new WeakSet<WebContents>();
const types:Record<string,[string,ArtifactKind]>={png:['image/png','image'],jpg:['image/jpeg','image'],jpeg:['image/jpeg','image'],webp:['image/webp','image'],gif:['image/gif','image'],pdf:['application/pdf','pdf'],txt:['text/plain','text'],md:['text/markdown','text'],json:['application/json','text'],csv:['text/csv','table'],zip:['application/zip','archive'],mp4:['video/mp4','media'],webm:['video/webm','media'],mp3:['audio/mpeg','media'],wav:['audio/wav','media'],ogg:['audio/ogg','media'],m4a:['audio/mp4','media'],opus:['audio/ogg','media'],mkv:['video/x-matroska','media']};
/** Returns public metadata. @param id - Capability id. @param grant - Main-owned file. @returns Metadata. */
export function artifactMetadata(id:string,grant:ProductGrant):ProductArtifact {
 const [mime,kind]=types[extname(grant.name).slice(1).toLowerCase()]??['application/octet-stream','file'];
 return {id,name:grant.name,size:grant.size,mime,kind};
}
/** Grants a regular selected file. @param sender - Owning view. @param path - Native selected path. @param temporary - Owned output. @returns Metadata. */
export function grantArtifact(sender:WebContents,path:string,temporary=false):ProductArtifact {
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw Error('file-not-authorized');
 const grants=productGrants.get(sender)??new Map<string,ProductGrant>();if(grants.size>=2000)throw Error('file-limit');productGrants.set(sender,grants);
 if(!attached.has(sender)){attached.add(sender);sender.once('destroyed',()=>{for(const value of grants.values())if(value.temporary)try{rmSync(value.path,{force:true});}catch{}grants.clear();});}
 for(const [id,existing] of grants)if(existing.path===resolve(path)&&existing.device===stat.dev&&existing.inode===stat.ino){existing.size=stat.size;return artifactMetadata(id,existing);}
 const id=randomUUID(),value={path:resolve(path),name:basename(path),size:stat.size,device:stat.dev,inode:stat.ino,temporary};grants.set(id,value);return artifactMetadata(id,value);
}
/** Revalidates identity before use. @param sender - Owning view. @param id - Capability id. @returns Grant. */
export function requireArtifact(sender:WebContents,id:string):ProductGrant {
 const file=productGrants.get(sender)?.get(id);if(!file)throw Error('file-not-authorized');
 const stat=lstatSync(file.path);if(!stat.isFile()||stat.isSymbolicLink()||stat.dev!==file.device||stat.ino!==file.inode)throw Error('file-changed');file.size=stat.size;return file;
}
/** Allocates an owned output. @param name - Suggested basename. @returns Temporary path. */
export function artifactOutput(name:string):string {
 const root=join(app.getPath('userData'),'fusion-products','temporary',String(process.pid));mkdirSync(root,{recursive:true});
 const safe=basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(-160)||'result.bin';return join(root,randomUUID()+'-'+safe);
}
/** Creates a result file. @param sender - Owning view. @param bytes - Result bytes. @param name - Name. @returns Metadata. */
export function createArtifact(sender:WebContents,bytes:Uint8Array,name:string):ProductArtifact {
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>268435456)throw Error('file-too-large');
 const path=artifactOutput(name);writeFileSync(path,bytes,{flag:'wx'});const result=grantArtifact(sender,path,true);result.name=basename(name);const grant=productGrants.get(sender)?.get(result.id);if(grant)grant.name=result.name;return result;
}
/** Reads an authorized file. @param sender - Owning view. @param id - Capability id. @returns Metadata and bytes. */
export function readArtifact(sender:WebContents,id:string):{artifact:ProductArtifact;bytes:Uint8Array} {
 const grant=requireArtifact(sender,id);if(grant.size>268435456)throw Error('file-too-large');return {artifact:artifactMetadata(id,grant),bytes:readFileSync(grant.path)};
}
