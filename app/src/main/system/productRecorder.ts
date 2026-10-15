/* FusionIsland - GPL-3.0. @file productRecorder.ts @description Main-owned demonstration capture and offline export. @author 鸡哥 */
import {app,BrowserWindow,desktopCapturer,ipcMain,screen,type WebContents} from 'electron';
import {openSync,writeSync,closeSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {RecordOptions,RecordState} from '../../preload/types/fusionProduct';
import {artifactOutput,grantArtifact,requireArtifact} from './productArtifacts';
import {isFusionView,broadcastFusion} from './fusionWindows';
import {createProductTask,publishProductTask,runProductFfmpeg} from './productJobs';
import {claimProductMicrophone,releaseProductMicrophone} from './productMicrophone';
import {selectProductRegion,validateCaptureRect} from './productCapture';
import {selectedNativeWindowBounds} from '../window/nativeDockEdge';
import type {UiohookKeyboardEvent,UiohookMouseEvent} from 'uiohook-napi';
interface Recording {owner:WebContents;host:BrowserWindow;options:RecordOptions;state:RecordState;path:string;fd:number;sequence:number;bytes:number;started:number;pausedAt:number;pausedTotal:number;timer:NodeJS.Timeout;stopHooks?:()=>void;ownerCleanup?:()=>void;source:Electron.DesktopCapturerSource;bounds:Electron.Rectangle;}
let current:Recording|null=null;
let starting=false;
let last:RecordState={id:'',state:'idle',elapsed:0};
const elapsed=(r:Recording):number=>Math.max(0,(r.pausedAt||performance.now())-r.started-r.pausedTotal)/1000;
const publish=(r:Recording):RecordState=>{r.state.elapsed=r.started?elapsed(r):0;last={...r.state,microphoneActive:r.options.microphone&&['starting','recording','paused','finishing'].includes(r.state.state)};broadcastFusion('fusion:product:record',last);return last;};
const clear=(r:Recording,remove:boolean):void=>{if(current===r)current=null;clearInterval(r.timer);if(r.ownerCleanup)r.owner.removeListener('destroyed',r.ownerCleanup);r.stopHooks?.();releaseProductMicrophone(r.state.id);try{closeSync(r.fd);}catch{}if(!r.host.isDestroyed())r.host.destroy();if(remove)rmSync(r.path,{force:true});};
/** Returns configuration only to the current isolated recording host. */
export function initProductRecorderAux(sender:WebContents):unknown|null {const r=current;if(!r||r.host.webContents!==sender)return null;return {id:r.state.id,options:r.options,bounds:r.bounds};}
/** Registers a recording host with a minimal bridge and one finite media source. */
export function registerProductRecorder():void {
 const handle=<A extends unknown[],R>(name:string,fn:(owner:WebContents,...args:A)=>R):void=>{ipcMain.handle('fusion:product:'+name,(event,...args:A)=>{if(!isFusionView(event.sender))throw Error('untrusted-view');return fn(event.sender,...args);});};
 handle('record-sources',async()=>{const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:0,height:0}});return sources.filter(s=>!BrowserWindow.getAllWindows().some(w=>String(w.getMediaSourceId())===s.id)).map(s=>({id:s.id,name:s.name}));});
 handle('record-state',()=>current?publish(current):last);
 handle('record-start',async(owner,options:RecordOptions)=>{
  if(current||starting)throw Error('recording-in-use');if(!options||!['screen','window','region'].includes(options.mode)||['systemAudio','microphone','camera','focus','keys'].some(key=>typeof options[key as keyof RecordOptions]!=='boolean'))throw Error('invalid-recording');
  const id=randomUUID();starting=true;
  let host:BrowserWindow|null=null,path='',fd=-1;
  try{
   if(options.microphone)claimProductMicrophone(id);
   if(options.mode==='region'&&!options.rect){const selection=await selectProductRegion(owner);options={...options,rect:selection.rect};}
   const region=options.rect?validateCaptureRect(options.rect):null,display=region?screen.getDisplayMatching(region):screen.getPrimaryDisplay();
   if(region&&(region.x<display.bounds.x||region.y<display.bounds.y||region.x+region.width>display.bounds.x+display.bounds.width||region.y+region.height>display.bounds.y+display.bounds.height))throw Error('record-region-must-fit-display');
   const sources=await desktopCapturer.getSources({types:options.mode==='window'?['window']:['screen'],thumbnailSize:{width:0,height:0}}),source=options.sourceId?sources.find(s=>s.id===options.sourceId):sources.find(s=>s.display_id===String(display.id));
   if(!source)throw Error('capture-source-unavailable');
   let bounds=display.bounds;if(options.mode==='window'){const selected=selectedNativeWindowBounds(source.id.split(':')[1]);if(options.focus&&!selected)throw Error('capture-source-unavailable');if(selected)bounds=screen.screenToDipRect(null,selected);}
   host=new BrowserWindow({show:false,width:320,height:180,webPreferences:{partition:'fusion-recording-'+id,preload:join(__dirname,'../preload/productAux.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
   path=artifactOutput('recording.webm');fd=openSync(path,'wx');
   const created=performance.now();
   const r:Recording={owner,host,options:{...options},state:{id,state:'starting',elapsed:0},path,fd,sequence:0,bytes:0,started:0,pausedAt:0,pausedTotal:0,timer:setInterval(()=>{if(current!==r)return;if(r.state.state==='starting'&&performance.now()-created>15000){r.state={...r.state,state:'error',error:'record-start-timeout'};publish(r);clear(r,true);return;}publish(r);},500),source,bounds};current=r;
   const contents=host.webContents,session=contents.session;
   session.setPermissionCheckHandler((view,permission)=>view===contents&&(permission==='media'));
   session.setPermissionRequestHandler((view,permission,callback)=>callback(view===contents&&(permission==='media')));
   session.setDisplayMediaRequestHandler((request,callback)=>{if(current!==r||request.frame!==contents.mainFrame){callback({});return;}callback({video:source,...(options.systemAudio?{audio:'loopback'}:{})});});
   contents.setWindowOpenHandler(()=>({action:'deny'}));contents.on('will-navigate',event=>event.preventDefault());contents.on('render-process-gone',()=>{if(current===r){r.state={...r.state,state:'error',error:'record-host-exited'};publish(r);clear(r,true);}});
   r.ownerCleanup=()=>{if(current===r)clear(r,true);};owner.once('destroyed',r.ownerCleanup);
   if(!app.isPackaged&&process.env.ELECTRON_RENDERER_URL)await host.loadURL(process.env.ELECTRON_RENDERER_URL+'/ProductRecordHost.html');else await host.loadFile(join(app.getAppPath(),'out/renderer/ProductRecordHost.html'));
   void host.webContents.executeJavaScript('window.startProductRecording()',true).catch(error=>{if(current===r){r.state={...r.state,state:'error',error:String(error)};publish(r);clear(r,true);}});
   return publish(r);
  }catch(error){releaseProductMicrophone(id);if(fd>=0)try{closeSync(fd);}catch{}if(path)rmSync(path,{force:true});if(host&&!host.isDestroyed())host.destroy();if(current?.state.id===id){clearInterval(current.timer);current=null;}throw error;}finally{starting=false;}
 });
 handle('record-control',(owner,command:'pause'|'resume'|'stop'|'cancel')=>{
  const r=current;if(!r||r.owner!==owner)throw Error('invalid-recording');if(command==='cancel'){r.state.state='idle';publish(r);clear(r,true);return last;}
  if(command==='pause'&&r.state.state==='recording'||command==='resume'&&r.state.state==='paused'||command==='stop'&&['recording','paused'].includes(r.state.state)){r.host.webContents.send('fusion:aux:event',{command});if(command==='stop')r.state.state='finishing';return publish(r);}throw Error('invalid-command');
 });
 ipcMain.handle('fusion:aux:chunk',(event,id:string,sequence:number,bytes:Uint8Array)=>{const r=current;if(!r||r.host.webContents!==event.sender||r.state.id!==id||sequence!==r.sequence||!(bytes instanceof Uint8Array)||bytes.length>16_777_216||r.bytes+bytes.length>2_147_483_648)throw Error('invalid-record-chunk');writeSync(r.fd,bytes);r.sequence++;r.bytes+=bytes.length;});
 ipcMain.handle('fusion:aux:status',async(event,id:string,state:string,error?:string)=>{
  const r=current;if(!r||r.host.webContents!==event.sender||r.state.id!==id)throw Error('untrusted-helper');
  if(state==='recording'){if(!r.started){r.started=performance.now();if(r.options.focus||r.options.keys)try{const {uIOhook,UiohookKey}=await import('uiohook-napi');
    const move=(e:UiohookMouseEvent):void=>{if(r.state.state!=='recording')return;const p=screen.screenToDipPoint({x:e.x,y:e.y});r.host.webContents.send('fusion:aux:event',{pointer:{x:(p.x-r.bounds.x)/r.bounds.width,y:(p.y-r.bounds.y)/r.bounds.height}});};
    const key=(e:UiohookKeyboardEvent):void=>{if(!r.options.keys||r.state.state!=='recording')return;const name=Object.entries(UiohookKey).find(([,code])=>code===e.keycode)?.[0];if(!name||!(/^F\d+$/.test(name)||['Escape','Tab','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End','Delete','Insert'].includes(name)||e.ctrlKey||e.altKey||e.metaKey))return;const value=[e.ctrlKey?'Ctrl':'',e.altKey?'Alt':'',e.metaKey?'Win':'',e.shiftKey?'Shift':'',name].filter(Boolean).join('+');r.host.webContents.send('fusion:aux:event',{key:value});};
    if(r.options.focus)uIOhook.on('mousemove',move);if(r.options.keys)uIOhook.on('keydown',key);uIOhook.start();r.stopHooks=()=>{uIOhook.removeListener('mousemove',move);uIOhook.removeListener('keydown',key);uIOhook.stop();};
   }catch(reason){r.state={...r.state,state:'error',error:String(reason)};publish(r);clear(r,true);return;}}
   if(r.pausedAt){r.pausedTotal+=performance.now()-r.pausedAt;r.pausedAt=0;}r.state.state='recording';return publish(r);
  }
  if(state==='paused'){r.pausedAt=performance.now();r.state.state='paused';return publish(r);}
  if(state==='done'){if(!r.bytes){r.state.state='error';r.state.error='empty-recording';publish(r);clear(r,true);return last;}r.state.artifact=grantArtifact(r.owner,r.path,true);r.state.state='done';const result=publish(r);clear(r,false);return result;}
  if(state==='error'){r.state={...r.state,state:'error',error:typeof error==='string'?error.slice(0,2000):'record-failed'};publish(r);clear(r,true);return last;}throw Error('invalid-command');
 });
 handle('record-export',(owner,id:string,format:'mp4'|'webm'|'gif',start:number,end:number)=>{
  if(!['mp4','webm','gif'].includes(format)||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<0||end>0&&end<=start)throw Error('invalid-trim');
  const file=requireArtifact(owner,id),output=artifactOutput('recording.'+format),task=createProductTask(owner,'record');
  void(async()=>{try{const args=['-ss',String(start),'-i',file.path];if(end>0)args.push('-t',String(end-start));
   if(format==='gif')args.push('-filter_complex','fps=15,scale=min(960\\,iw):-1,split[a][b];[a]palettegen[p];[b][p]paletteuse','-an');
   else{args.push('-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-r','30');if(format==='mp4')args.push('-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart');else args.push('-c:v','libvpx-vp9','-c:a','libopus');}
   await runProductFfmpeg([...args,output],task.controller.signal);publishProductTask(task,{state:'done',progress:1,result:[grantArtifact(owner,output,true)]});
  }catch(reason){rmSync(output,{force:true});publishProductTask(task,{state:task.controller.signal.aborted?'cancelled':'error',error:String(reason)});}})();return {...task.value};
 });
 app.once('will-quit',()=>{if(current)clear(current,true);});
}
