/* FloatIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file nativeDockEdge.ts @description Snap Windows dock bounds to physical work-area edges after DIP rounding. @author 鸡哥 */
import type {BrowserWindow} from 'electron';
import * as koffi from 'koffi';
import type {DockEdge,DockRect} from './fusionDockGeometry';
interface PhysicalRect {left:number;top:number;right:number;bottom:number;}
interface MonitorInfo {cbSize:number;rcMonitor:PhysicalRect;rcWork:PhysicalRect;dwFlags:number;}
let native:ReturnType<typeof createNative> | undefined;
/** Reads only the selected native window, without synchronously enumerating unrelated applications. */
export function selectedNativeWindowBounds(handle:string):DockRect|null {
 if(process.platform!=='win32'||!/^\d+$/.test(handle))return null;
 native??=createNative();const rect:PhysicalRect={left:0,top:0,right:0,bottom:0};
 if(!native.getWindowRect(BigInt(handle),rect))return null;
 return {x:rect.left,y:rect.top,width:rect.right-rect.left,height:rect.bottom-rect.top};
}
/** Returns the physical monitor rectangle at an explicitly selected screen point. */
export function nativeMonitorBounds(point:{x:number;y:number}):DockRect|null {
 if(process.platform!=='win32'||![point.x,point.y].every(Number.isFinite))return null;
 native??=createNative();const zero=():PhysicalRect=>({left:0,top:0,right:0,bottom:0});
 const info:MonitorInfo={cbSize:40,rcMonitor:zero(),rcWork:zero(),dwFlags:0};
 if(!native.getMonitorInfo(native.monitorFromPoint(point,2),info))return null;
 const rect=info.rcMonitor;return {x:rect.left,y:rect.top,width:rect.right-rect.left,height:rect.bottom-rect.top};
}
function createNative(){
 const rect=koffi.struct({left:'int32_t',top:'int32_t',right:'int32_t',bottom:'int32_t'});
 const monitor=koffi.struct({cbSize:'uint32_t',rcMonitor:rect,rcWork:rect,dwFlags:'uint32_t'});
 const lib=koffi.load('user32.dll');
 const point=koffi.struct({x:'int32_t',y:'int32_t'});
 const monitorFromPoint:(point:{x:number;y:number},flags:number)=>bigint=lib.func('__stdcall','MonitorFromPoint','uintptr_t',[point,'uint32_t']);
 const monitorFromWindow:(handle:bigint,flags:number)=>bigint=lib.func('__stdcall','MonitorFromWindow','uintptr_t',['uintptr_t','uint32_t']);
 const getMonitorInfo:(handle:bigint,info:MonitorInfo)=>boolean=lib.func('__stdcall','GetMonitorInfoW','bool',['uintptr_t',koffi.inout(koffi.pointer(monitor))]);
 const getWindowRect:(handle:bigint,rect:PhysicalRect)=>boolean=lib.func('__stdcall','GetWindowRect','bool',['uintptr_t',koffi.out(koffi.pointer(rect))]);
 const setWindowPos:(handle:bigint,after:bigint,x:number,y:number,width:number,height:number,flags:number)=>boolean=lib.func('__stdcall','SetWindowPos','bool',['uintptr_t','uintptr_t','int','int','int','int','uint32_t']);
 return {monitorFromWindow,monitorFromPoint,getMonitorInfo,getWindowRect,setWindowPos};
}
/** Corrects Windows fractional-scale rounding without animating or altering content proportions. */
export function snapNativeDockEdge(win:BrowserWindow,edge:DockEdge,desired:DockRect,scale:number):void {
 if(process.platform!=='win32'||typeof win.getNativeWindowHandle!=='function')return;
 native??=createNative();
 const buffer=win.getNativeWindowHandle(),handle=buffer.length===8?buffer.readBigUInt64LE():BigInt(buffer.readUInt32LE());
 const zero=():PhysicalRect=>({left:0,top:0,right:0,bottom:0});
 const info:MonitorInfo={cbSize:40,rcMonitor:zero(),rcWork:zero(),dwFlags:0},current=zero();
 if(!native.getMonitorInfo(native.monitorFromWindow(handle,2),info)||!native.getWindowRect(handle,current))return;
 const work=info.rcWork,width=Math.round(desired.width*scale),height=Math.round(desired.height*scale),margin=Math.round(12*scale);
 const x=edge==='left'?work.left:edge==='right'?work.right-width:Math.max(work.left+margin,Math.min(work.right-width-margin,current.left));
 const y=edge==='top'?work.top:Math.max(work.top+margin,Math.min(work.bottom-height-margin,current.top));
 if(current.left!==x||current.top!==y||current.right-current.left!==width||current.bottom-current.top!==height){
  if(!native.setWindowPos(handle,0n,x,y,width,height,0x14))throw Error('native-dock-position-failed');
 }
}
