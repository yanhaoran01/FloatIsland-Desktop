/* FloatIsland contributors. GPL-3.0. */
/** @file multiTimerService.ts @description Main-owned independent timers with atomic persistence and honest notification failures. @author 鸡哥 */
import {app,ipcMain,Notification} from 'electron';
import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {broadcastFusion,isFusionView} from './fusionWindows';
import {restoreTimers,tickTimers,commandTimer} from './multiTimerModel';
import type {IndependentTimer,TimerCommand} from '../../preload/types/fusionWorkspace';
export function registerIndependentTimers():void{
 const directory=join(app.getPath('userData'),'fusion-workspace'),file=join(directory,'timers-v1.json');let timers:IndependentTimer[]=[];
 if(existsSync(file))try{timers=restoreTimers(JSON.parse(readFileSync(file,'utf8')).timers);}catch{renameSync(file,file+'.invalid-'+Date.now()+'.bak');}
 const save=()=>{mkdirSync(directory,{recursive:true});writeFileSync(file+'.tmp',JSON.stringify({version:1,timers}));renameSync(file+'.tmp',file);};
 const publish=()=>broadcastFusion('fusion:timers:updated',timers);
 const tick=()=>{const active=timers.some(timer=>timer.state==='running'),finished=tickTimers(timers,Date.now());for(const timer of finished){try{const preferencesPath=join(app.getPath('userData'),'eIsland_store','fusion-preferences.json'),preferences=existsSync(preferencesPath)?JSON.parse(readFileSync(preferencesPath,'utf8')):{};if(preferences.completionReminders===false)continue;if(!Notification.isSupported())throw Error('notification-unavailable');const notice=new Notification({title:'FloatIsland',body:timer.name||'Timer',silent:preferences.muted===true});notice.once('failed',()=>{const current=timers.find(item=>item.id===timer.id&&item.finishedAt===timer.finishedAt);if(current){current.notificationError='notification-failed';save();publish();}});notice.show();}catch(error){timer.notificationError=String(error);}}if(finished.length)save();if(active)publish();};
 ipcMain.handle('fusion:timers:get',event=>{if(!isFusionView(event.sender)||event.senderFrame!==event.sender.mainFrame)throw Error('untrusted-view');tick();return timers;});
 ipcMain.handle('fusion:timers:command',(event,command:TimerCommand)=>{if(!isFusionView(event.sender)||event.senderFrame!==event.sender.mainFrame)throw Error('untrusted-view');tick();const next=structuredClone(timers);commandTimer(next,command,Date.now(),randomUUID());const previous=timers;timers=next;try{save();}catch(error){timers=previous;throw error;}publish();return timers;});
 const interval=setInterval(tick,1000);app.once('before-quit',()=>{clearInterval(interval);tick();save();});tick();
}
