/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file avatarController.ts @description Interruptible local-time character actions; never changes window geometry. @author 鸡哥 */
import { STATE_BY_ID, type StateId } from '../../vendor/bloub/states';
import type { FusionPetMood } from './FusionPet';
export type AvatarSource = 'status' | 'feedback' | 'preview' | 'interaction' | 'idle';
export interface AvatarAction { id:number; state:StateId; source:AvatarSource; start:number; duration:number|null; }
const states: Record<FusionPetMood,StateId> = {idle:'idle',working:'thinking',waiting:'notify',finished:'burst',error:'exclaim',listening:'idle',thinking:'thinking',warning:'alert',curious:'wide',thanks:'wink',surprised:'wide'};
const persistent=new Set<FusionPetMood>(['idle','working','waiting','error','listening','thinking']);
/** Duration covers the measured action, including its required return motion. */
export function actionDuration(state:StateId):number { const spec=STATE_BY_ID.get(state)!;return Math.max(spec.duration,spec.minDuration??0); }
/** One controller per visible actor; a shared policy governs every page and preview. */
export class AvatarController {
  private key=''; private serial=0;
  action:AvatarAction={id:0,state:'idle',source:'idle',start:0,duration:null};
  /** Applies a new state or preview exactly once; status always preempts preview. */
  sync(mood:FusionPetMood, preview:StateId|undefined, token:string|number, now:number):AvatarAction {
    const priority=mood!=='idle';
    const state=priority?states[mood]:preview??'idle';
    const source:AvatarSource=priority?(persistent.has(mood)?'status':'feedback'):preview?'preview':'idle';
    const key=[mood,priority?'':preview,priority&&persistent.has(mood)?'':token].join(':');
    if(key!==this.key){this.key=key;this.action={id:++this.serial,state,source,start:now,duration:source==='preview'?actionDuration(state):source==='feedback'?actionDuration(state):null};}
    return this.sample(now);
  }
  /** Advances finite actions using only the visible actor's clock. */
  sample(now:number):AvatarAction {
    if(this.action.duration!==null && now-this.action.start>=this.action.duration){
      this.action={id:++this.serial,state:'idle',source:'idle',start:now,duration:null};
    }
    return this.action;
  }
  /** Cancels an action immediately and invalidates its instance. */
  cancel(now:number):void { this.action={id:++this.serial,state:'idle',source:'idle',start:now,duration:null}; }
  /** Clicks cannot interrupt status, feedback or a non-sleep manual preview. */
  canInteract():boolean { return this.action.source==='idle'||this.action.source==='interaction'||this.action.state==='sleep'&&this.action.source==='preview'; }
  /** 忽略动作中的重复点击，避免松手后继续播放过时的反馈。 */
  interact(state:StateId,now:number):void {
    if(!this.canInteract())return;
    if(this.action.source==='interaction')return;
    this.action={id:++this.serial,state,source:'interaction',start:now,duration:actionDuration(state)};
  }
}
