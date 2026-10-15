/* FloatIsland contributors. GPL-3.0. */
/** @file multiTimerModel.ts @description Independent countdown deadlines and validated restart recovery. @author 鸡哥 */
import type {IndependentTimer,TimerCommand} from '../../preload/types/fusionWorkspace';
export function restoreTimers(value:unknown):IndependentTimer[]{
 if(!Array.isArray(value)||value.length>50)throw Error('invalid-timer-data');
 for(const timer of value){if(!timer||typeof timer.id!=='string'||!/^[\w-]{1,100}$/.test(timer.id)||typeof timer.name!=='string'||timer.name.length>200||!['idle','running','paused','finished'].includes(timer.state)||!Number.isInteger(timer.duration)||timer.duration<1||timer.duration>359999||!Number.isFinite(timer.remaining)||timer.remaining<0||timer.remaining>timer.duration||timer.state==='running'&&!Number.isFinite(timer.deadline)||timer.deadline!==null&&!Number.isFinite(timer.deadline))throw Error('invalid-timer-data');}
 if(new Set(value.map(timer=>timer.id)).size!==value.length)throw Error('invalid-timer-data');return structuredClone(value);
}
export function tickTimers(timers:IndependentTimer[],now:number):IndependentTimer[]{
 const finished:IndependentTimer[]=[];for(const timer of timers){if(timer.state!=='running'||timer.deadline===null)continue;timer.remaining=Math.max(0,Math.min(timer.duration,Math.ceil((timer.deadline-now)/1000)));if(!timer.remaining){timer.state='finished';timer.deadline=null;timer.finishedAt=now;finished.push(timer);}}return finished;
}
export function commandTimer(timers:IndependentTimer[],command:TimerCommand,now:number,newId:string):void{
 if(!command||!['create','start','pause','resume','reset','remove','rename'].includes(command.type))throw Error('invalid-timer-action');
 if(command.type==='create'){if(timers.length>=50||!Number.isInteger(command.seconds)||command.seconds<1||command.seconds>359999||typeof command.name!=='string'||command.name.length>200)throw Error('invalid-timer-duration');timers.push({id:newId,name:command.name,state:'idle',duration:command.seconds,remaining:command.seconds,deadline:null});return;}
 const timer=timers.find(value=>value.id===command.id);if(!timer)throw Error('timer-not-found');
 if(command.type==='remove'){timers.splice(timers.indexOf(timer),1);return;}
 if(command.type==='rename'){if(typeof command.name!=='string'||command.name.length>200)throw Error('invalid-timer-data');timer.name=command.name;return;}
 if(command.type==='start'){timer.remaining=timer.duration;timer.state='running';timer.deadline=now+timer.duration*1000;delete timer.finishedAt;delete timer.notificationError;}
 else if(command.type==='pause'&&timer.state==='running'){timer.state='paused';timer.deadline=null;}
 else if(command.type==='resume'&&timer.state==='paused'){timer.state='running';timer.deadline=now+timer.remaining*1000;}
 else if(command.type==='reset'){timer.state='idle';timer.remaining=timer.duration;timer.deadline=null;delete timer.finishedAt;delete timer.notificationError;}
 else throw Error('invalid-timer-action');
}
