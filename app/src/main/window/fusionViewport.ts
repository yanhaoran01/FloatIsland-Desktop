/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionViewport.ts @description One persisted expanded viewport and restricted pointer resize sessions. @author 鸡哥 */
import {genieTransitionActive} from './fusionGenie';
import { app, ipcMain, screen, type BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { broadcastFusion } from '../system/fusionWindows';
import type { ViewportState, ResizeEdge } from '../../preload/types/fusionWorkspace';

const DEFAULT = { width:760, height:560 };
type ViewportWindow=Pick<BrowserWindow,'isDestroyed'|'getBounds'>&{webContents:object;on(event:'blur'|'closed',listener:()=>void):unknown};
let preferred = { ...DEFAULT }, loaded = false, revision = 0;
let applySharedSize:(()=>void)|null=null;
let gesture: { token:string; edge:ResizeEdge; bounds:Electron.Rectangle; point:Electron.Point; preferred:typeof preferred } | null = null;
const file = ():string => join(app.getPath('userData'),'eIsland_store','fusion-viewport.json');
/** Restores only a valid versioned size; screen clamping never modifies the preference. */
export function workspaceViewportSize():typeof preferred {
  if(!loaded){loaded=true;try{const saved=JSON.parse(readFileSync(file(),'utf8'));
    if(saved.version===1&&Number.isFinite(saved.width)&&Number.isFinite(saved.height)&&saved.width>=560&&saved.height>=420&&saved.width<=10000&&saved.height<=10000)preferred={width:Math.round(saved.width),height:Math.round(saved.height)};
  }catch{/* New profiles use the default. */}}
  return {...preferred};
}
/** Reports the pointer owner to docking, measurement and auto-hide. */
export function viewportAdjusting():boolean { return gesture!==null; }
/** Commits a real native workspace resize through the same preference owner. */
export function saveWorkspaceViewportSize(size:{width:number;height:number}):void {
  if(gesture||!Number.isFinite(size.width)||!Number.isFinite(size.height))return;
  const next={width:Math.max(560,Math.min(10000,Math.round(size.width))),height:Math.max(420,Math.min(10000,Math.round(size.height)))};
  if(preferred.width===next.width&&preferred.height===next.height)return;
  preferred=next;loaded=true;revision++;mkdirSync(join(app.getPath('userData'),'eIsland_store'),{recursive:true});writeFileSync(file()+'.tmp',JSON.stringify({version:1,...preferred}));renameSync(file()+'.tmp',file());applySharedSize?.();
}
/** Installs controls exclusively for the local main window. */
export function registerFusionViewport(options:{getWindow:()=>ViewportWindow|null;dock:()=>{edge:'top'|'bottom'|'left'|'right';expanded:boolean;dragging:boolean};apply:(rect:Electron.Rectangle)=>void;commit?:()=>void}):void {
  workspaceViewportSize();
  const snapshot=():ViewportState=>({preferred:{...preferred},actual:options.getWindow()?.getBounds()??{...preferred},revision,adjusting:!!gesture,token:gesture?.token??null});
  const publish=():ViewportState=>{const value=snapshot();broadcastFusion('fusion:viewport:changed',value);return value;};
  applySharedSize=()=>{const window=options.getWindow();if(window&&!window.isDestroyed()&&options.dock().expanded)options.apply({...window.getBounds(),...preferred});publish();};
  const persist=():void=>{mkdirSync(join(app.getPath('userData'),'eIsland_store'),{recursive:true});writeFileSync(file()+'.tmp',JSON.stringify({version:1,...preferred}));renameSync(file()+'.tmp',file());};
  const end=(cancel:boolean):ViewportState=>{
    if(gesture){const current=gesture;gesture=null;if(cancel){preferred=current.preferred;options.apply(current.bounds);}else{const bounds=options.getWindow()?.getBounds();if(bounds)preferred={width:Math.max(560,bounds.width),height:Math.max(420,bounds.height)};persist();options.commit?.();}revision++;}
    return publish();
  };
  ipcMain.handle('fusion:viewport:get',event=>{if(event.sender!==options.getWindow()?.webContents)throw Error('untrusted-view');return snapshot();});
  ipcMain.handle('fusion:viewport:control',(event,command:string,value?:string)=>{
    const win=options.getWindow();if(!win||win.isDestroyed()||event.sender!==win.webContents)throw Error('untrusted-view');
    const dock=options.dock();
    if(command==='reset'){if(gesture)end(true);preferred={...DEFAULT};persist();revision++;if(dock.expanded)options.apply({...win.getBounds(),...preferred});return publish();}
    if(command==='begin'){
      if(!dock.expanded||dock.dragging||gesture||genieTransitionActive()||!['n','s','e','w','ne','nw','se','sw'].includes(value??''))throw Error('resize-unavailable');
      const edge=value as ResizeEdge;
      if(edge.includes(dock.edge==='left'?'w':dock.edge==='right'?'e':dock.edge==='bottom'?'s':'n'))throw Error('resize-attached-edge');
      gesture={token:randomUUID(),edge,bounds:win.getBounds(),point:screen.getCursorScreenPoint(),preferred:{...preferred}};revision++;return publish();
    }
    if(!gesture||value!==gesture.token)throw Error('stale-resize-session');
    if(command==='end'||command==='cancel')return end(command==='cancel');
    if(command!=='move')throw Error('invalid-resize-command');
    const {bounds,point,edge}=gesture,cursor=screen.getCursorScreenPoint(),area=screen.getDisplayMatching(bounds).workArea;
    const minWidth=Math.min(560,Math.max(1,area.width-24)),minHeight=Math.min(420,Math.max(1,area.height-24));
    const left=dock.edge==='left'?area.x:area.x+12,right=dock.edge==='right'?area.x+area.width:area.x+area.width-12,top=dock.edge==='top'?area.y:area.y+12,bottom=dock.edge==='bottom'?area.y+area.height:area.y+area.height-12;
    let x=bounds.x,y=bounds.y,width=bounds.width,height=bounds.height;
    if(edge.includes('e'))width=Math.max(minWidth,Math.min(right-x,bounds.width+cursor.x-point.x));
    if(edge.includes('w')){x=Math.max(left,Math.min(bounds.x+bounds.width-minWidth,bounds.x+cursor.x-point.x));width=bounds.x+bounds.width-x;}
    if(edge.includes('s'))height=Math.max(minHeight,Math.min(bottom-y,bounds.height+cursor.y-point.y));
    if(edge.includes('n')){y=Math.max(top,Math.min(bounds.y+bounds.height-minHeight,bounds.y+cursor.y-point.y));height=bounds.y+bounds.height-y;}
    options.apply({x:Math.round(x),y:Math.round(y),width:Math.round(width),height:Math.round(height)});return publish();
  });
  options.getWindow()?.on('blur',()=>{if(gesture)end(false);});
  options.getWindow()?.on('closed',()=>{gesture=null;});
  screen.on('display-metrics-changed',()=>{if(gesture)end(true);});
}
