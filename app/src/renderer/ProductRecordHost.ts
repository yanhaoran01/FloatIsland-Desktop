/* FusionIsland - GPL-3.0. @file ProductRecordHost.ts @description Resource-owning isolated recording canvas. @author 鸡哥 */
import type {RecordOptions} from '../preload/types/fusionProduct';
interface Bridge {init:()=>Promise<{id:string;options:RecordOptions;bounds:{x:number;y:number;width:number;height:number}}>;chunk:(id:string,sequence:number,bytes:Uint8Array)=>Promise<void>;status:(id:string,state:string,error?:string)=>Promise<void>;on:(callback:(value:{command?:string;pointer?:{x:number;y:number};key?:string})=>void)=>()=>void;}
declare global { interface Window { productAux:Bridge;startProductRecording:()=>Promise<void>; } }
const bridge=window.productAux;
window.startProductRecording=async()=>{
 const config=await bridge.init(),streams:MediaStream[]=[],videos:HTMLVideoElement[]=[],options=config.options;let recorder:MediaRecorder|undefined,context:AudioContext|undefined,loop=0,sequence=0,chain=Promise.resolve(),stopped=false,zoom=1,px=.5,py=.5,key='',keyUntil=0;
 const cleanup=():void=>{stopped=true;cancelAnimationFrame(loop);streams.forEach(s=>s.getTracks().forEach(track=>track.stop()));videos.forEach(video=>{video.srcObject=null;});if(context)void context.close();};
 const fail=(error:unknown):void=>{cleanup();void bridge.status(config.id,'error',error instanceof Error?error.message:String(error));};
 try{
  const screenStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:options.systemAudio});streams.push(screenStream);if(options.systemAudio&&!screenStream.getAudioTracks().length)throw Error('system-audio-unavailable');
  const screenVideo=document.createElement('video');screenVideo.muted=true;screenVideo.srcObject=screenStream;await screenVideo.play();videos.push(screenVideo);
  const settings=screenStream.getVideoTracks()[0].getSettings(),sw=settings.width||screenVideo.videoWidth,sh=settings.height||screenVideo.videoHeight;
  const region=options.rect,bounds=config.bounds,sx=region?(region.x-bounds.x)/bounds.width*sw:0,sy=region?(region.y-bounds.y)/bounds.height*sh:0,rw=region?region.width/bounds.width*sw:sw,rh=region?region.height/bounds.height*sh:sh,ratio=Math.min(1,1920/rw,1080/rh);
  const canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.floor(rw*ratio/2)*2);canvas.height=Math.max(2,Math.floor(rh*ratio/2)*2);const ctx=canvas.getContext('2d');if(!ctx)throw Error('canvas-unavailable');
  let camera:HTMLVideoElement|undefined;
  if(options.camera){const stream=await navigator.mediaDevices.getUserMedia({video:{width:320,height:240},audio:false});streams.push(stream);camera=document.createElement('video');camera.muted=true;camera.srcObject=stream;await camera.play();videos.push(camera);}
  if(options.microphone)streams.push(await navigator.mediaDevices.getUserMedia({audio:true,video:false}));
  const output=canvas.captureStream(30);streams.push(output);const audio=streams.flatMap(s=>s.getAudioTracks());
  if(audio.length){context=new AudioContext();const destination=context.createMediaStreamDestination();for(const track of audio)context.createMediaStreamSource(new MediaStream([track])).connect(destination);destination.stream.getAudioTracks().forEach(track=>output.addTrack(track));await context.resume();}
  const draw=():void=>{if(stopped)return;const target=options.focus?1.35:1;zoom+=(target-zoom)*.08;const cw=rw/zoom,ch=rh/zoom,cx=Math.max(sx,Math.min(sx+rw-cw,px*sw-cw/2)),cy=Math.max(sy,Math.min(sy+rh-ch,py*sh-ch/2));ctx.drawImage(screenVideo,cx,cy,cw,ch,0,0,canvas.width,canvas.height);
   if(camera){const width=canvas.width*.2,height=width*camera.videoHeight/camera.videoWidth;ctx.save();ctx.beginPath();ctx.roundRect(canvas.width-width-20,canvas.height-height-20,width,height,12);ctx.clip();ctx.drawImage(camera,canvas.width-width-20,canvas.height-height-20,width,height);ctx.restore();}
   if(options.keys&&key&&performance.now()<keyUntil){ctx.font='20px sans-serif';const width=ctx.measureText(key).width+28;ctx.fillStyle='rgba(28,29,32,.85)';ctx.fillRect((canvas.width-width)/2,canvas.height-64,width,40);ctx.fillStyle='#e5e7eb';ctx.fillText(key,(canvas.width-width)/2+14,canvas.height-37);}
   loop=requestAnimationFrame(draw);
  };draw();
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(value=>MediaRecorder.isTypeSupported(value));if(!mime)throw Error('record-codec-unavailable');recorder=new MediaRecorder(output,{mimeType:mime,videoBitsPerSecond:6_000_000});
  recorder.ondataavailable=event=>{if(!event.data.size)return;const chunk=event.data;chain=chain.then(async()=>{await bridge.chunk(config.id,sequence++,new Uint8Array(await chunk.arrayBuffer()));}).catch(fail);};
  recorder.onerror=event=>fail(event);recorder.onstop=()=>{cleanup();void chain.then(()=>bridge.status(config.id,'done')).catch(fail);};
  screenStream.getVideoTracks()[0].onended=()=>{if(recorder?.state!=='inactive')recorder?.stop();};
  streams.filter(stream=>stream!==screenStream&&stream!==output).forEach(stream=>stream.getTracks().forEach(track=>{track.onended=()=>{if(!stopped)fail(Error('record-device-removed'));};}));
  bridge.on(value=>{if(value.pointer){px=value.pointer.x;py=value.pointer.y;}if(value.key){key=value.key;keyUntil=performance.now()+1600;}if(value.command==='pause'&&recorder?.state==='recording'){recorder.pause();void bridge.status(config.id,'paused');}if(value.command==='resume'&&recorder?.state==='paused'){recorder.resume();void bridge.status(config.id,'recording');}if(value.command==='stop'&&recorder&&recorder.state!=='inactive')recorder.stop();});
  recorder.start(1000);await bridge.status(config.id,'recording');window.addEventListener('beforeunload',cleanup,{once:true});
 }catch(error){fail(error);}
};
