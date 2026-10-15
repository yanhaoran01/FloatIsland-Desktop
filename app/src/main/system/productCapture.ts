/* FusionIsland - GPL-3.0. @file productCapture.ts @description Owned capture, pin and scroll sessions. @author 鸡哥 */
import {app,BrowserWindow,clipboard,desktopCapturer,dialog,ipcMain,nativeImage,screen,type WebContents} from 'electron';
import {join} from 'node:path';
import {writeFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {initProductRecorderAux} from './productRecorder';
import type {CaptureOptions,ProductArtifact} from '../../preload/types/fusionProduct';
import {createArtifact,readArtifact} from './productArtifacts';
import {createProductTask,publishProductTask,type ProductTask} from './productJobs';
import {isFusionView} from './fusionWindows';
import {pinZoom,pinOpacity} from '../../shared/esearchCore';
import {captureAllDisplaysPng} from '../window/screenshotHelper';
import {nativeMonitorBounds} from '../window/nativeDockEdge';
type Rect=NonNullable<CaptureOptions['rect']>;
interface CaptureService {getCaptureWindow:()=>BrowserWindow|null;startRegionScreenshot:()=>Promise<void>;closeCaptureWindow:()=>void;}
let service:CaptureService;
let pending:{owner:WebContents;resolve:(value:{artifact:ProductArtifact;rect:Rect})=>void;reject:(error:Error)=>void}|null=null;
const pins=new Map<WebContents,{window:BrowserWindow;owner:WebContents;artifact:ProductArtifact;size:{width:number;height:number};locked:boolean}>();
const scrolls=new Map<WebContents,{task:ProductTask;options:CaptureOptions;frames:Array<{width:number;height:number;pixels:Uint8Array}>;timer:NodeJS.Timeout;busy:boolean;last:string}>();
/** Validates a finite screen selection, including negative screen coordinates. */
export function validateCaptureRect(rect:Rect):Rect {
 if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<2||rect.height<2||rect.width>16384||rect.height>16384)throw Error('invalid-region');
 const displays=screen.getAllDisplays(),left=Math.min(...displays.map(d=>d.bounds.x)),top=Math.min(...displays.map(d=>d.bounds.y)),right=Math.max(...displays.map(d=>d.bounds.x+d.bounds.width)),bottom=Math.max(...displays.map(d=>d.bounds.y+d.bounds.height));
 if(rect.x<left||rect.y<top||rect.x+rect.width>right||rect.y+rect.height>bottom)throw Error('invalid-region');return rect;
}
/** Captures an actual selected region through the existing overlay. */
export async function selectProductRegion(owner:WebContents):Promise<{artifact:ProductArtifact;rect:Rect}> {
 if(pending||service.getCaptureWindow())throw Error('capture-in-use');
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('capture-timeout')),120000);const close=():void=>finish(Error('capture-cancelled'));
  const finish=(error?:Error,value?:{artifact:ProductArtifact;rect:Rect}):void=>{clearTimeout(timer);owner.removeListener('destroyed',close);pending=null;if(error){service.closeCaptureWindow();reject(error);}else if(value)resolve(value);};
  pending={owner,resolve:value=>finish(undefined,value),reject:error=>finish(error)};owner.once('destroyed',close);
  void service.startRegionScreenshot().then(()=>{const window=service.getCaptureWindow();if(!window){finish(Error('capture-failed'));return;}window.once('closed',()=>{if(pending?.owner===owner)finish(Error('capture-cancelled'));});}).catch(error=>finish(error));
 });
}
/** Receives only the existing native overlay's completed image. */
export function completeProductCapture(sender:WebContents,dataURL:string,rect?:Rect):boolean {
 if(!pending||service.getCaptureWindow()?.webContents!==sender)return false;
 const value=pending;try{if(typeof dataURL!=='string'||dataURL.length>90_000_000)throw Error('invalid-image');const image=nativeImage.createFromDataURL(dataURL);if(image.isEmpty()||!rect)throw Error('invalid-image');const region=validateCaptureRect(rect);value.resolve({artifact:createArtifact(value.owner,image.toPNG(),'screenshot.png'),rect:region});}catch(error){value.reject(error instanceof Error?error:Error(String(error)));}return true;
}
/** Captures a bounded screen, window or multi-display region with per-display scaling. */
export async function captureProductImage(options:CaptureOptions,pixelExact=false):Promise<Electron.NativeImage> {
 if(options.mode==='window'){
  if(process.platform==='win32'){
   // Zero thumbnails avoid the upstream WGC enumeration hang; capture only the selected handle.
   const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0}}),source=sources.find(x=>x.id===options.sourceId);
   if(!source||!/^window:\d+:/.test(source.id))throw Error('capture-source-unavailable');
   return new Promise((resolve,reject)=>{const worker=new Worker(join(__dirname,'windowCaptureWorker.js'),{workerData:{handle:source.id.split(':')[1]}});let settled=false;
    const finish=(error?:Error,image?:Electron.NativeImage):void=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();error?reject(error):image?resolve(image):reject(Error('capture-failed'));};
    const timer=setTimeout(()=>finish(Error('capture-timeout')),12000);
    worker.once('message',(value:{error?:string;width:number;height:number;pixels:Uint8Array})=>{if(value.error)finish(Error(value.error));else finish(undefined,nativeImage.createFromBitmap(Buffer.from(value.pixels),{width:value.width,height:value.height}));});worker.once('error',finish);worker.once('exit',()=>{if(!settled)finish(Error('capture-worker-exited'));});
   });
  }
  const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1920,height:1080}}),source=sources.find(x=>x.id===options.sourceId);if(!source||source.thumbnail.isEmpty())throw Error('capture-source-unavailable');return source.thumbnail;
 }
 const displays=screen.getAllDisplays(),rect=options.rect?validateCaptureRect(options.rect):screen.getPrimaryDisplay().bounds;
 const sf=Math.max(...displays.filter(d=>rect.x<d.bounds.x+d.bounds.width&&rect.x+rect.width>d.bounds.x&&rect.y<d.bounds.y+d.bounds.height&&rect.y+rect.height>d.bounds.y).map(d=>d.scaleFactor));
 const width=Math.round(rect.width*sf),height=Math.round(rect.height*sf);if(width*height>16_000_000)throw Error('capture-limit');
 // GDI preserves the displayed sRGB pixels on HDR Windows desktops; Chromium thumbnails
 // can return linearized/darkened colors. Reuse the native screenshot service first.
 const png=process.platform==='win32'?captureAllDisplaysPng():null;
 const candidate=png?nativeImage.createFromBuffer(png):null,native=candidate&&!candidate.isEmpty()?candidate:null;
 if(pixelExact && process.platform==='win32' && !native)throw Error('capture-source-unavailable');
 const origin=native?{x:Math.min(...displays.map(d=>screen.dipToScreenPoint({x:d.bounds.x,y:d.bounds.y}).x)),y:Math.min(...displays.map(d=>screen.dipToScreenPoint({x:d.bounds.x,y:d.bounds.y}).y))}:null;
 if(pixelExact && native && origin){
  const display=displays.find(d=>d.bounds.x===rect.x&&d.bounds.y===rect.y&&d.bounds.width===rect.width&&d.bounds.height===rect.height);
  if(!display)throw Error('invalid-region');
  const physical=nativeMonitorBounds(screen.dipToScreenPoint({x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)}));
  if(!physical)throw Error('capture-source-unavailable');
  return native.crop({x:physical.x-origin.x,y:physical.y-origin.y,width:physical.width,height:physical.height});
 }
 const sources=native&&!native.isEmpty()?[]:await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.max(...displays.map(d=>Math.round(d.bounds.width*d.scaleFactor))),height:Math.max(...displays.map(d=>Math.round(d.bounds.height*d.scaleFactor)))}}),pixels=Buffer.alloc(width*height*4);
 for(const display of displays){const bounds=display.bounds,x=Math.max(rect.x,bounds.x),y=Math.max(rect.y,bounds.y),right=Math.min(rect.x+rect.width,bounds.x+bounds.width),bottom=Math.min(rect.y+rect.height,bounds.y+bounds.height);if(right<=x||bottom<=y)continue;
  const source=sources.find(s=>s.display_id===String(display.id));const image=native&&!native.isEmpty()?native:source?.thumbnail;if(!image||image.isEmpty())throw Error('capture-source-unavailable');const size=image.getSize(),scaleX=native?display.scaleFactor:size.width/bounds.width,scaleY=native?display.scaleFactor:size.height/bounds.height;
  const start=native&&origin?screen.dipToScreenPoint({x,y}):null;
  const sx=start&&origin?start.x-origin.x:Math.round((x-bounds.x)*scaleX),sy=start&&origin?start.y-origin.y:Math.round((y-bounds.y)*scaleY);
  const tw=Math.round((right-x)*sf),th=Math.round((bottom-y)*sf),crop=image.crop({x:sx,y:sy,width:Math.max(1,Math.min(size.width-sx,Math.round((right-x)*scaleX))),height:Math.max(1,Math.min(size.height-sy,Math.round((bottom-y)*scaleY)))}).resize({width:tw,height:th}).toBitmap(),dx=Math.round((x-rect.x)*sf),dy=Math.round((y-rect.y)*sf);
  for(let row=0;row<th&&dy+row<height;row++)crop.copy(pixels,((dy+row)*width+dx)*4,row*tw*4,(row+1)*tw*4);
 }return nativeImage.createFromBitmap(pixels,{width,height});
}
/** Registers the capture service after the existing overlay IPC is installed. */
export function registerProductCapture(options:CaptureService):void {
 service=options;
 const handle=<A extends unknown[],R>(name:string,fn:(owner:WebContents,...args:A)=>R):void=>{ipcMain.handle('fusion:product:'+name,(event,...args:A)=>{if(!isFusionView(event.sender))throw Error('untrusted-view');return fn(event.sender,...args);});};
 handle('capture',async(owner,choice:CaptureOptions)=>{if(!choice||!['region','screen','window'].includes(choice.mode))throw Error('invalid-mode');if(choice.mode==='region'&&!choice.rect)return(await selectProductRegion(owner)).artifact;const image=await captureProductImage(choice);return createArtifact(owner,image.toPNG(),'screenshot.png');});
 handle('pin',async(owner,id:string)=>{const file=readArtifact(owner,id);if(file.artifact.kind!=='image')throw Error('unsupported-image');const image=nativeImage.createFromBuffer(Buffer.from(file.bytes));if(image.isEmpty())throw Error('unsupported-image');const size=image.getSize(),display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),zoom=Math.min(1,display.workArea.width*.65/size.width,display.workArea.height*.65/size.height);
  const window=new BrowserWindow({width:Math.max(80,Math.round(size.width*zoom)),height:Math.max(80,Math.round(size.height*zoom)),frame:false,transparent:true,alwaysOnTop:true,resizable:false,show:false,webPreferences:{preload:join(__dirname,'../preload/productAux.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const contents=window.webContents;
  pins.set(contents,{window,owner,artifact:file.artifact,size,locked:false});window.setContentProtection(true);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.once('closed',()=>pins.delete(contents));
  await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}img{width:100%;height:100%;object-fit:contain;-webkit-app-region:drag}body.locked img{-webkit-app-region:no-drag}</style><img draggable="false"><script>productAux.init().then(v=>{document.querySelector("img").src=v.image});document.addEventListener("wheel",e=>{e.preventDefault();productAux.command("zoom",e.deltaY>0?.9:1.1)},{passive:false});document.addEventListener("contextmenu",()=>productAux.command("menu"));document.addEventListener("keydown",e=>{if(e.key==="Escape")productAux.command("close")});productAux.on(v=>document.body.classList.toggle("locked",v.locked));</script>'));window.showInactive();
 });
 ipcMain.handle('fusion:aux:init',event=>{const record=initProductRecorderAux(event.sender);if(record)return record;const pin=pins.get(event.sender);if(!pin)throw Error('untrusted-helper');return {image:nativeImage.createFromBuffer(Buffer.from(readArtifact(pin.owner,pin.artifact.id).bytes)).toDataURL()};});
 ipcMain.handle('fusion:aux:command',async(event,command:string,value?:number)=>{const pin=pins.get(event.sender);if(!pin)throw Error('untrusted-helper');const {window}=pin;
  if(command==='close'){window.close();return;}
  if(command==='zoom'&&!pin.locked&&Number.isFinite(value)){const bounds=window.getBounds(),zoom=pinZoom(bounds.width/pin.size.width*Number(value)),area=screen.getDisplayMatching(bounds).workArea;window.setSize(Math.max(32,Math.min(area.width,Math.round(pin.size.width*zoom))),Math.max(32,Math.min(area.height,Math.round(pin.size.height*zoom))));return;}
  if(command==='menu'){const {Menu}=await import('electron');const zh=app.getLocale().startsWith('zh');
   Menu.buildFromTemplate([{label:zh?'复制':'Copy',click:()=>clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(readArtifact(pin.owner,pin.artifact.id).bytes)))},{label:zh?'保存':'Save',click:()=>{void dialog.showSaveDialog(window,{defaultPath:'screenshot.png'}).then(result=>{if(result.filePath)writeFileSync(result.filePath,readArtifact(pin.owner,pin.artifact.id).bytes);});}},{label:zh?'锁定位置':'Lock position',type:'checkbox',checked:pin.locked,click:()=>{pin.locked=!pin.locked;window.webContents.send('fusion:aux:event',{locked:pin.locked});}},{label:zh?'鼠标穿透':'Click through',click:()=>{window.setIgnoreMouseEvents(true,{forward:true});window.setFocusable(false);}},{label:zh?'透明度 50%':'Opacity 50%',click:()=>window.setOpacity(pinOpacity(50))},{label:zh?'透明度 100%':'Opacity 100%',click:()=>window.setOpacity(1)},{label:zh?'关闭':'Close',click:()=>window.close()}]).popup({window});
  }else throw Error('invalid-command');
 });
 handle('pins',(owner,command:'unlock'|'close')=>{for(const pin of pins.values())if(pin.owner===owner){if(command==='close')pin.window.close();else{pin.window.setIgnoreMouseEvents(false);pin.window.setFocusable(true);pin.locked=false;pin.window.webContents.send('fusion:aux:event',{locked:false});}}});
 handle('scroll',async(owner,command:'start'|'frame'|'finish'|'cancel',choice?:CaptureOptions)=>{
  if(command==='start'){if(scrolls.has(owner))throw Error('capture-in-use');const selected=choice?.rect?{rect:validateCaptureRect(choice.rect)}:await selectProductRegion(owner);const task=createProductTask(owner,'scroll'),state={task,options:{mode:'region' as const,rect:selected.rect},frames:[] as Array<{width:number;height:number;pixels:Uint8Array}>,timer:setInterval(()=>{void frame(owner);},1000),busy:false,last:''};scrolls.set(owner,state);owner.once('destroyed',()=>stop(owner));await frame(owner);return task.value;}
  const state=scrolls.get(owner);if(!state)throw Error('invalid-task');if(command==='frame'){await frame(owner);return state.task.value;}if(command==='cancel'){state.task.controller.abort();stop(owner);return publishProductTask(state.task,{state:'cancelled'});}
  if(command!=='finish')throw Error('invalid-command');clearInterval(state.timer);while(state.busy)await new Promise(resolve=>setTimeout(resolve,10));scrolls.delete(owner);
  try{const result=await new Promise<{width:number;height:number;pixels:Uint8Array}>((resolve,reject)=>{const worker=new Worker(join(__dirname,'scrollWorker.js'),{workerData:state.frames});const timer=setTimeout(()=>{void worker.terminate();reject(Error('job-timeout'));},30000);const cancel=():void=>{void worker.terminate();clearTimeout(timer);reject(Error('job-cancelled'));};state.task.controller.signal.addEventListener('abort',cancel,{once:true});worker.once('message',(value:{error?:string;width:number;height:number;pixels:Uint8Array})=>{clearTimeout(timer);state.task.controller.signal.removeEventListener('abort',cancel);void worker.terminate();value.error?reject(Error(value.error)):resolve(value);});worker.once('error',error=>{clearTimeout(timer);state.task.controller.signal.removeEventListener('abort',cancel);reject(error);});});
   state.task.controller.signal.throwIfAborted();const image=nativeImage.createFromBitmap(Buffer.from(result.pixels),{width:result.width,height:result.height});return publishProductTask(state.task,{state:'done',progress:1,result:[createArtifact(owner,image.toPNG(),'scroll.png')]});
  }catch(error){return publishProductTask(state.task,{state:state.task.controller.signal.aborted?'cancelled':'error',error:String(error)});}
 });
 const stop=(owner:WebContents):void=>{const state=scrolls.get(owner);if(state){clearInterval(state.timer);scrolls.delete(owner);}};
 const frame=async(owner:WebContents):Promise<void>=>{const state=scrolls.get(owner);if(!state||state.busy||state.task.controller.signal.aborted)return;state.busy=true;try{if(state.frames.length>=60)throw Error('capture-limit');const image=await captureProductImage(state.options),size=image.getSize(),pixels=image.toBitmap();const {createHash}=await import('node:crypto'),hash=createHash('sha256').update(pixels).digest('hex');if(hash!==state.last){state.frames.push({...size,pixels});state.last=hash;publishProductTask(state.task,{progress:Math.min(.9,state.frames.length/60)});}}catch(error){stop(owner);publishProductTask(state.task,{state:'error',error:String(error)});}finally{state.busy=false;}};
 app.once('will-quit',()=>{for(const owner of scrolls.keys())stop(owner);for(const pin of pins.values())if(!pin.window.isDestroyed())pin.window.destroy();});
}
