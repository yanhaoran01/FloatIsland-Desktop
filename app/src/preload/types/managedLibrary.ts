/* FloatIsland contributors. GPL-3.0. */
export interface ManagedEntry {id:string;name:string;relativePath:string;directory:boolean;size:number;modified:number;}
export interface MoveEntry {source:string;target:string;state:'pending'|'copying'|'committed'|'done'|'error'|'undone';error?:string;}
export interface LibraryMoveJob {id:string;state:'running'|'done'|'cancelled'|'error'|'interrupted';phase:'checking'|'copying'|'moving'|'finished';progress:number;entries:MoveEntry[];undoable:boolean;}
export interface ReaderPreferences {theme:'dark'|'warm'|'light';font:string;fontSize:number;lineHeight:number;margin:number;paginated:boolean;pdfZoom?:number;}
export interface ReaderMark {id:string;location:string;quote:string;note:string;}
export interface ReaderState {location:string;progress:number;marks:ReaderMark[];preferences:ReaderPreferences;}
export interface ManagedLibraryState {root:string;folder:string;entries:ManagedEntry[];jobs:LibraryMoveJob[];}
export type ManagedCommand = {type:'list';folder?:string}|{type:'mkdir';folder:string;name:string}|{type:'rename';id:string;name:string}|{type:'move';ids:string[];folder:string}|{type:'undo';id:string}|{type:'cancel';id:string}|{type:'export';ids:string[]}|{type:'trash';ids:string[]}|{type:'root'}|{type:'reveal'};
export interface BookSource {id:string;name:string;kind:'legado'|'opds'|'wikisource'|'website';url:string;enabled:boolean;order:number;error?:string;raw?:Record<string,unknown>;updated:number;builtin?:boolean;capabilities?:Array<'search'|'browse'|'chapters'|'content'|'download'>;verification?:{status:'unverified'|'verified';checkedAt:number;sources:string[];error?:string};health?:{status:'unverified'|'available'|'failed';checkedAt?:number;error?:string;verified?:string[]};}
export interface SourceBook {id:string;sourceId:string;title:string;author:string;url:string;cover?:string;download?:string;format?:string;localPath?:string;}
export interface BookChapter {cached?:boolean;title:string;url:string;}
export interface BookSourceState {version:1|2;sources:BookSource[];books:SourceBook[];seeded?:string[];}
export type BookCommand = {type:'state'}|{type:'open-site';id:string}|{type:'edit';id:string;name:string;url:string}|{type:'import';text?:string;url?:string}|{type:'enable';id:string;enabled:boolean}|{type:'order';ids:string[]}|{type:'remove';id:string}|{type:'update';id:string}|{type:'detect';id:string}|{type:'search';query:string;ids?:string[];taskId:string}|{type:'browse';id:string;url?:string;taskId:string}|{type:'chapters';book:SourceBook;taskId:string}|{type:'content';book:SourceBook;chapter:BookChapter;taskId:string}|{type:'download';book:SourceBook;taskId:string}|{type:'cancel';taskId:string};
export interface BookResult {state:BookSourceState;books?:SourceBook[];chapters?:BookChapter[];content?:string;next?:string;errors?:string[];artifact?:import('./fusionProduct').ProductArtifact;}
export interface ManagedLibraryApi {
 fusionLibraryManaged:(command:ManagedCommand)=>Promise<ManagedLibraryState>;
 fusionLibraryIngest:(files:File[],folder?:string)=>Promise<LibraryMoveJob>;
 fusionLibrarySaveBlob:(bytes:Uint8Array,name:string,folder?:string)=>Promise<ManagedLibraryState>;
 fusionLibraryReader:(id:string,state?:ReaderState)=>Promise<ReaderState>;
 fusionLibraryBooks:(command:BookCommand)=>Promise<BookResult>;
 onFusionLibraryMove:(callback:(job:LibraryMoveJob)=>void)=>()=>void;
}
