/* FloatIsland contributors. GPL-3.0. */
/** @file libraryStore.ts @description Atomic local collections with non-destructive legacy migration. */
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync,copyFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {LibraryArticle,LibraryData,LibraryItem,LibraryWrite} from '../../preload/types/fusionLibrary';
import {normalizeWebUrl} from './fusionToolStore';
export interface FileIdentity {device:number;inode:number;}
export interface StoredLibraryItem extends LibraryItem {identity?:FileIdentity;}
export interface StoredLibraryData extends LibraryData {items:StoredLibraryItem[];legacyIds:Record<string,string>;migrated:boolean;}
export const emptyLibrary=():StoredLibraryData=>({version:2,revision:0,items:[],scopes:[],templates:[],workspaces:[],feeds:[],entries:[],reminders:[],noteTodos:{},legacyIds:{},migrated:false});
export const libraryText=(value:unknown,limit=200):string=>{if(typeof value!=='string'||value.length>limit)throw Error('invalid-library-data');return value;};
const tags=(value:unknown):string[]=>{if(!Array.isArray(value)||value.length>50)throw Error('invalid-library-data');return [...new Set(value.map(x=>libraryText(x,80)))];};
/** Keeps the original file intact if validation or import fails. */
export class LibraryStore {
 data:StoredLibraryData;
 constructor(readonly directory:string){
  this.data=emptyLibrary();const path=this.path;
  if(existsSync(path)){try{const raw=JSON.parse(readFileSync(path,'utf8'));if(![1,2].includes(raw.version)||!['items','scopes','templates','workspaces','feeds','entries','reminders'].every(key=>Array.isArray(raw[key]))||!Number.isSafeInteger(raw.revision)||!raw.items.every((x:LibraryItem)=>x&&typeof x.id==='string'&&typeof x.title==='string'&&typeof x.group==='string'&&typeof x.note==='string'&&Array.isArray(x.tags)&&['url','file','folder','app'].includes(x.kind)))throw Error('invalid-library-data');if(raw.version===1)copyFileSync(path,path+".before-v2.bak");this.data={...emptyLibrary(),...raw,version:2};}catch(error){const backup=path+'.invalid-'+Date.now()+'.bak';renameSync(path,backup);this.data.recoveryBackup=backup;console.warn('Collection data preserved after a read error:',backup,error);}}
 }
 get path():string{return join(this.directory,'library-v1.json');}
 snapshot():LibraryData{const {legacyIds:_ids,migrated:_migration,...data}=structuredClone(this.data);data.items=data.items.map(({identity:_identity,...item})=>item);return data;}
 save():void{mkdirSync(this.directory,{recursive:true});this.data.revision++;writeFileSync(this.path+'.tmp',JSON.stringify(this.data));renameSync(this.path+'.tmp',this.path);}
 url(raw:string,options:Partial<LibraryItem>={}):StoredLibraryItem {
  const url=normalizeWebUrl(raw),old=this.data.items.find(item=>item.kind==='url'&&item.url===url);
  if(old){if(options.group&&options.group!==old.group)old.tags=[...new Set([...old.tags,options.group])];old.tags=[...new Set([...old.tags,...options.tags||[]])];if(options.note&&!old.note.includes(options.note))old.note=[old.note,options.note].filter(Boolean).join('\n\n');if(options.title&&(!old.title||old.title===old.url||old.title===new URL(url).hostname))old.title=options.title;return old;}
  const item:StoredLibraryItem={id:options.id||randomUUID(),kind:'url',url,title:options.title||new URL(url).hostname,group:options.group||'',tags:options.tags||[],note:options.note||'',pinned:false,createdAt:options.createdAt||Date.now(),openedAt:0};
  if(this.data.items.some(x=>x.id===item.id))item.id=randomUUID();this.data.items.push(item);return item;
 }
 migrate(rows:unknown[]):void{
  for(const row of rows){if(!row||typeof row!=='object'||!('url'in row)||typeof row.url!=='string')continue;
   const r=row as Record<string,unknown>;try{const item=this.url(r.url as string,{title:typeof r.title==='string'?r.title.slice(0,200):undefined,group:typeof r.folder==='string'?r.folder.slice(0,200):typeof r.group==='string'?r.group.slice(0,200):undefined,tags:Array.isArray(r.tags)?tags(r.tags):[],note:typeof r.note==='string'?r.note.slice(0,10000):undefined,createdAt:typeof r.createdAt==='number'?r.createdAt:undefined});if(r.pinned===true)item.pinned=true;if(r.id!==undefined)this.data.legacyIds[String(r.id)]=item.id;}catch{/* Unsupported historical URLs remain in the original backup. */}
  }
 }
 migrateDisk(userData:string):void{
  if(this.data.migrated)return;
  for(const path of [join(userData,'eIsland_store','url-favorites.json'),join(userData,'fusion-workspace','tools-v1.json')]){
   if(!existsSync(path))continue;if(!existsSync(path+'.before-library.bak'))copyFileSync(path,path+'.before-library.bak');try{const raw=JSON.parse(readFileSync(path,'utf8'));const rows=Array.isArray(raw)?raw:raw.bookmarks;if(Array.isArray(rows))this.migrate(rows);}catch(error){console.warn('Legacy bookmarks retained in backup:',path,error);}
  }this.data.migrated=true;this.save();
 }
 article(id:string):LibraryArticle{libraryText(id,100);if(!/^[\w-]+$/.test(id))throw Error('invalid-id');return JSON.parse(readFileSync(join(this.directory,'articles',id+'.json'),'utf8'));}
 saveArticle(value:LibraryArticle):void{if(!/^[\w-]+$/.test(value.id))throw Error('invalid-id');const path=join(this.directory,'articles',value.id+'.json');mkdirSync(dirname(path),{recursive:true});writeFileSync(path+'.tmp',JSON.stringify(value));renameSync(path+'.tmp',path);}
 write(command:LibraryWrite):void {const before=structuredClone(this.data);try{this.apply(command);}catch(error){this.data=before;throw error;}}
 private apply(command:LibraryWrite):void {
  if(!command||typeof command!=='object')throw Error('invalid-library-data');
  if(command.type==='noteLink'){libraryText(command.noteId,100);if(command.todoId!==undefined&&!Number.isSafeInteger(command.todoId))throw Error('invalid-library-data');const links=this.data.noteTodos||{};if(command.todoId===undefined)delete links[command.noteId];else links[command.noteId]=command.todoId;this.data.noteTodos=links;}
  else if(command.type==='url'){this.url(libraryText(command.url,8192),{id:command.id?libraryText(command.id,100):undefined,title:command.title?libraryText(command.title):undefined,group:command.group?libraryText(command.group):undefined,note:command.note?libraryText(command.note,10000):undefined,tags:command.tags?tags(command.tags):[]});}
  else if(command.type==='item'){const item=this.data.items.find(x=>x.id===command.id);if(!item)throw Error('invalid-id');const p=command.patch;if(!p||typeof p!=='object')throw Error('invalid-library-data');for(const key of ['title','group','note']as const)if(p[key]!==undefined)item[key]=libraryText(p[key],key==='note'?10000:200);if(p.tags!==undefined)item.tags=tags(p.tags);if(p.pinned!==undefined){if(typeof p.pinned!=='boolean')throw Error('invalid-library-data');item.pinned=p.pinned;}}
  else if(command.type==='remove'){if(this.data.items.find(x=>x.id===command.id)?.managed)throw Error('managed-file-use-export-or-trash');this.data.items=this.data.items.filter(x=>x.id!==command.id);this.data.workspaces.forEach(w=>w.items=w.items.filter(id=>id!==command.id));}
  else if(command.type==='removeScope')this.data.scopes=this.data.scopes.filter(x=>x.id!==command.id);
  else if(command.type==='templates'){if(!Array.isArray(command.values)||command.values.length>1000)throw Error('invalid-library-data');for(const value of command.values)this.apply({type:'template',value});}
  else if(command.type==='template'){const v=command.value;libraryText(v.id,100);libraryText(v.title);libraryText(v.group);libraryText(v.text,100000);this.data.templates=[...this.data.templates.filter(x=>x.id!==v.id),{id:v.id,title:v.title,group:v.group,text:v.text}];}
  else if(command.type==='removeTemplate')this.data.templates=this.data.templates.filter(x=>x.id!==command.id);
  else if(command.type==='workspace'){const v=command.value;libraryText(v.id,100);libraryText(v.title);if(!Array.isArray(v.items)||v.items.length>100||v.items.some(id=>!this.data.items.some(item=>item.id===id)))throw Error('invalid-workspace');this.data.workspaces=[...this.data.workspaces.filter(x=>x.id!==v.id),{id:v.id,title:v.title,items:[...new Set(v.items)]}];}
  else if(command.type==='removeWorkspace')this.data.workspaces=this.data.workspaces.filter(x=>x.id!==command.id);
  else if(command.type==='feed'){const v=command.value;libraryText(v.id,100);libraryText(v.title);libraryText(v.group);if(typeof v.auto!=='boolean')throw Error('invalid-library-data');const old=this.data.feeds.find(x=>x.id===v.id);this.data.feeds=[...this.data.feeds.filter(x=>x.id!==v.id),{id:v.id,url:normalizeWebUrl(v.url),title:v.title,group:v.group,auto:v.auto,updatedAt:old?.updatedAt||0,error:old?.error}];}
  else if(command.type==='removeFeed'){this.data.feeds=this.data.feeds.filter(x=>x.id!==command.id);this.data.entries=this.data.entries.filter(x=>x.feedId!==command.id);}
  else if(command.type==='readEntry'){if(typeof command.read!=='boolean')throw Error('invalid-library-data');const v=this.data.entries.find(x=>x.id===command.id);if(v)v.read=command.read;}
  else if(command.type==='reminder'){const v=command.value;libraryText(v.id,100);libraryText(v.title);if(!Number.isFinite(v.due)||v.due<0||typeof v.enabled!=='boolean'||v.todoId!==undefined&&!Number.isSafeInteger(v.todoId))throw Error('invalid-reminder');if(v.noteId!==undefined)libraryText(v.noteId,100);if(v.repeat!==undefined&&!['none','daily','weekly'].includes(v.repeat))throw Error('invalid-reminder');const old=this.data.reminders.find(x=>x.id===v.id);this.data.reminders=[...this.data.reminders.filter(x=>x.id!==v.id),{id:v.id,title:v.title,due:v.due,enabled:v.enabled,todoId:v.todoId,noteId:v.noteId,repeat:v.repeat||'none',history:old?.history||[],notified:old?.due===v.due&&old.enabled===v.enabled&&(old.repeat||'none')===(v.repeat||'none')?old.notified:false}];}
  else if(command.type==='removeReminder')this.data.reminders=this.data.reminders.filter(x=>x.id!==command.id);
  else if(command.type==='article'){const article=this.article(command.id);if(command.progress!==undefined){if(!Number.isFinite(command.progress)||command.progress<0||command.progress>1)throw Error('invalid-library-data');article.progress=command.progress;}if(command.highlights!==undefined){if(!Array.isArray(command.highlights)||command.highlights.length>500)throw Error('invalid-library-data');article.highlights=command.highlights.map(x=>libraryText(x,5000));}this.saveArticle(article);}
  else if(command.type==='legacy'){if(!Array.isArray(command.items)||command.items.length>10000)throw Error('invalid-library-data');this.migrate(command.items);}
  else throw Error('invalid-library-command');
  if(this.data.templates.length>1000)throw Error('library-limit');
  if(this.data.items.length>50000)throw Error('library-limit');
 }
}
let singleton:LibraryStore|null=null;
export function initLibraryStore(directory:string):LibraryStore{return singleton??=new LibraryStore(directory);}
export function getLibraryStore():LibraryStore{if(!singleton)throw Error('library-not-ready');return singleton;}
