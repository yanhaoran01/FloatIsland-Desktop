/* FloatIsland contributors. GPL-3.0. */
/** @file fusionLibrary.ts @description Restricted local collections and daily tools contract. */
import type { ProductArtifact } from './fusionProduct';
import type {ManagedLibraryApi} from './managedLibrary';
export type LibraryKind = 'url'|'file'|'folder'|'app';
export interface ReaderShelfMetadata {title?:string;author?:string;cover?:boolean;progress?:number;updatedAt?:number;}
export interface LibraryItem {reading?:ReaderShelfMetadata; id:string; kind:LibraryKind; title:string; url?:string; path?:string; managed?:boolean;relativePath?:string; group:string; tags:string[]; note:string; pinned:boolean; createdAt:number; openedAt:number; article?:boolean; unavailable?:boolean; }
export interface LibraryScope { id:string; name:string; path:string; identity?:{device:number;inode:number}; }
export interface TextTemplate {id:string;title:string;group:string;text:string;}
export interface LibraryWorkspace {id:string;title:string;items:string[];}
export interface LibraryFeed {id:string;url:string;title:string;group:string;auto:boolean;updatedAt:number;error?:string;}
export interface FeedEntry {id:string;feedId:string;title:string;url:string;summary:string;date:string;read:boolean;}
export interface LibraryReminder {repeat?:'none'|'daily'|'weekly';history?:number[];notificationError?:string;id:string;todoId?:number;noteId?:string;title:string;due:number;enabled:boolean;notified:boolean;}
export interface LibraryData {version:1|2;managedRoot?:string;revision:number;items:LibraryItem[];scopes:LibraryScope[];templates:TextTemplate[];workspaces:LibraryWorkspace[];feeds:LibraryFeed[];entries:FeedEntry[];reminders:LibraryReminder[];noteTodos?:Record<string,number>;recoveryBackup?:string;}
export interface LibraryArticle {id:string;title:string;url:string;html:string;excerpt:string;progress:number;highlights:string[];savedAt:number;}
export interface LibrarySearchResult {id:string;title:string;detail:string;kind:LibraryKind;scopeId?:string;}
export interface LibraryFileEntry {id:string;scopeId:string;name:string;path:string;size:number;directory:boolean;}
export interface LibraryJob {id:string;mode:'index'|'duplicates'|'feeds'|'article';state:'running'|'done'|'error'|'cancelled';progress:number;count:number;errors:string[];groups?:LibraryFileEntry[][];}
export type LibraryWrite =
 | {type:'noteLink';noteId:string;todoId?:number}
 | {type:'url';url:string;title?:string;group?:string;note?:string;tags?:string[];id?:string}
 | {type:'item';id:string;patch:Partial<Pick<LibraryItem,'title'|'group'|'tags'|'note'|'pinned'>>}
 | {type:'remove';id:string}
 | {type:'removeScope';id:string}
 | {type:'templates';values:TextTemplate[]}
 | {type:'template';value:TextTemplate}
 | {type:'removeTemplate';id:string}
 | {type:'workspace';value:LibraryWorkspace}
 | {type:'removeWorkspace';id:string}
 | {type:'feed';value:LibraryFeed}
 | {type:'removeFeed';id:string}
 | {type:'readEntry';id:string;read:boolean}
 | {type:'reminder';value:LibraryReminder}
 | {type:'removeReminder';id:string}
 | {type:'article';id:string;progress?:number;highlights?:string[]}
 | {type:'legacy';items:unknown[]};
export interface FusionLibraryApi extends ManagedLibraryApi {
 fusionLibraryReaderMetadata:(artifactId:string,metadata:{title:string;author:string;cover?:string})=>Promise<LibraryData>;
 fusionLibraryReaderCover:(itemId:string)=>Promise<string>;
 fusionLibraryGet:()=>Promise<LibraryData>;
 fusionLibraryWrite:(command:LibraryWrite)=>Promise<LibraryData>;
 fusionLibraryPick:(kind:'file'|'folder'|'scope'|'app'|'rebind',id?:string)=>Promise<LibraryData>;
 fusionLibraryDrop:(files:File[])=>Promise<LibraryData>;
 fusionLibraryCollect:(artifactIds:string[])=>Promise<LibraryData>;
 fusionLibraryArtifact:(id:string)=>Promise<ProductArtifact>;
 fusionLibraryOpen:(ids:string[],action:'open'|'reveal')=>Promise<Array<{id:string;error?:string}>>;
 fusionLibraryArticle:(id:string)=>Promise<LibraryArticle>;
 fusionLibraryReadPage:(save:boolean)=>Promise<LibraryArticle>;
 fusionLibrarySaveReading:(id:string)=>Promise<LibraryArticle>;
 fusionLibrarySaveUrl:(url:string)=>Promise<LibraryArticle>;
 fusionLibraryImages:(id:string)=>Promise<LibraryArticle>;
 fusionLibrarySearch:(query:string,requestId:string)=>Promise<LibrarySearchResult[]>;
 fusionLibraryJob:(mode:LibraryJob['mode'],ids:string[])=>Promise<LibraryJob>;
 fusionLibraryCancel:(id:string)=>Promise<void>;
 fusionLibraryTrash:(jobId:string,ids:string[])=>Promise<Array<{id:string;error?:string}>>;
 fusionLibraryTransfer:(action:'import'|'export',format:'json'|'html')=>Promise<LibraryData>;
 onFusionLibrary:(callback:(data:LibraryData)=>void)=>()=>void;
 onFusionLibraryJob:(callback:(job:LibraryJob)=>void)=>()=>void;
}
