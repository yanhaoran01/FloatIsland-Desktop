/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionDock.ts @description 主进程管理贴边、自动隐藏、快捷键与位置恢复。 @author 鸡哥 */
import {registerFusionGenie,genieTransitionActive} from './fusionGenie';
import { app, BrowserWindow, globalShortcut, ipcMain, powerMonitor, screen } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'fs';
import { join } from 'path';
import { broadcastFusion, isFusionView } from '../system/fusionWindows';
import { hasFusionMedia } from '../system/fusionBrowserService';
import { snapNativeDockEdge } from './nativeDockEdge';
import { dockRect, type DockEdge, type DockRect } from './fusionDockGeometry';
import { registerFusionViewport, viewportAdjusting } from './fusionViewport';
export interface FusionDockConfig { edge: DockEdge; position: number; autoHide: boolean; delayMs: number; shortcut: string; displayId: string; }
let getWindow: () => BrowserWindow | null = () => null;
let config: FusionDockConfig = {edge:'top',position:.5,autoHide:true,delayMs:3000,shortcut:'Control+Alt+Space',displayId:'primary'};
let strip = false, expanded = false, lastSize = {width:260,height:42}, lastOutside = Date.now();
let ready = false, shortcutError = '', dragging: {x:number;y:number;bounds:DockRect;moved:boolean} | null = null;
let preview: DockEdge | null = null;
let protectedActivity = false;
let recalledUntil = 0;
let positions: Record<DockEdge, number> = {top:.5,left:.5,right:.5};
const targetDisplay = () => screen.getAllDisplays().find(d=>String(d.id) === config.displayId) || screen.getPrimaryDisplay();
const file = () => join(app.getPath('userData'),'eIsland_store','fusion-dock.json');
const snapshot = () => ({config,strip,preview,shortcutError});
const publish = () => broadcastFusion('fusion:dock:changed',snapshot());
const persist = () => {mkdirSync(join(app.getPath('userData'),'eIsland_store'),{recursive:true});writeFileSync(file()+'.tmp',JSON.stringify({...config, positions}));renameSync(file()+'.tmp',file());};
/** Reports whether the island docking owner is registered. */
export function fusionDockReady(): boolean { return ready; }
/** @returns Whether an explicit workspace or active transition must stay visible. */
export function fusionDockKeepsVisible(): boolean {
  if(!ready)return false;
  if(expanded||protectedActivity||strip||!config.autoHide||Date.now()<recalledUntil||genieTransitionActive())return true;
  const win=getWindow();if(!win||win.isDestroyed())return false;
  const point=screen.getCursorScreenPoint(),bounds=win.getBounds();
  return point.x>=bounds.x&&point.x<bounds.x+bounds.width&&point.y>=bounds.y&&point.y<bounds.y+bounds.height;
}
/** Applies the same anchor to every upstream resize. */
export function fusionDockBounds(rect: DockRect): DockRect {
  if (!ready || dragging) return rect;
  if (!strip) lastSize={width:rect.width,height:rect.height};
  const compact = lastSize.width === 260 && lastSize.height === 42;
  const retained = compact && config.edge !== 'top' ? {width:48,height:260} : lastSize;
  const size = strip ? config.edge === 'top' ? {width:64,height:10} : {width:10,height:64} : retained;
  return dockRect(targetDisplay().workArea,size,config.edge,config.position,strip);
}
export function snapFusionDock(win:BrowserWindow,bounds:DockRect):void { if(ready)snapNativeDockEdge(win,config.edge,bounds,targetDisplay().scaleFactor); }
const place = () => { const win=getWindow(); if(!win || win.isDestroyed())return;const bounds=fusionDockBounds({...win.getBounds(),...lastSize});const current=win.getBounds();if(Object.keys(bounds).some(key=>Math.abs(bounds[key as keyof DockRect]-current[key as keyof DockRect])>1))win.setBounds(bounds);snapFusionDock(win,bounds);win.setShape([{x:0,y:0,width:bounds.width,height:bounds.height}]);win.setIgnoreMouseEvents(false);win.webContents.invalidate(); };
/** Explicit user recall also restores an accessible capsule from the tiny handle. */
export function revealFusionIsland(): void { strip=false;lastOutside=Date.now();recalledUntil=lastOutside+config.delayMs+500;place();publish();getWindow()?.show(); }
/** Installs restricted IPC and one shared pointer timer for the island. */
export function registerFusionDock(getIsland:()=>BrowserWindow|null): void {
  getWindow=getIsland;
  if(existsSync(file())) {try {const saved=JSON.parse(readFileSync(file(),'utf8'));
    if(saved.positions && typeof saved.positions==='object')for(const edge of ['top','left','right'] as const){const value=saved.positions[edge];if(Number.isFinite(value)&&value>=0&&value<=1)positions[edge]=value;}
    const {positions:_positions,...settings}=saved;config={...config,...settings};positions[config.edge]=config.position;}catch{copyFileSync(file(),file()+'.invalid-'+Date.now());}}
  else {
    const win=getWindow();if(win){const display=screen.getDisplayMatching(win.getBounds());config.displayId=String(display.id);config.position=Math.max(0,Math.min(1,(win.getBounds().x+win.getBounds().width/2-display.workArea.x)/display.workArea.width));}
    const legacy=join(app.getPath('userData'),'eIsland_store','island-position-offset.json');if(existsSync(legacy))copyFileSync(legacy,legacy+'.fusion-backup-'+Date.now());persist();
  }
  const initial=getWindow()?.getBounds();lastSize=initial&&initial.width>=260&&initial.height>=42?{width:initial.width,height:initial.height}:{width:260,height:42};
  ready=true;recalledUntil=Date.now()+config.delayMs+500;registerFusionGenie(getWindow,()=>config);
  const mediaRecall=():void=>{if(hasFusionMedia() && strip){strip=false;lastOutside=Date.now();place();publish();}};
  (app as unknown as NodeJS.EventEmitter).on('fusion-media-active',mediaRecall);
  const recall=()=>{revealFusionIsland();getWindow()?.webContents.send('fusion:dock:reveal');};
  if(config.shortcut && !globalShortcut.register(config.shortcut,recall))shortcutError='shortcut-conflict';
  const trusted=(event:Electron.IpcMainInvokeEvent)=>{if(!isFusionView(event.sender))throw Error('untrusted-view');};
  ipcMain.handle('fusion:dock:get',event=>{trusted(event);return snapshot();});
  ipcMain.handle('fusion:dock:reveal-compact',event=>{trusted(event);revealFusionIsland();return snapshot();});
  ipcMain.handle('fusion:dock:save',(event,patch:Partial<FusionDockConfig>)=>{
    if(viewportAdjusting())throw Error('resize-in-progress');
    trusted(event);const next={...config,...patch};
    if(patch?.edge && patch.edge!==config.edge && patch.position===undefined){positions[config.edge]=config.position;next.position=positions[patch.edge];}
    if(!patch || Object.keys(patch).some(k=>!Object.hasOwn(config,k)) || !['top','left','right'].includes(next.edge) || !Number.isFinite(next.position) || next.position<0 || next.position>1 || typeof next.autoHide!=='boolean' || !Number.isFinite(next.delayMs) || next.delayMs<1000 || next.delayMs>30000 || typeof next.shortcut!=='string' || next.shortcut.length>100 || typeof next.displayId!=='string')throw Error('invalid-dock-settings');
    if(next.shortcut!==config.shortcut || Object.hasOwn(patch,'shortcut') && shortcutError){if(next.shortcut && !globalShortcut.register(next.shortcut,recall))throw Error('shortcut-conflict');if(config.shortcut&&next.shortcut!==config.shortcut&&!shortcutError)globalShortcut.unregister(config.shortcut);shortcutError='';}
    config=next;positions[config.edge]=config.position;strip=false;lastOutside=Date.now();persist();place();publish();return snapshot();
  });
  ipcMain.handle('fusion:dock:reset',event=>{trusted(event);config={...config,edge:'top',position:.5,displayId:'primary'};persist();revealFusionIsland();return snapshot();});
  ipcMain.handle('fusion:dock:activity',(event,isExpanded:boolean,keepVisible=false)=>{trusted(event);if(typeof isExpanded!=='boolean'||typeof keepVisible!=='boolean')throw Error('invalid-dock-activity');if(event.sender!==getWindow()?.webContents)return;expanded=isExpanded;protectedActivity=keepVisible;if(expanded||protectedActivity)strip=false;lastOutside=Date.now();place();publish();});
  ipcMain.handle('fusion:dock:drag',(event,action:string)=>{
    trusted(event);const win=getWindow();if(!win || event.sender!==win.webContents)return;
    const point=screen.getCursorScreenPoint();
    if(action==='start'){if(viewportAdjusting()||genieTransitionActive())return;dragging={...point,bounds:win.getBounds(),moved:false};return;}
    if(!dragging)return;
    if(action==='move'){
      if(Math.hypot(point.x-dragging.x,point.y-dragging.y)<6 && !dragging.moved)return;
      dragging.moved=true;const area=screen.getDisplayNearestPoint(point).workArea;
      const x=Math.max(area.x+12,Math.min(area.x+area.width-dragging.bounds.width-12,dragging.bounds.x+point.x-dragging.x));
      const y=Math.max(area.y+12,Math.min(area.y+area.height-dragging.bounds.height-12,dragging.bounds.y+point.y-dragging.y));win.setPosition(config.edge==='left'?area.x:config.edge==='right'?area.x+area.width-dragging.bounds.width:Math.round(x),config.edge==='top'?area.y:Math.round(y));
      snapFusionDock(win,{...win.getBounds(),width:dragging.bounds.width,height:dragging.bounds.height});
      const distances=[['top',point.y-area.y],['left',point.x-area.x],['right',area.x+area.width-point.x]] as [DockEdge,number][];const nearest=distances.sort((a,b)=>a[1]-b[1])[0];preview=nearest[1]<80?nearest[0]:null;publish();return;
    }
    const moved=dragging.moved;dragging=null;
    if(moved){const display=screen.getDisplayNearestPoint(point),area=display.workArea;config.displayId=String(display.id);config.edge=preview||config.edge;config.position=Math.max(0,Math.min(1,config.edge==='top'?(point.x-area.x)/area.width:(point.y-area.y)/area.height));positions[config.edge]=config.position;persist();}
    preview=null;lastOutside=Date.now();place();publish();return moved;
  });
  const timer=setInterval(()=>{const win=getWindow();if(!win||win.isDestroyed()||!win.isVisible()||dragging||viewportAdjusting()||genieTransitionActive())return;
    if(expanded || protectedActivity || hasFusionMedia() || !config.autoHide){lastOutside=Date.now();return;}
    const point=screen.getCursorScreenPoint(),bounds=strip ? dockRect(targetDisplay().workArea,config.edge==='top'?{width:64,height:10}:{width:10,height:64},config.edge,config.position,true) : win.getBounds();const inside=point.x>=bounds.x&&point.x<bounds.x+bounds.width&&point.y>=bounds.y&&point.y<bounds.y+bounds.height;
    if(inside){lastOutside=Date.now();}
    else {if(!strip&&Date.now()-lastOutside>=config.delayMs){strip=true;place();publish();}}
  },80);
  const resync=()=>{if(!screen.getAllDisplays().some(d=>String(d.id)===config.displayId))config.displayId='primary';place();publish();};
  screen.on('display-removed',resync);screen.on('display-metrics-changed',resync);powerMonitor.on('resume',resync);
  app.once('will-quit',()=>{(app as unknown as NodeJS.EventEmitter).removeListener('fusion-media-active',mediaRecall);clearInterval(timer);if(config.shortcut&&!shortcutError)globalShortcut.unregister(config.shortcut);screen.removeListener('display-removed',resync);screen.removeListener('display-metrics-changed',resync);powerMonitor.removeListener('resume',resync);});
  getWindow()?.on('hide',()=>getWindow()?.webContents.send('fusion:voice:hidden','window-hidden'));
  registerFusionViewport({getWindow,dock:()=>({edge:config.edge,expanded,dragging:!!dragging}),commit:persist,apply:rect=>{
    const area=targetDisplay().workArea;lastSize={width:rect.width,height:rect.height};
    const range=config.edge==='top'?area.width-24-rect.width:area.height-24-rect.height;
    config.position=range>0?Math.max(0,Math.min(1,(config.edge==='top'?rect.x-area.x-12:rect.y-area.y-12)/range)):.5;
    positions[config.edge]=config.position;place();
  }});
  place();
}
