/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file aria2Rpc.ts @description Owned, loopback-only aria2 process and authenticated bounded JSON-RPC. @author 鸡哥 */
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes,randomUUID} from 'node:crypto';
/** Runs one bundled engine without exposing RPC credentials to renderers. */
export class Aria2Rpc {
 private child:ChildProcess|undefined;private start:Promise<void>|undefined;private url='';private secret=randomBytes(32).toString('hex');private cleanup:(()=>void)|undefined;
 constructor(private binary:string,private owner?:(pid:number)=>()=>void){}
 /** Starts the owned engine lazily. @returns Readiness. */
 async ready():Promise<void>{
  if(this.start)return this.start;
  this.start=(async()=>{const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string'){server.close();reject(Error('bt-runtime-unavailable'));return;}server.close(error=>error?reject(error):resolve(address.port));});});
   this.url=`http://127.0.0.1:${port}/jsonrpc`;
   const child=spawn(this.binary,['--no-conf=true','--enable-rpc=true','--rpc-listen-all=false','--rpc-allow-origin-all=false','--rpc-listen-port='+port,'--rpc-secret='+this.secret,'--pause-metadata=true','--bt-save-metadata=true','--check-integrity=true','--seed-time=0','--max-concurrent-downloads=16','--console-log-level=error'],{windowsHide:true,stdio:['ignore','ignore','pipe']});this.child=child;
   let failure:Error|undefined;child.once('error',error=>{failure=error;});child.stderr?.resume();child.once('spawn',()=>{if(child.pid&&this.owner)try{this.cleanup=this.owner(child.pid);}catch(error){failure=error instanceof Error?error:Error(String(error));child.kill();}});
   child.once('close',()=>{if(this.child===child){this.child=undefined;this.start=undefined;this.cleanup?.();this.cleanup=undefined;}});
   for(let n=0;n<50;n++){if(failure)throw failure;if(child.exitCode!==null)throw Error('bt-runtime-unavailable');try{await this.request('getVersion',[]);return;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
   throw Error('bt-runtime-unavailable');
  })().catch(error=>{this.close();throw error;});return this.start;
 }
 /** Calls a fixed engine method with bounded timeout and a private token.
  * @param method - aria2 method. @param params - Internal parameters. @returns RPC result.
  */
 async call<T>(method:string,params:unknown[]=[]):Promise<T>{await this.ready();return this.request<T>(method,params);}
 private async request<T>(method:string,params:unknown[]):Promise<T>{
  const response=await fetch(this.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method:'aria2.'+method,params:['token:'+this.secret,...params]}),signal:AbortSignal.timeout(4000)});
  if(!response.ok)throw Error('bt-rpc-unavailable');const raw=await response.text();if(raw.length>4000000)throw Error('file-limit');const result=JSON.parse(raw) as {result:T;error?:{message?:string}};if(result.error)throw Error('bt-engine-error: '+(result.error.message||''));return result.result;
 }
 /** Terminates only this owned engine process. @returns No value. */
 close():void{this.cleanup?.();this.cleanup=undefined;this.child?.kill();this.child=undefined;this.start=undefined;}
}
