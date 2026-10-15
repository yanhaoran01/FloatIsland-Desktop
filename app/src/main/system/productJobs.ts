/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file productJobs.ts @description Shared cancellable jobs and owned child processes. @author 鸡哥 */
import type { WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { getFfmpegBinary } from '../utils/ffmpegPath';
import type { ProductJob } from '../../preload/types/fusionProduct';
export interface ProductTask {owner:WebContents;value:ProductJob;controller:AbortController;confirm?:()=>void;}
export const productTasks=new Map<string,ProductTask>();
const watchedOwners=new WeakSet<WebContents>();
/** Creates a tracked task tied to its view. @param owner - Trusted app view. @param kind - Task category. @returns Task. */
export function createProductTask(owner:WebContents,kind:ProductJob['kind']):ProductTask {
 const task={owner,value:{id:randomUUID(),kind,state:'running' as const,progress:0,result:[]},controller:new AbortController()};
 productTasks.set(task.value.id,task);if(!watchedOwners.has(owner)){watchedOwners.add(owner);owner.once('destroyed',()=>{for(const [id,owned] of productTasks)if(owned.owner===owner){owned.controller.abort();productTasks.delete(id);}});}return task;
}
/** Emits a new task snapshot. @param task - Tracked task. @param patch - State change. @returns Updated snapshot. */
export function publishProductTask(task:ProductTask,patch:Partial<ProductJob>={}):ProductJob {
 Object.assign(task.value,patch);if(!task.owner.isDestroyed())task.owner.send('fusion:product:job',{...task.value});return {...task.value};
}
/** Runs a finite FFmpeg argument list. @param args - Main-owned arguments. @param signal - Cancellation. @returns Completion. */
export function runProductFfmpeg(args:string[],signal:AbortSignal):Promise<void> {
 signal.throwIfAborted();return new Promise((resolve,reject)=>{
  const child=spawn(getFfmpegBinary(),['-hide_banner','-loglevel','error','-nostdin',...args],{windowsHide:true});let error='',settled=false;
  const finish=(reason?:Error):void=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);reason?reject(reason):resolve();};
  const cancel=():void=>{child.kill();finish(Error('job-cancelled'));};signal.addEventListener('abort',cancel,{once:true});
  child.stderr.on('data',chunk=>{error=(error+String(chunk)).slice(-4096);});child.on('error',finish);child.on('close',code=>finish(code===0?undefined:Error(error||'encoding-failed')));
 });
}
/** Runs a bounded offline utility in a worker. @param input - Validated tool input. @param signal - Cancellation. @returns Processor result. */
export function runProductWorker(input:import('../../shared/utilityOperations').UtilityJob,signal:AbortSignal):Promise<unknown> {
 signal.throwIfAborted();return new Promise((resolve,reject)=>{
  const worker=new Worker(join(__dirname,'productWorker.js'),{workerData:input});let settled=false;
  const finish=(error?:Error,result?:unknown):void=>{if(settled)return;settled=true;clearTimeout(timeout);signal.removeEventListener('abort',cancel);void worker.terminate();error?reject(error):resolve(result);};
  const cancel=():void=>finish(Error('job-cancelled'));const timeout=setTimeout(()=>finish(Error('job-timeout')),120000);signal.addEventListener('abort',cancel,{once:true});
  worker.on('message',(value:{error?:string;result?:unknown})=>finish(value.error?Error(value.error):undefined,value.result));worker.on('error',finish);worker.on('exit',code=>{if(!settled)finish(Error('worker-exited-'+code));});
 });
}
/** Waits for explicit confirmation of a real preview. @param task - Waiting task. @returns Confirmation. */
export function confirmProductTask(task:ProductTask):Promise<void> {
 return new Promise((resolve,reject)=>{const cancel=():void=>{task.confirm=undefined;reject(Error('job-cancelled'));};task.controller.signal.addEventListener('abort',cancel,{once:true});task.confirm=()=>{task.controller.signal.removeEventListener('abort',cancel);task.confirm=undefined;publishProductTask(task,{state:'running',preview:undefined});resolve();};});
}
