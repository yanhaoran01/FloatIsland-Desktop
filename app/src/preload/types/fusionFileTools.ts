/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionFileTools.ts @description Selected-file capabilities and cancellable jobs. @author 鸡哥 */
export interface GrantedFile { id:string; name:string; size:number; }
export interface RenameOptions { prefix:string; suffix:string; find:string; replace:string; numbered:boolean; start:number; digits:number; }
export interface RenameEntry { id:string; before:string; after:string; error:string; }
export interface RenamePreview { id:string; entries:RenameEntry[]; }
export interface FileOperationResult { ok:boolean; output?:string; entries?:RenameEntry[]; rollbackErrors?:string[]; }
export interface ArchiveEntry { name:string; size:number; }
export interface FileJobState { id:string; progress:number; state:'running'|'done'|'cancelled'|'error'; error?:string; output?:string; }
export interface StopwatchState { version:1; elapsedMs:number; startedAt:number|null; laps:number[]; }
export interface FusionFileToolsApi {
 fusionFilesSelect:(kind:'files'|'zip')=>Promise<GrantedFile[]>;
 fusionRenamePreview:(ids:string[],options:RenameOptions)=>Promise<RenamePreview>;
 fusionRenameExecute:(id:string)=>Promise<FileOperationResult>;
 fusionRenameUndo:()=>Promise<FileOperationResult>;
 fusionArchiveList:(id:string)=>Promise<ArchiveEntry[]>;
 fusionArchiveStart:(operation:'pack'|'extract',ids:string[],entries?:string[])=>Promise<string|null>;
 fusionFileJobCancel:(id:string)=>Promise<boolean>;
 onFusionFileJob:(callback:(state:FileJobState)=>void)=>()=>void;
 fusionStopwatchGet:()=>Promise<StopwatchState>;
 fusionStopwatchControl:(action:'start'|'pause'|'lap'|'reset')=>Promise<StopwatchState>;
 onFusionStopwatch:(callback:(state:StopwatchState)=>void)=>()=>void;
}
