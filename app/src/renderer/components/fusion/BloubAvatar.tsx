/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0.
 * Bloub SVG engine: jeremy-prt, MIT; see vendor/bloub/LICENSE. */
/** @file BloubAvatar.tsx @description 灰阶 Grok SVG 适配器，隐藏停止循环，减少动画采用静态表情。 @author 鸡哥 */
import { useEffect, useId, useRef, useState, type JSX } from 'react';
import { BotEngine, type BotFrame } from '../../vendor/bloub/engine';
import { EXPRESSION_BY_ID, type ExpressionId } from '../../vendor/bloub/expressions';
import { SHAPE_BY_ID, COLOR_BY_ID, mixHex, type ShapeId, type ColorId } from '../../vendor/bloub/skins';
import { RAYON, DEMI_VIEWBOX } from '../../vendor/bloub/repere';
import { NOTIF_BLUE } from '../../vendor/bloub/decor';
import { POSES, type StateId } from '../../vendor/bloub/states';
import { Sound } from '../../vendor/coucou/core/sound';
import { useFusionPreferences } from './fusionPreferences';
import { useAvatarConfiguration } from './avatarConfiguration';
import { AvatarController } from './avatarController';
import { AvatarInteractions } from './avatarInteractions';
import { avatarPointerLook } from './avatarLook';
import type { FusionPetMood } from './FusionPet';
interface Props { mood:FusionPetMood; label:string; disabled?:boolean; dropActive?:boolean; attachmentCount?:number; state?:StateId; frozen?:boolean; shape?:ShapeId; color?:ColorId; expression?:ExpressionId; actionToken?:string|number; }
/** Renders every pinned action with a visible-only clock inside a fixed SVG viewport. */
export function BloubAvatar({mood,label,disabled=false,dropActive=false,attachmentCount=0,state:preview,frozen=false,shape,color,expression,actionToken=0}:Props):JSX.Element {
  const reduced=useFusionPreferences(s=>s.value.reducedMotion),config=useAvatarConfiguration(s=>s.value);
  const uid=useId().replace(/:/g,''),button=useRef<HTMLButtonElement>(null);
  const engine=useRef(new BotEngine(RAYON)),controller=useRef(new AvatarController()),gestures=useRef(new AvatarInteractions()),clock=useRef(0),applied=useRef(-1);
  const actor=useRef<SVGGElement>(null);

  const pointer=useRef<{id:number;x:number;y:number;valid:boolean;start:number}|null>(null);
  const following=useRef(false);

  const attachments=useRef({count:attachmentCount,token:actionToken,pending:false});

  const [pose,setPose]=useState<BotFrame>(()=>engine.current.sample(0));
  const [action,setAction]=useState(controller.current.action),refresh=useRef<()=>void>(()=>{});
  const effectiveMood=dropActive&&mood==='idle'&&!disabled?'surprised':mood;
  const chosenShape=shape??config.shape,chosenExpression=mood==='listening'?'attentif':expression??config.expression;
  const ink=COLOR_BY_ID.get(color??config.color)!.hex,paper='#1c1d20',VB=DEMI_VIEWBOX;
  const state=action.state,maskId=uid+'-eyes';
  useEffect(()=>{
    gestures.current.clear();pointer.current=null;
    controller.current.sync(effectiveMood,preview,actionToken,clock.current);
    engine.current.setShape(SHAPE_BY_ID.get(chosenShape)!.radii,clock.current);
    engine.current.setExpression(EXPRESSION_BY_ID.get(chosenExpression)!,clock.current);
    refresh.current();
  },[effectiveMood,preview,actionToken,chosenShape,chosenExpression]);
  useEffect(()=>{
    const previous=attachments.current;
    if(previous.token!==actionToken){attachments.current={count:attachmentCount,token:actionToken,pending:false};return;}
    if(attachmentCount>previous.count)previous.pending=true;
    if(attachmentCount<previous.count)previous.pending=false;
    previous.count=attachmentCount;
    if(disabled||frozen||preview||mood!=='idle'){previous.pending=false;return;}
    if(dropActive||!previous.pending)return;
    previous.pending=false;
    if(controller.current.action.source==='idle'){controller.current.interact('notify',clock.current);refresh.current();Sound.play('attach');}
  },[attachmentCount,actionToken,disabled,frozen,preview,mood,dropActive]);
  useEffect(()=>{
    const element=button.current;if(!element)return;
    const media=matchMedia('(prefers-reduced-motion: reduce)');let inView=true,raf=0,timer=0,last=performance.now();
    const visible=():boolean=>inView&&!document.hidden&&element.getClientRects().length>0;
    const draw=():void=>{
      const next=controller.current.sample(clock.current);
      const stable=false;
      const gesture=gestures.current.sample(clock.current,frozen||reduced||media.matches);
      actor.current?.removeAttribute('transform');
      actor.current?.setAttribute('data-gesture-scale',String(gesture.scale));
      engine.current.setStableBody(stable);
      if(applied.current!==next.id){applied.current=next.id;engine.current.setState(next.state,clock.current);setAction({...next});}


      element.dataset.faceReaction=next.state;
      if(frozen||reduced||media.matches){const still=new BotEngine(RAYON);still.setStableBody(stable);still.setShape(SHAPE_BY_ID.get(chosenShape)!.radii,-10);still.setExpression(EXPRESSION_BY_ID.get(chosenExpression)!,-10);still.reset(next.state,0);const frame=still.sample(POSES[next.state]);setPose(stable?{...frame,dots:[],arcs:[],notif:null,notch:null}:frame);}
      else {const frame=engine.current.sample(clock.current);setPose(stable?{...frame,dots:[],arcs:[],notif:null,notch:null}:frame);}
    };
    const tick=(now:number):void=>{raf=0;if(!visible()||frozen)return;if(now-last>=1000/30){clock.current+=(now-last)/1000;last=now;draw();}raf=requestAnimationFrame(tick);};
    const scheduleStill=():void=>{
      const next=controller.current.action;if(next.duration===null||frozen)return;
      timer=window.setTimeout(()=>{timer=0;if(!visible())return;const now=performance.now();clock.current+=(now-last)/1000;last=now;draw();scheduleStill();},Math.max(1,(next.duration-(clock.current-next.start))*1000+1));
    };
    const resume=():void=>{
      cancelAnimationFrame(raf);clearTimeout(timer);raf=timer=0;Sound.setActive(visible()&&!frozen&&mood!=='listening',element);
      if(!visible()){gestures.current.clear();pointer.current=null;if(['interaction','feedback'].includes(controller.current.action.source))controller.current.cancel(clock.current);return;}
      last=performance.now();draw();if(!frozen){if(reduced||media.matches)scheduleStill();else raf=requestAnimationFrame(tick);}
    };
    refresh.current=resume;
    const observer=new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;resume();});observer.observe(element);
    const stopFollowing=():void=>{if(!following.current)return;following.current=false;engine.current.setLook(null,clock.current,.3);};
    const look=(event:{clientX:number;clientY:number}):void=>{
      if(!visible()||disabled||frozen||preview||reduced||media.matches||document.documentElement.dataset.floatGesture){stopFollowing();return;}
      const rect=element.getBoundingClientRect();
      const target=avatarPointerLook(event.clientX,event.clientY,rect);if(!target)return;
      following.current=true;engine.current.setLook(target,clock.current,.22);
    };
    const nativeCursor=!frozen&&!preview&&typeof window.api?.getMousePosition==='function';
    if(!nativeCursor){window.addEventListener('pointermove',look,true);document.addEventListener('pointerleave',stopFollowing);}
    let disposed=false,polling=false;
    const cursorTimer=nativeCursor?window.setInterval(()=>{
      if(disposed||polling||!visible()||reduced||media.matches)return;
      polling=true;
      void Promise.all([window.api.getMousePosition(),window.api.getWindowBounds()]).then(([point,bounds])=>{
        if(!disposed&&bounds.width&&bounds.height)look({clientX:(point.x-bounds.x)*innerWidth/bounds.width,clientY:(point.y-bounds.y)*innerHeight/bounds.height});
      }).catch(()=>{}).finally(()=>{polling=false;});
    },100):0;
    const cancel=():void=>{gestures.current.clear();pointer.current=null;if(controller.current.action.source==='interaction')controller.current.cancel(clock.current);resume();};
    window.addEventListener('float-avatar-cancel',cancel);
    window.addEventListener('float-layout-gesture',cancel);
    document.addEventListener('visibilitychange',resume);media.addEventListener('change',resume);
    // 使用单一鼠标来源持续跟随，避免窗口边界切换导致抖动。
    engine.current.setLook(null,clock.current,reduced||media.matches?0:.12);resume();
    return()=>{disposed=true;clearInterval(cursorTimer);following.current=false;window.removeEventListener('pointermove',look,true);document.removeEventListener('pointerleave',stopFollowing);cancelAnimationFrame(raf);clearTimeout(timer);observer.disconnect();window.removeEventListener('float-avatar-cancel',cancel);window.removeEventListener('float-layout-gesture',cancel);document.removeEventListener('visibilitychange',resume);media.removeEventListener('change',resume);Sound.setActive(false,element);refresh.current=()=>{};};
  },[frozen,reduced,disabled,chosenShape,chosenExpression,mood,effectiveMood,preview]);
  const dots=pose.dots.map((dot,index)=>{const fill=dot.color??(dot.depth===undefined?ink:mixHex(paper,ink,dot.depth));return dot.d?<path key={index} d={dot.d} transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot??0}) scale(${RAYON})`} fill={fill} opacity={dot.opacity}/>:<circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill={fill} opacity={dot.opacity}/>;});
  const interact=():void=>{
    if(disabled||frozen||document.documentElement.dataset.floatGesture||effectiveMood==='listening')return;
    if(effectiveMood!=='idle'){engine.current.blink(clock.current);refresh.current();return;}
    if(!controller.current.canInteract())return;
    const sleeping=controller.current.action.state==='sleep',result=gestures.current.tap(clock.current,sleeping);
    if(sleeping){if(result.wake)controller.current.cancel(clock.current);}
    else {if(controller.current.action.source==='interaction'){refresh.current();return;}controller.current.interact(gestures.current.nextAction(),clock.current);}
    refresh.current();
  };
  return <button ref={button} type="button" className={`fusion-pet fusion-pet--${mood}`} aria-label={label} disabled={disabled} data-avatar="bloub" data-pose={state} data-action-id={action.id} data-action-source={action.source}
    onPointerEnter={()=>{refresh.current();}}
    onFocus={()=>{refresh.current();}}
    onBlur={()=>{pointer.current=null;refresh.current();}}
    onPointerDown={event=>{if(event.button!==0||disabled||frozen||effectiveMood==='listening'||controller.current.action.source==='interaction'||(!controller.current.canInteract()&&controller.current.action.source!=='status')||document.documentElement.dataset.floatGesture)return;event.stopPropagation();event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);button.current?.focus();pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY,valid:true,start:performance.now()};refresh.current();}}
    onPointerMove={event=>{const down=pointer.current;if(down&&down.valid&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>=6){down.valid=false;refresh.current();}}}
    onPointerLeave={()=>{if(pointer.current)pointer.current.valid=false;refresh.current();}}
    onPointerCancel={()=>{pointer.current=null;refresh.current();}}
    onLostPointerCapture={()=>{pointer.current=null;refresh.current();}}
    onPointerUp={event=>{const down=pointer.current;pointer.current=null;if(down?.id===event.pointerId&&down.valid&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<6){event.stopPropagation();interact();}else refresh.current();}}
    onClick={event=>{event.stopPropagation();if(event.detail===0)interact();}}>
    <svg viewBox={`${-VB} ${-VB} ${VB*2} ${VB*2}`} aria-hidden="true" className="fusion-pet-svg">
      <defs><mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB*2} height={VB*2}><path d={pose.bodyPath} fill="white"/>{pose.eyes.map((eye,index)=><path key={index} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="black"/>)}{pose.notch&&<circle cx={pose.notch.x} cy={pose.notch.y} r={pose.notch.r} fill="black"/>}</mask>
        {pose.arcs.map(arc=><linearGradient key={arc.id} id={uid+'-'+arc.id} gradientUnits="userSpaceOnUse" x1={arc.grad.x1} y1={arc.grad.y1} x2={arc.grad.x2} y2={arc.grad.y2}>{arc.grad.stops.map((stop,index)=><stop key={index} offset={index/(arc.grad.stops.length-1)} stopColor={stop}/>)}</linearGradient>)}
      </defs>
      <g ref={actor} data-gesture-scale="1">
      <g fill="none" strokeLinecap="round">{pose.arcs.map(arc=><path key={arc.id} d={arc.back} stroke={`url(#${uid}-${arc.id})`} strokeWidth={arc.width} opacity={arc.opacity}/>)}</g>
      {pose.dotsBehind&&dots}
      <g opacity={pose.bodyAlpha}><path d={pose.bodyPath} fill={paper}/><g mask={`url(#${maskId})`}><rect x={-VB} y={-VB} width={VB*2} height={VB*2} fill={ink}/></g></g>
      {!pose.dotsBehind&&dots}
      {pose.notif&&<circle cx={pose.notif.x} cy={pose.notif.y} r={pose.notif.r} fill={NOTIF_BLUE}/>}
      <g fill="none" strokeLinecap="round">{pose.arcs.map(arc=><path key={arc.id} d={arc.front} stroke={`url(#${uid}-${arc.id})`} strokeWidth={arc.width} opacity={arc.opacity}/>)}</g>
      </g>
    </svg>
  </button>;
}
