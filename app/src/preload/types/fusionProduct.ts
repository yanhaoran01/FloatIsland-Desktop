/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionProduct.ts @description Shared artifacts, typed tasks and integrated tools. @author 鸡哥 */
export type ArtifactKind = 'image'|'pdf'|'text'|'table'|'archive'|'media'|'file';
export interface ProductArtifact { id:string; name:string; size:number; mime:string; kind:ArtifactKind; }
export type ProductOptions = Record<string,string|number|boolean>;
export type ProductAction = 'ocr'|'text-clean'|'image-convert'|'pdf'|'csv'|'url'|'hash'|'rename'|'zip'|'copy'|'export';
export interface FlowStep { id:string; action:ProductAction; options:ProductOptions; }
export interface ProductFlow { id:string; name:string; steps:FlowStep[]; }
export interface ProductJob { id:string; action?:ProductAction; kind:'tool'|'workflow'|'record'|'scroll'|'share'; state:'running'|'waiting'|'done'|'error'|'cancelled'; progress:number; step?:number; result:ProductArtifact[]; error?:string; preview?:Array<{before:string;after:string;error:string}>; }
export interface ProductData { version:1; revision:number; flows:ProductFlow[]; history:Array<{id:string;kind:string;time:number;name:string;state:string}>; hotkey:string; hotkeyError?:string; }
export interface CaptureOptions { mode:'screen'|'window'|'region'; sourceId?:string; rect?:{x:number;y:number;width:number;height:number}; }
export interface RecordOptions extends CaptureOptions { systemAudio:boolean; microphone:boolean; camera:boolean; focus:boolean; keys:boolean; }
export interface RecordState { id:string; state:'idle'|'starting'|'recording'|'paused'|'finishing'|'done'|'error'; elapsed:number; microphoneActive?:boolean; error?:string; artifact?:ProductArtifact; }
export interface SharePeer { fingerprint:string; alias:string; address:string; port:number; protocol:'http'|'https'; }
export interface ShareRequest { id:string; alias:string; files:Array<{id:string;name:string;size:number}>; }
export interface ShareState { active:boolean; port:number; peers:SharePeer[]; requests:ShareRequest[]; jobs:ProductJob[]; error?:string; }
export interface LocalImportRequest {requestId:string;domain:'music'|'reading'|'files';mode:'files'|'folder'|'drop'|'rescan';}
export interface LocalImportProgress {requestId:string;state:'scanning'|'done'|'cancelled'|'error';count:number;}
export interface LocalImportResult {requestId:string;artifacts:ProductArtifact[];items:string[];count?:number;errors:Array<{name:string;error:string}>;cancelled:boolean;}
export interface FusionProductApi {
  fusionLocalImport:(request:LocalImportRequest,files?:File[])=>Promise<LocalImportResult>;
  fusionLocalImportCancel:(requestId:string)=>Promise<boolean>;
  onFusionLocalImport:(callback:(progress:LocalImportProgress)=>void)=>()=>void;
 fusionProductPick:()=>Promise<ProductArtifact[]>;
 fusionProductImport:(files:File[])=>Promise<ProductArtifact[]>;
 fusionProductRead:(id:string)=>Promise<{artifact:ProductArtifact;bytes:Uint8Array}>;
 fusionProductCreate:(bytes:Uint8Array,name:string)=>Promise<ProductArtifact>;
 fusionProductText:(text:string)=>Promise<ProductArtifact>;
 fusionProductSave:(id:string)=>Promise<boolean>;
 fusionProductOpen:(id:string)=>Promise<string>;
 fusionProductPlay:(id:string)=>Promise<boolean>;
 fusionProductData:()=>Promise<ProductData>;
 fusionProductWrite:(data:ProductData,retryHotkey?:boolean)=>Promise<ProductData>;
 fusionProductRun:(action:ProductAction,ids:string[],options:ProductOptions)=>Promise<ProductJob>;
 fusionProductFlow:(id:string,inputs:string[])=>Promise<ProductJob>;
 fusionProductJob:(id:string,command:'cancel'|'confirm')=>Promise<ProductJob>;
 onFusionProductJob:(callback:(job:ProductJob)=>void)=>()=>void;
 fusionProductSearchApps:()=>Promise<Array<{id:string;name:string;path:string}>>;
 fusionProductLaunch:(path:string)=>Promise<void>;
 onFusionProductSearch:(callback:()=>void)=>()=>void;
 fusionProductCapture:(options:CaptureOptions)=>Promise<ProductArtifact>;
 fusionProductPins:(command:'unlock'|'close')=>Promise<void>;
 fusionProductPin:(id:string)=>Promise<void>;
 fusionProductScroll:(command:'start'|'frame'|'finish'|'cancel',options?:CaptureOptions)=>Promise<ProductJob>;
 fusionProductRecordSources:()=>Promise<Array<{id:string;name:string}>>;
 fusionProductRecordStart:(options:RecordOptions)=>Promise<RecordState>;
 fusionProductRecordControl:(command:'pause'|'resume'|'stop'|'cancel')=>Promise<RecordState>;
 fusionProductRecordState:()=>Promise<RecordState>;
 fusionProductRecordExport:(id:string,format:'mp4'|'webm'|'gif',start:number,end:number)=>Promise<ProductJob>;
 onFusionProductRecord:(callback:(state:RecordState)=>void)=>()=>void;
 fusionProductShare:(command:'start'|'stop'|'discover',address?:string)=>Promise<ShareState>;
 fusionProductShareSend:(peer:SharePeer,ids:string[])=>Promise<ProductJob>;
 fusionProductShareReply:(id:string,accept:boolean)=>Promise<ShareState>;
 onFusionProductShare:(callback:(state:ShareState)=>void)=>()=>void;
}
