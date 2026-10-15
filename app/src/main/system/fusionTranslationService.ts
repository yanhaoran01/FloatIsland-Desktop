/* FloatIsland contributors. GPL-3.0. */
/** @file fusionTranslationService.ts @description Cancellable, trusted-view text translation; no account or arbitrary endpoint. */
import {app,ipcMain,type WebContents} from 'electron';
import {isFusionView} from './fusionWindows';
import {translateText} from '../services/textTranslationService';
export function registerFusionTranslation():void{
 const active=new Map<WebContents,{id:string;controller:AbortController}>();
 ipcMain.handle('fusion:translation:text',async(event,text:string,source:string,target:string,id:string)=>{if(!isFusionView(event.sender))throw Error('untrusted-view');if(typeof id!=='string'||id.length>100)throw Error('invalid-request');active.get(event.sender)?.controller.abort();const controller=new AbortController();active.set(event.sender,{id,controller});try{return await translateText(text,source,target,AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]));}finally{if(active.get(event.sender)?.id===id)active.delete(event.sender);}});
 ipcMain.handle('fusion:translation:cancel',(event,id:string)=>{if(!isFusionView(event.sender))throw Error('untrusted-view');if(active.get(event.sender)?.id===id)active.get(event.sender)?.controller.abort();});
 app.on('web-contents-created',(_event,contents)=>contents.once('destroyed',()=>{active.get(contents)?.controller.abort();active.delete(contents);}));
 app.once('before-quit',()=>{for(const task of active.values())task.controller.abort();active.clear();});
}
