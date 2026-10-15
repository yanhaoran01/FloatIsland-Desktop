/* FusionIsland - GPL-3.0. @file productAux.ts @description Isolated pin and recorder bridge. @author 鸡哥 */
import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('productAux',{
 init:()=>ipcRenderer.invoke('fusion:aux:init'),
 command:(command:string,value?:number)=>ipcRenderer.invoke('fusion:aux:command',command,value),
 chunk:(id:string,sequence:number,bytes:Uint8Array)=>ipcRenderer.invoke('fusion:aux:chunk',id,sequence,bytes),
 status:(id:string,state:string,error?:string)=>ipcRenderer.invoke('fusion:aux:status',id,state,error),
 on:(callback:(value:unknown)=>void)=>{const listener=(_event:Electron.IpcRendererEvent,value:unknown):void=>callback(value);ipcRenderer.on('fusion:aux:event',listener);return()=>ipcRenderer.removeListener('fusion:aux:event',listener);}
});
