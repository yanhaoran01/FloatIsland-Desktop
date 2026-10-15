/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionProduct.ts @description Restricted typed product bridge; dropped paths come from native File objects. @author 鸡哥 */
import { ipcRenderer,webUtils } from 'electron';
import type { FusionProductApi } from './types/fusionProduct';
const listen=<T>(channel:string,callback:(value:T)=>void):(()=>void)=>{const handler=(_event:Electron.IpcRendererEvent,value:T):void=>callback(value);ipcRenderer.on(channel,handler);return ()=>ipcRenderer.removeListener(channel,handler);};
export const fusionProductApi:FusionProductApi={
 fusionLocalImport:(request,files)=>{const paths=files?.map(file=>{if(!(file instanceof File))throw Error('file-not-authorized');const path=webUtils.getPathForFile(file);if(!path)throw Error('file-not-authorized');return path;});return ipcRenderer.invoke('fusion:product:local-import',request,paths);},
 fusionLocalImportCancel:id=>ipcRenderer.invoke('fusion:product:local-import-cancel',id),
 onFusionLocalImport:callback=>listen('fusion:product:local-import-progress',callback),
 fusionProductPick:()=>ipcRenderer.invoke('fusion:product:pick'),
 fusionProductImport:files=>{if(!Array.isArray(files)||files.some(file=>!(file instanceof File)))throw Error('file-not-authorized');const paths=files.map(file=>webUtils.getPathForFile(file));if(paths.some(path=>!path))return Promise.reject(Error('file-not-authorized'));return ipcRenderer.invoke('fusion:product:import',paths);},
 fusionProductRead:id=>ipcRenderer.invoke('fusion:product:read',id),
 fusionProductCreate:(bytes,name)=>ipcRenderer.invoke('fusion:product:create',bytes,name),
 fusionProductText:text=>ipcRenderer.invoke('fusion:product:text',text),
 fusionProductSave:id=>ipcRenderer.invoke('fusion:product:save',id),
 fusionProductOpen:id=>ipcRenderer.invoke('fusion:product:open',id),
 fusionProductPlay:id=>ipcRenderer.invoke('fusion:product:play',id),
 fusionProductData:()=>ipcRenderer.invoke('fusion:product:data'),
 fusionProductWrite:(data,retryHotkey=false)=>ipcRenderer.invoke('fusion:product:write',data,retryHotkey),
 fusionProductRun:(action,ids,options)=>ipcRenderer.invoke('fusion:product:run',action,ids,options),
 fusionProductFlow:(id,inputs)=>ipcRenderer.invoke('fusion:product:flow',id,inputs),
 fusionProductJob:(id,command)=>ipcRenderer.invoke('fusion:product:job',id,command),
 onFusionProductJob:callback=>listen('fusion:product:job',callback),
 fusionProductSearchApps:()=>ipcRenderer.invoke('fusion:product:apps'),
 fusionProductLaunch:path=>ipcRenderer.invoke('fusion:product:launch',path),
 onFusionProductSearch:callback=>listen('fusion:product:search',callback),
 fusionProductCapture:options=>ipcRenderer.invoke('fusion:product:capture',options),
 fusionProductPins:command=>ipcRenderer.invoke('fusion:product:pins',command),
 fusionProductPin:id=>ipcRenderer.invoke('fusion:product:pin',id),
 fusionProductScroll:(command,options)=>ipcRenderer.invoke('fusion:product:scroll',command,options),
 fusionProductRecordSources:()=>ipcRenderer.invoke('fusion:product:record-sources'),
 fusionProductRecordStart:options=>ipcRenderer.invoke('fusion:product:record-start',options),
 fusionProductRecordControl:command=>ipcRenderer.invoke('fusion:product:record-control',command),
 fusionProductRecordState:()=>ipcRenderer.invoke('fusion:product:record-state'),
 fusionProductRecordExport:(id,format,start,end)=>ipcRenderer.invoke('fusion:product:record-export',id,format,start,end),
 onFusionProductRecord:callback=>listen('fusion:product:record',callback),
 fusionProductShare:(command,address)=>ipcRenderer.invoke('fusion:product:share',command,address),
 fusionProductShareSend:(peer,ids)=>ipcRenderer.invoke('fusion:product:share-send',peer,ids),
 fusionProductShareReply:(id,accept)=>ipcRenderer.invoke('fusion:product:share-reply',id,accept),
 onFusionProductShare:callback=>listen('fusion:product:share-state',callback),
};
