/* FloatIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file localCaptureOcr.ts @description Serialized, cancellable offline Chinese/English OCR using bundled models. @author 鸡哥 */
import {app,nativeImage} from 'electron';
import {createRequire} from 'node:module';
import {dirname,join,sep} from 'node:path';
import {createWorker,type Worker} from 'tesseract.js';
import type {CaptureOcrResult} from './captureOcrService';

let worker:Worker|null=null,initializing:Promise<Worker>|null=null,idle:ReturnType<typeof setTimeout>|null=null;
let queue:Promise<unknown>=Promise.resolve();
/** Releases the OCR worker when idle or when the app closes. */
export async function disposeLocalCaptureOcr():Promise<void>{
  if(idle){clearTimeout(idle);idle=null;}const current=worker;worker=null;
  if(current)await current.terminate().catch(()=>{});
}
async function getWorker():Promise<Worker>{
  if(idle){clearTimeout(idle);idle=null;}if(worker)return worker;
  if(!initializing){
    const requireFromApp=createRequire(join(app.getAppPath(),'package.json'));
    const physical=(path:string):string=>app.isPackaged?path.replace('app.asar'+sep,'app.asar.unpacked'+sep):path;
    const packageDir=dirname(physical(requireFromApp.resolve('tesseract.js/package.json')));
    const coreDir=dirname(physical(requireFromApp.resolve('tesseract.js-core/package.json')));
    const langPath=join(app.isPackaged?process.resourcesPath:join(app.getAppPath(),'resources'),'ocr');
    initializing=createWorker('eng+chi_sim',1,{langPath,corePath:coreDir,workerPath:join(packageDir,'src/worker-script/node/index.js'),gzip:false,cacheMethod:'none'})
      .then(value=>{worker=value;return value;}).finally(()=>{initializing=null;});
  }
  return initializing;
}
/** Recognizes without an account, an image upload, or model downloads. */
export async function recognizeLocalCapture(dataUrl:string,signal:AbortSignal):Promise<CaptureOcrResult>{
  if(typeof dataUrl!=='string'||!/^data:image\/(png|jpeg|bmp|gif|tiff|webp);base64,/i.test(dataUrl))return {success:false,code:'invalidData'};
  const bytes=Buffer.from(dataUrl.slice(dataUrl.indexOf(',')+1),'base64');
  if(bytes.length>10*1024*1024)return {success:false,code:'imageTooLarge'};
  const size=nativeImage.createFromBuffer(bytes).getSize();
  if(size.width<15||size.height<15||size.width>8192||size.height>8192||size.width*size.height>16_000_000)return {success:false,code:'invalidImageDimensions'};
  const task=queue.catch(()=>{}).then(async()=>{
    signal.throwIfAborted();const current=await getWorker();
    if(signal.aborted){await disposeLocalCaptureOcr();signal.throwIfAborted();}
    const abort=():void=>{if(worker===current)void disposeLocalCaptureOcr();};signal.addEventListener('abort',abort,{once:true});
    try{const result=await current.recognize(bytes);signal.throwIfAborted();return {success:true,text:result.data.text.trim()};}
    catch(reason){if(worker===current)await disposeLocalCaptureOcr();throw reason;}
    finally{signal.removeEventListener('abort',abort);if(worker===current){idle=setTimeout(()=>void disposeLocalCaptureOcr(),300000);idle.unref();}}
  });
  queue=task.catch(()=>{});
  try {
    signal.throwIfAborted();let rejectAbort:()=>void=()=>{};
    const aborted=new Promise<never>((_resolve,reject)=>{rejectAbort=()=>reject(signal.reason??Error('aborted'));signal.addEventListener('abort',rejectAbort,{once:true});});
    try{return await Promise.race([task,aborted]);}finally{signal.removeEventListener('abort',rejectAbort);}
  }catch(reason){return {success:false,code:signal.aborted?'ocrTimeout':'ocrFailed',message:signal.aborted?undefined:String(reason)};}
}
