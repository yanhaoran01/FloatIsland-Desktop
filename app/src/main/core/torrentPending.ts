/* FloatIsland contributors, GPL-3.0. */
/** @file torrentPending.ts @description Exclusive output-side staging with persisted file identity and bounded cleanup. @author 鸡哥 */
import {promises as fs,createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join,basename} from 'node:path';
import {torrentRelativePath} from './torrentModel';
interface Pending {path:string;device:string;inode:string;}
/** Deletes only the exact incomplete file owned by this task; replaced files remain untouched. */
export async function cleanupTorrentPending(root:string,output:string,id:string):Promise<void>{
 const journal=join(root,'pending.json');let value:Pending;try{value=JSON.parse(await fs.readFile(journal,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
 if(!value||typeof value.path!=='string'||!/^\d{1,32}$/.test(value.device)||!/^\d{1,32}$/.test(value.inode)||!basename(value.path).startsWith('.float-'+id+'-')||!basename(value.path).endsWith('.part'))throw Error('invalid-download-temporary');
 torrentRelativePath(output,value.path);
 try{const info=await fs.lstat(value.path,{bigint:true});if(info.isFile()&&!info.isSymbolicLink()&&String(info.dev)===value.device&&String(info.ino)===value.inode){torrentRelativePath(output,await fs.realpath(value.path));await fs.unlink(value.path);}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 await fs.unlink(journal);
}
/** Creates a random file exclusively, records identity, then writes and verifies through its owned handle. */
export async function stageTorrentFile(root:string,parent:string,id:string,source:string,expected:string):Promise<string>{
 const path=join(parent,`.float-${id}-${randomUUID()}.part`),handle=await fs.open(path,'wx');
 try{const info=await handle.stat({bigint:true});await fs.writeFile(join(root,'pending.json.tmp'),JSON.stringify({path,device:String(info.dev),inode:String(info.ino)}));await fs.rename(join(root,'pending.json.tmp'),join(root,'pending.json'));
  const hash=createHash('sha256');for await(const chunk of createReadStream(source)){hash.update(chunk);let offset=0;while(offset<chunk.length){const result=await handle.write(chunk,offset,chunk.length-offset);if(!result.bytesWritten)throw Error('download-write-failed');offset+=result.bytesWritten;}}
  await handle.sync();if(hash.digest('hex')!==expected)throw Error('download-size-mismatch');
 }catch(error){await handle.close();try{const current=await fs.lstat(path,{bigint:true}),owned=await fs.readFile(join(root,'pending.json'),'utf8').then(JSON.parse).catch(()=>null);if(owned?.path===path&&String(current.dev)===owned.device&&String(current.ino)===owned.inode)await fs.unlink(path);}catch{}throw error;}
 await handle.close();return path;
}
