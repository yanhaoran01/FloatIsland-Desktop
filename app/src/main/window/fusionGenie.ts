/* FloatIsland - https://github.com/yanhaoran01/FloatIsland. Copyright (C) 2026 contributors. GPL-3.0. Snapshots live in memory only. */
/** @file fusionGenie.ts @description Trusted in-memory snapshots for reversible dock transitions. @author 鸡哥 */
import {BrowserWindow,ipcMain,screen} from 'electron';
import {captureFusionGuestViews} from '../system/fusionBrowserService';
import {dockRect} from './fusionDockGeometry';
import type {GenieSnapshot} from '../../preload/types/genie';
let compactImage:{edge:string;image:string}|undefined;
let active=false,revision=0,timer:ReturnType<typeof setTimeout>|undefined;
/** @returns Whether native window movement must wait for the current dock morph. */
export const genieTransitionActive=():boolean=>active;
/**
 * Registers trusted snapshot IPC without persisting screen contents.
 * @param getWindow - Returns the main island window.
 * @param getDock - Returns the active dock edge and position.
 * @returns No value.
 */
export function registerFusionGenie(getWindow:()=>BrowserWindow|null,getDock:()=>{edge:'top'|'bottom'|'left'|'right';position:number}):void {
 let cover:BrowserWindow|undefined;
 const removeCover=()=>{if(cover&&!cover.isDestroyed())cover.destroy();cover=undefined;};
 const finish=()=>{clearTimeout(timer);active=false;const win=getWindow();if(win&&!win.isDestroyed())win.setOpacity(1);removeCover();};
 // Keep a separate, non-interactive capsule on screen while the native window resizes.
 const showCover=async(image:string,bounds:Electron.Rectangle):Promise<void>=>{
  removeCover();const version=revision;
  const overlay=new BrowserWindow({...bounds,show:false,frame:false,transparent:true,hasShadow:false,focusable:false,skipTaskbar:true,resizable:false,alwaysOnTop:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  cover=overlay;overlay.setIgnoreMouseEvents(true);overlay.setAlwaysOnTop(true,'screen-saver');
  try{
   await overlay.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}img{display:block;width:100%;height:100%}</style></head><body><img src="'+image+'"></body></html>'));
   await overlay.webContents.capturePage();
   if(!active||revision!==version||overlay.isDestroyed())throw Error('stale-transition');
   overlay.showInactive();
  }catch(error){if(!overlay.isDestroyed())overlay.destroy();if(cover===overlay)cover=undefined;throw error;}
 };
 const cancel=()=>{if(!active)return;const old=revision;revision++;finish();const win=getWindow();if(win&&!win.isDestroyed())win.webContents.send('fusion:genie:cancelled',old);};
 ipcMain.handle('fusion:genie',async(event,command:string,value:{direction?:string;revision?:number;image?:string}):Promise<GenieSnapshot|null>=>{
  const win=getWindow();if(!win||win.isDestroyed()||event.sender!==win.webContents||event.senderFrame!==event.sender.mainFrame)throw Error('untrusted-view');
  if(command==='prepare'){
   const edge=getDock().edge,bounds=win.getContentBounds(),size=(edge==='top'||edge==='bottom')?{width:260,height:42}:{width:48,height:260};
   if(!active&&Math.abs(bounds.width-size.width)<=1&&Math.abs(bounds.height-size.height)<=1){const version=revision,image=await win.webContents.capturePage();if(!active&&version===revision&&!image.isEmpty())compactImage={edge,image:image.resize({...size,quality:'good'}).toDataURL()};}
   return null;
  }
  if(command==='begin'){
   if(!value||!['expand','collapse'].includes(value.direction||''))throw Error('invalid-transition');
   if(active)throw Error('transition-active');
   active=true;revision++;clearTimeout(timer);timer=setTimeout(cancel,5000);
   if(value.direction==='expand'){
    // Refresh the actual capsule before resizing; an idle cache can contain an old theme or status.
    const version=revision,edge=getDock().edge,bounds=win.getContentBounds(),size=(edge==='top'||edge==='bottom')?{width:260,height:42}:{width:48,height:260};
    if(Math.abs(bounds.width-size.width)<=1&&Math.abs(bounds.height-size.height)<=1){
     let image:Electron.NativeImage;
     try{image=await win.webContents.capturePage();}catch(error){cancel();throw error;}
     if(!active||revision!==version||win.isDestroyed())throw Error('stale-transition');
     if(!image.isEmpty())compactImage={edge,image:image.resize({...size,quality:'good'}).toDataURL()};
    }
    try{if(compactImage?.edge===edge)await showCover(compactImage.image,bounds);}catch(error){cancel();throw error;}
    win.setOpacity(0);
   }
  }
  else if(!active||value?.revision!==revision)throw Error('stale-transition');
  if(command==='handoff'){
   if(typeof value.image!=='string'||value.image.length>8_000_000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.image))throw Error('invalid-transition-image');
   const bounds=win.getContentBounds(),dock=getDock(),area=screen.getDisplayMatching(bounds).workArea,size=(dock.edge==='top'||dock.edge==='bottom')?{width:260,height:42}:{width:48,height:260};
   await showCover(value.image,dockRect(area,size,dock.edge,dock.position,false));win.setOpacity(0);return null;
  }
  if(command==='finish'||command==='show'){
   const version=revision;win.setOpacity(1);
   // capturePage waits for a compositor frame before the cover is removed.
   try{await win.webContents.capturePage();}finally{if(active&&version===revision){if(command==='finish')finish();else removeCover();}}
   return null;
  }
  if(command!=='begin'&&command!=='capture')throw Error('invalid-transition');
  const version=revision,bounds=win.getContentBounds(),dock=getDock(),area=screen.getDisplayMatching(bounds).workArea,size=(dock.edge==='top'||dock.edge==='bottom')?{width:260,height:42}:{width:48,height:260},compact=dockRect(area,size,dock.edge,dock.position,false);
  const result:GenieSnapshot={revision:version,edge:dock.edge,width:bounds.width,height:bounds.height,compact:{...compact,x:compact.x-bounds.x,y:compact.y-bounds.y},frames:[],compactImage:compactImage?.edge===dock.edge?compactImage.image:undefined};
  if(command==='capture'){
   const [image,guests]=await Promise.all([win.webContents.capturePage(),captureFusionGuestViews(win)]);if(image.isEmpty())throw Error('capture-unavailable');result.frames.push({image:image.resize({width:bounds.width,height:bounds.height,quality:'good'}).toDataURL(),rect:{x:0,y:0,width:bounds.width,height:bounds.height}});result.frames.push(...guests);const current=win.getContentBounds();if(!active||version!==revision||current.width!==bounds.width||current.height!==bounds.height)throw Error('stale-transition');
  }return result;
 });
 getWindow()?.on('closed',cancel);screen.on('display-metrics-changed',cancel);screen.on('display-removed',cancel);
}
