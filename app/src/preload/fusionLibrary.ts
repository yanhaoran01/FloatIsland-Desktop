/* FloatIsland contributors. GPL-3.0. */
/** @file fusionLibrary.ts @description Trusted-view bridge; native drops originate from real File objects. */
import {ipcRenderer,webUtils} from 'electron';
import type {FusionLibraryApi} from './types/fusionLibrary';
const listen=<T>(channel:string,callback:(value:T)=>void):(()=>void)=>{const handler=(_event:Electron.IpcRendererEvent,value:T):void=>callback(value);ipcRenderer.on(channel,handler);return()=>ipcRenderer.removeListener(channel,handler);};
export const fusionLibraryApi:FusionLibraryApi={
 fusionLibraryManaged:command=>ipcRenderer.invoke('fusion:library:managed',command),
 fusionLibraryIngest:(files,folder)=>{if(!Array.isArray(files)||files.some(f=>!(f instanceof File)))return Promise.reject(Error('file-not-authorized'));const paths=files.map(f=>webUtils.getPathForFile(f));if(paths.some(p=>!p))return Promise.reject(Error('file-not-authorized'));return ipcRenderer.invoke('fusion:library:ingest',paths,folder);},
 fusionLibrarySaveBlob:(bytes,name,folder)=>ipcRenderer.invoke('fusion:library:save-blob',bytes,name,folder),
 fusionLibraryReader:(id,state)=>ipcRenderer.invoke('fusion:library:reader',id,state),
 fusionLibraryBooks:command=>ipcRenderer.invoke('fusion:library:books',command),
 onFusionLibraryMove:callback=>listen('fusion:library:move',callback),
 fusionLibraryReaderMetadata:(id,metadata)=>ipcRenderer.invoke('fusion:library:reader-metadata',id,metadata),
 fusionLibraryReaderCover:id=>ipcRenderer.invoke('fusion:library:reader-cover',id),
 fusionLibraryGet:()=>ipcRenderer.invoke('fusion:library:get'),
 fusionLibraryWrite:command=>ipcRenderer.invoke('fusion:library:write',command),
 fusionLibraryPick:(kind,id)=>ipcRenderer.invoke('fusion:library:pick',kind,id),
 fusionLibraryDrop:files=>{if(!Array.isArray(files)||files.some(f=>!(f instanceof File)))return Promise.reject(Error('file-not-authorized'));const paths=files.map(file=>webUtils.getPathForFile(file));if(paths.some(p=>!p))return Promise.reject(Error('file-not-authorized'));return ipcRenderer.invoke('fusion:library:drop',paths);},
 fusionLibraryCollect:ids=>ipcRenderer.invoke('fusion:library:collect',ids),
 fusionLibraryArtifact:id=>ipcRenderer.invoke('fusion:library:artifact',id),
 fusionLibraryOpen:(ids,action)=>ipcRenderer.invoke('fusion:library:open',ids,action),
 fusionLibraryArticle:id=>ipcRenderer.invoke('fusion:library:article',id),
 fusionLibraryReadPage:save=>ipcRenderer.invoke('fusion:library:read-page',save),
 fusionLibrarySaveReading:id=>ipcRenderer.invoke('fusion:library:save-reading',id),
 fusionLibrarySaveUrl:url=>ipcRenderer.invoke('fusion:library:save-url',url),
 fusionLibraryImages:id=>ipcRenderer.invoke('fusion:library:images',id),
 fusionLibrarySearch:(query,id)=>ipcRenderer.invoke('fusion:library:search',query,id),
 fusionLibraryJob:(mode,ids)=>ipcRenderer.invoke('fusion:library:job',mode,ids),
 fusionLibraryCancel:id=>ipcRenderer.invoke('fusion:library:cancel',id),
 fusionLibraryTrash:(id,ids)=>ipcRenderer.invoke('fusion:library:trash',id,ids),
 fusionLibraryTransfer:(action,format)=>ipcRenderer.invoke('fusion:library:transfer',action,format),
 onFusionLibrary:callback=>listen('fusion:library:changed',callback),
 onFusionLibraryJob:callback=>listen('fusion:library:job',callback),
};
