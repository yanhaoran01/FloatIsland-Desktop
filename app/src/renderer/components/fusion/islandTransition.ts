/* FloatIsland - https://github.com/yanhaoran01/FloatIsland. Copyright (C) 2026 contributors. GPL-3.0. */
/** @file islandTransition.ts @description Reversible dock morph with a seamless handoff to live content. @author 鸡哥 */
import {createGenieMesh} from './genieMesh';
import {stepGenieSpring} from './genieSpring';
import type {GenieSnapshot} from '../../../preload/types/genie';
type Direction='expand'|'collapse';
type Operation={target:0|1;commit:()=>void;cancelled:boolean;finishing:boolean};
let running:Operation|null=null,queued:{direction:Direction;commit:()=>void}|null=null;
let lastFocus:HTMLElement|null=null,meshCanvas:HTMLCanvasElement|undefined,warmed=false;
const nextFrame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.fiReducedMotion==='true';
/** @returns Whether a dock transition is still preparing, animating or finishing. */
export function islandTransitionActive():boolean{return running!==null;}
/** Compile once while the capsule is idle, before the first gesture. @returns No value. */
export function prepareIslandTransition():void{
 if(typeof window.api?.fusionGenie!=='function'||reducedMotion())return;
 if(!warmed&&!running){
  warmed=true;try{const image=document.createElement('canvas');image.width=image.height=1;meshCanvas=document.createElement('canvas');meshCanvas.width=meshCanvas.height=1;createGenieMesh(meshCanvas,image,'top',{x:0,y:0,width:1,height:1});}catch{meshCanvas=undefined;}
 }
 if(!running)void window.api.fusionGenie('prepare',{}).catch(()=>{});
}
/**
 * Preserve the current picture and velocity when a gesture reverses direction.
 * @param direction - Requested expansion or collapse.
 * @param commit - Applies the live UI state at the appropriate animation endpoint.
 * @returns No value; the transition completes asynchronously.
 */
