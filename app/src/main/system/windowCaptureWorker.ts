/* FloatIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file windowCaptureWorker.ts @description Capture only a selected Windows handle away from the UI thread. @author 鸡哥 */
import {parentPort,workerData} from 'node:worker_threads';
import * as koffi from 'koffi';
interface Rect {left:number;top:number;right:number;bottom:number;}
try{
 const handle=BigInt(String(workerData.handle)),user=koffi.load('user32.dll'),gdi=koffi.load('gdi32.dll');
 const rectType=koffi.struct({left:'int32_t',top:'int32_t',right:'int32_t',bottom:'int32_t'});
 const getRect:(h:bigint,r:Rect)=>boolean=user.func('__stdcall','GetWindowRect','bool',['uintptr_t',koffi.out(koffi.pointer(rectType))]);
 const rect:Rect={left:0,top:0,right:0,bottom:0};if(!getRect(handle,rect))throw Error('capture-source-unavailable');
 const width=rect.right-rect.left,height=rect.bottom-rect.top;if(width<1||height<1||width*height>16_000_000)throw Error('capture-limit');
 const getDC:(h:bigint)=>bigint=user.func('__stdcall','GetWindowDC','uintptr_t',['uintptr_t']);
 const release:(h:bigint,dc:bigint)=>number=user.func('__stdcall','ReleaseDC','int',['uintptr_t','uintptr_t']);
 const compatibleDC:(dc:bigint)=>bigint=gdi.func('__stdcall','CreateCompatibleDC','uintptr_t',['uintptr_t']);
 const bitmap:(dc:bigint,w:number,h:number)=>bigint=gdi.func('__stdcall','CreateCompatibleBitmap','uintptr_t',['uintptr_t','int','int']);
 const select:(dc:bigint,obj:bigint)=>bigint=gdi.func('__stdcall','SelectObject','uintptr_t',['uintptr_t','uintptr_t']);
 const print:(h:bigint,dc:bigint,flags:number)=>boolean=user.func('__stdcall','PrintWindow','bool',['uintptr_t','uintptr_t','uint32_t']);
 const read:(dc:bigint,b:bigint,start:number,lines:number,pixels:Buffer,header:Buffer,usage:number)=>number=gdi.func('__stdcall','GetDIBits','int',['uintptr_t','uintptr_t','uint32_t','uint32_t','void *','void *','uint32_t']);
 const deleteObject:(obj:bigint)=>boolean=gdi.func('__stdcall','DeleteObject','bool',['uintptr_t']);
 const deleteDC:(dc:bigint)=>boolean=gdi.func('__stdcall','DeleteDC','bool',['uintptr_t']);
 const dc=getDC(handle);if(!dc)throw Error('capture-source-unavailable');let memory=0n,image=0n,previous=0n;
 try{
  memory=compatibleDC(dc);image=bitmap(dc,width,height);if(!memory||!image)throw Error('capture-allocation-failed');previous=select(memory,image);
  if(!print(handle,memory,2))throw Error('capture-failed');select(memory,previous);previous=0n;
  const header=Buffer.alloc(40),pixels=Buffer.alloc(width*height*4);header.writeUInt32LE(40,0);header.writeInt32LE(width,4);header.writeInt32LE(-height,8);header.writeUInt16LE(1,12);header.writeUInt16LE(32,14);
  if(read(memory,image,0,height,pixels,header,0)!==height)throw Error('capture-read-failed');for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
  parentPort?.postMessage({width,height,pixels});
 }finally{if(previous)select(memory,previous);if(image)deleteObject(image);if(memory)deleteDC(memory);release(handle,dc);}
}catch(error){parentPort?.postMessage({error:error instanceof Error?error.message:String(error)});}
