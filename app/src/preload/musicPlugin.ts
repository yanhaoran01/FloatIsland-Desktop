/* FloatIsland contributors, GPL-3.0. */
/** @file musicPlugin.ts @description Dedicated sandbox bridge, never injected into websites. @author 鸡哥 */
import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('musicPluginBridge',{
  request:(id:string,url:string,options:unknown)=>ipcRenderer.invoke('fusion:music:plugin-http',id,url,options),
  ready:()=>ipcRenderer.send('fusion:music:plugin-ready'),
  result:(id:string,value:unknown,error?:string)=>ipcRenderer.send('fusion:music:plugin-result',id,value,error),
  on:(callback:(value:unknown)=>void)=>{const listener=(_event:Electron.IpcRendererEvent,value:unknown)=>callback(value);ipcRenderer.on('fusion:music:plugin-call',listener);return()=>ipcRenderer.removeListener('fusion:music:plugin-call',listener);}
});