export function transitionIsland(direction:Direction,commit:()=>void):void{
 if(typeof window.api?.fusionGenie!=='function'||(!running&&reducedMotion())){commit();return;}
 const target:0|1=direction==='expand'?0:1;
 if(running){
  if(running.finishing){queued=running.target===target?null:{direction,commit};return;}
  if(running.target!==target){running.target=target;running.commit=commit;}return;
 }
 const operation:Operation={target,commit,cancelled:false,finishing:false};running=operation;
 void(async()=>{
  let snapshot:GenieSnapshot|null=null,canvas:HTMLCanvasElement|undefined,committed=false;
  const root=document.querySelector<HTMLElement>('.island-shell'),oldVisibility=root?.style.visibility||'';
  const focus=document.activeElement as HTMLElement|null;if(direction==='collapse'&&focus&&focus!==document.body)lastFocus=focus;
  const off=window.api.onFusionGenieCancelled?.(revision=>{if(!snapshot||revision===snapshot.revision)operation.cancelled=true;});
  document.documentElement.dataset.floatGesture='transition';window.dispatchEvent(new Event('float-tool-panel'));
  try{
   snapshot=await window.api.fusionGenie('begin',{direction});if(!snapshot)throw Error('transition-unavailable');
   if(direction==='expand'){commit();committed=true;await nextFrame();await nextFrame();}
   if(operation.cancelled||reducedMotion())throw Error('transition-cancelled');
   snapshot=await window.api.fusionGenie('capture',{revision:snapshot.revision});if(!snapshot||operation.cancelled)throw Error('capture-unavailable');
   const decode=async(src:string)=>{const image=new Image();image.src=src;await image.decode();return image;};
   const [images,capsule]=await Promise.all([Promise.all(snapshot.frames.map(frame=>decode(frame.image))),snapshot.compactImage?decode(snapshot.compactImage):Promise.resolve(null)]);
   if(operation.cancelled)throw Error('transition-cancelled');
   const texture=document.createElement('canvas');texture.width=snapshot.width;texture.height=snapshot.height;
   const context=texture.getContext('2d');if(!context)throw Error('capture-unavailable');
   snapshot.frames.forEach((frame,index)=>context.drawImage(images[index],frame.rect.x,frame.rect.y,frame.rect.width,frame.rect.height));
   let compactTexture:HTMLCanvasElement|undefined;if(capsule){compactTexture=document.createElement('canvas');compactTexture.width=capsule.naturalWidth;compactTexture.height=capsule.naturalHeight;compactTexture.getContext('2d')?.drawImage(capsule,0,0);}
   canvas=meshCanvas||(meshCanvas=document.createElement('canvas'));if(canvas.width!==texture.width)canvas.width=texture.width;if(canvas.height!==texture.height)canvas.height=texture.height;
   Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',zIndex:'2147483647',pointerEvents:'none',display:'block'});document.body.append(canvas);
   const draw=createGenieMesh(canvas,texture,snapshot.edge,snapshot.compact,compactTexture);
   if(root)root.style.visibility='hidden';window.dispatchEvent(new Event('float-tool-panel'));
   let progress=direction==='expand'?1:0,velocity=0;draw(progress);await window.api.fusionGenie('show',{revision:snapshot.revision});
   await new Promise<void>(resolve=>{let previous=performance.now();const tick=(now:number)=>{
    if(operation.cancelled){resolve();return;}
    const next=stepGenieSpring(progress,velocity,operation.target,(now-previous)/1000);previous=now;progress=next.position;velocity=next.velocity;
    if(Math.abs(progress-operation.target)<.003&&Math.abs(velocity)<.09){draw(operation.target);resolve();return;}
    draw(progress);requestAnimationFrame(tick);
   };requestAnimationFrame(tick);});
   operation.finishing=true;
   if(operation.target===1&&!operation.cancelled){
    const capsule=document.createElement('canvas');capsule.width=snapshot.compact.width;capsule.height=snapshot.compact.height;
    capsule.getContext('2d')?.drawImage(canvas,snapshot.compact.x,snapshot.compact.y,snapshot.compact.width,snapshot.compact.height,0,0,capsule.width,capsule.height);
    await window.api.fusionGenie('handoff',{revision:snapshot.revision,image:capsule.toDataURL('image/png')});
   }
  }catch(error){
   console.warn('[FloatIsland] Genie transition fallback',error);
   canvas?.remove();if(root)root.style.visibility=oldVisibility;
   if(snapshot)await window.api.fusionGenie('show',{revision:snapshot.revision}).catch(()=>{});
   if(root&&!operation.cancelled&&operation.target===0&&!committed){operation.commit();committed=true;await nextFrame();}
  }finally{
   operation.finishing=true;
   // Keep the final expanded picture until React has painted the live content.
   // A collapsing window changes its origin, so its old overlay must leave first.
   if(operation.target===1){canvas?.remove();if(canvas)canvas.style.display='none';}
   if(operation.target===1||!committed)operation.commit();
   // Paint live content under the final overlay before uncovering it.
   if(root)root.style.visibility=oldVisibility;
   await nextFrame();await nextFrame();
   if(root)root.style.visibility=oldVisibility;canvas?.remove();if(canvas)canvas.style.display='none';
   if(snapshot)await window.api.fusionGenie('finish',{revision:snapshot.revision}).catch(()=>{});
   off?.();delete document.documentElement.dataset.floatGesture;window.dispatchEvent(new Event('float-tool-panel'));running=null;
   const restore=lastFocus?.isConnected?lastFocus:focus;if(operation.target===0&&restore?.isConnected)requestAnimationFrame(()=>restore.focus({preventScroll:true}));
   const next=queued;queued=null;if(next)transitionIsland(next.direction,next.commit);else if(operation.target===1)prepareIslandTransition();
  }
 })();
}
