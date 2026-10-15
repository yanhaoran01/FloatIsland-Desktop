/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fileToolOperations.ts @description Bounded ZIP metadata and plain-text rename planning. @author 鸡哥 */
import { extname } from 'node:path';
import type { RenameOptions } from '../../preload/types/fusionFileTools';
/** Rejects Windows aliases and path syntax before any filesystem operation. */
export function validFileName(name:string):boolean {
 return Boolean(name)&&name.length<=240&&!/[<>:"/\\|?*\x00-\x1f]/.test(name)&&!/[. ]$/.test(name)&&!/^\.{1,2}$/.test(name)&&!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}
/** Produces names only; permissions and collisions are checked by the main process. */
export function renamedFile(name:string,index:number,options:RenameOptions):string {
 if(!options||['prefix','suffix','find','replace'].some(key=>typeof options[key as keyof RenameOptions]!=='string'||String(options[key as keyof RenameOptions]).length>240)||typeof options.numbered!=='boolean'||!Number.isInteger(options.start)||options.start<0||!Number.isInteger(options.digits)||options.digits<1||options.digits>8)throw Error('invalid-rename-options');
 const extension=extname(name),stem=name.slice(0,name.length-extension.length);
 const replaced=options.find?stem.replaceAll(options.find,options.replace):stem;
 return options.prefix+replaced+(options.numbered?String(options.start+index).padStart(options.digits,'0'):'')+options.suffix+extension;
}
/** Inspects the central directory before decompression; also runs unchanged in the worker. */
export function inspectZip(data:Buffer):Array<{name:string;size:number;directory:boolean}> {
 if(data.length>268435456||data.length<22)throw Error('archive-limit');
 let end=-1;for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--){if(data.readUInt32LE(i)===0x06054b50&&i+22+data.readUInt16LE(i+20)===data.length){end=i;break;}}
 if(end<0||data.readUInt16LE(end+4)!==0||data.readUInt16LE(end+6)!==0)throw Error('invalid-archive');
 const count=data.readUInt16LE(end+10),length=data.readUInt32LE(end+12),offset=data.readUInt32LE(end+16);
 if(count>10000||count===0xffff||offset+length>end)throw Error('archive-limit');
 const entries:Array<{name:string;size:number;directory:boolean}>=[],seen=new Set<string>();let cursor=offset,total=0;
 for(let index=0;index<count;index++){
  if(cursor+46>offset+length||data.readUInt32LE(cursor)!==0x02014b50)throw Error('invalid-archive');
  const flags=data.readUInt16LE(cursor+8),size=data.readUInt32LE(cursor+24),nameLength=data.readUInt16LE(cursor+28),extraLength=data.readUInt16LE(cursor+30),commentLength=data.readUInt16LE(cursor+32),attributes=data.readUInt32LE(cursor+38);
  if(flags&1)throw Error('encrypted-archive');
  if(((attributes>>>16)&0xf000)===0xa000)throw Error('unsafe-archive-path');
  if(cursor+46+nameLength+extraLength+commentLength>offset+length)throw Error('invalid-archive');
  const name=data.subarray(cursor+46,cursor+46+nameLength).toString('utf8').replace(/\\/g,'/'),directory=name.endsWith('/');
  const parts=(directory?name.slice(0,-1):name).split('/');
  if(!name||name.startsWith('/')||parts.some(part=>!part||part==='.'||part==='..'||/[<>:"|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))throw Error('unsafe-archive-path');
  const canonical=parts.join('/').toLowerCase();if(seen.has(canonical))throw Error('unsafe-archive-path');seen.add(canonical);
  total+=size;if(total>536870912||size===0xffffffff)throw Error('archive-limit');
  entries.push({name,size,directory});cursor+=46+nameLength+extraLength+commentLength;
 }
 return entries;
}
