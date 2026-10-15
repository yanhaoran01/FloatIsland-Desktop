/* FloatIsland contributors, GPL-3.0. */
/** @file fusionMusicPluginHost.ts @description Owns isolated plugin windows and bounded public-network broker. @author 鸡哥 */
import {BrowserWindow,ipcMain,session} from 'electron';
import {join} from 'path';
import {lookup} from 'dns/promises';
import {isIP} from 'net';
import {randomUUID} from 'crypto';
import {request as requestHttp} from 'http';
import {request as requestHttps} from 'https';
import {Readable} from 'stream';
import {createBrotliDecompress,createUnzip} from 'zlib';
type Raw=Record<string,unknown>;
const raw=(value:unknown):Raw=>value&&typeof value==='object'&&!Array.isArray(value)?value as Raw:{};
/** Rejects internal, mapped, multicast, link-local and documentation networks before following redirects. */
export function publicMusicAddress(ip:string):boolean {
  if(isIP(ip)===4){const p=ip.split('.').map(Number);return !(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&(p[1]===168||p[1]===0||p[1]===2)||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===198&&(p[1]===18||p[1]===19||p[1]===51)||p[0]===203&&p[1]===0&&p[2]===113);}
  const lower=ip.toLowerCase();return isIP(ip)===6&&!(/^(::|fc|fd|fe[89ab]|ff|2001:db8)/.test(lower));
}
/** Imported resolvers may use public hosts, but never the local app bridge or credential URLs. */
export async function publicMusicUrl(value:string):Promise<string>{
  let url:URL;try{url=new URL(value);}catch{throw Error('music-invalid-source');}
  if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.port&&url.port!=='80'&&url.port!=='443'||url.hostname.length>253)throw Error('music-invalid-source');
  const hostname=url.hostname.replace(/^\[|\]$/g,'');const addresses=isIP(hostname)?[{address:hostname}]:await lookup(hostname,{all:true});
  if(!addresses.length||addresses.some(a=>!publicMusicAddress(a.address)))throw Error('music-plugin-private-network');return url.href;
}
/** Checks the DNS result used by the actual socket, preventing validation/connection rebinding. */
export async function publicMusicRequest(value:string,options:RequestInit={}):Promise<Response>{
  const url=new URL(await publicMusicUrl(value));
  return new Promise((resolve,reject)=>{
    const headers=musicPluginHeaders(Object.fromEntries(new Headers(options.headers)));
    headers['Accept-Encoding']='identity';
    const request=(url.protocol==='https:'?requestHttps:requestHttp)(url,{method:options.method??'GET',headers,signal:options.signal??undefined,lookup:(hostname,settings,callback)=>{
      void lookup(hostname,{all:true}).then(addresses=>{
        if(!addresses.length||addresses.some(item=>!publicMusicAddress(item.address))){callback(Error('music-plugin-private-network'),'',4);return;}
        if(settings.all)callback(null,addresses);else callback(null,addresses[0].address,addresses[0].family);
      }).catch(error=>callback(error instanceof Error?error:Error('music-invalid-source'),'',4));
    }},response=>{
      const status=response.statusCode??502,responseHeaders=new Headers();for(const [name,value] of Object.entries(response.headers)){if(value!==undefined)responseHeaders.set(name,Array.isArray(value)?value.join(', '):value);}
      if(options.method==='HEAD'||status===204||status===304){response.resume();resolve(new Response(null,{status,headers:responseHeaders}));return;}
      const encoding=responseHeaders.get('content-encoding'),body=encoding==='br'?response.pipe(createBrotliDecompress()):encoding==='gzip'||encoding==='deflate'?response.pipe(createUnzip()):response;
      if(body!==response){responseHeaders.delete('content-encoding');responseHeaders.delete('content-length');}
      resolve(new Response(Readable.toWeb(body) as ReadableStream<Uint8Array>,{status,headers:responseHeaders}));
    });request.once('error',reject);if(options.body!==undefined&&options.body!==null){if(typeof options.body!=='string'){request.destroy(Error('music-plugin-request-denied'));return;}request.write(options.body);}request.end();
  });
}
/** Drops credentials, connection controls and unsafe response headers. */
export function musicPluginHeaders(input:unknown):Record<string,string>{
  const output:Record<string,string>={};for(const [key,value] of Object.entries(raw(input))){if(/^(cookie|set-cookie|authorization|proxy-|host$|connection$|content-length$|transfer-encoding$|upgrade$)/i.test(key)||typeof value!=='string'||value.length>4000||/[\r\n]/.test(value))continue;if(/^[\w-]{1,80}$/.test(key))output[key]=value;}return output;
}
/** Reads at most a fixed amount; oversized plugin responses never fill main-process memory. */
export async function musicResponseText(response:Response,max=5_000_000):Promise<string>{
  if(Number(response.headers.get('content-length'))>max)throw Error('music-response-too-large');const reader=response.body?.getReader();if(!reader)return '';let length=0,result='',decoder=new TextDecoder();try{while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>max)throw Error('music-response-too-large');result+=decoder.decode(chunk.value,{stream:true});}return result+decoder.decode();}catch(error){await reader.cancel().catch(()=>{});throw error;}
}
type Pending={id:string;resolve:(value:unknown)=>void;reject:(error:Error)=>void;requests:number;controllers:Set<AbortController>;timer:ReturnType<typeof setTimeout>;abort:()=>void;signal:AbortSignal};
const hosts=new Map<number,MusicPluginHost>();let registered=false;
/** One serialized call per source prevents cross-call network ownership and terminates hostile loops. */
export class MusicPluginHost {
  private window:BrowserWindow|null=null;private ready:Promise<void>|null=null;private resolveReady:(()=>void)|null=null;private pending:Pending|null=null;private initialized=false;private tail:Promise<unknown>=Promise.resolve();
  constructor(private code:string){
    if(!registered){registered=true;ipcMain.on('fusion:music:plugin-ready',event=>hosts.get(event.sender.id)?.resolveReady?.());ipcMain.on('fusion:music:plugin-result',(event,id:string,value:unknown,error?:string)=>hosts.get(event.sender.id)?.result(id,value,error));ipcMain.handle('fusion:music:plugin-http',(event,id:string,url:string,options:unknown)=>{const host=hosts.get(event.sender.id);if(!host)throw Error('untrusted-view');return host.http(id,url,options);});}
  }
  private result(id:string,value:unknown,error?:string):void{const pending=this.pending;if(!pending||pending.id!==id)return;this.pending=null;clearTimeout(pending.timer);pending.signal.removeEventListener('abort',pending.abort);for(const controller of pending.controllers)controller.abort();if(error)pending.reject(Error(String(error).slice(0,500)));else pending.resolve(value);}
  private async ensure():Promise<BrowserWindow>{
    if(!this.window||this.window.isDestroyed()){
      const partition='fusion-music-plugin-'+randomUUID(),sandbox=session.fromPartition(partition);sandbox.setPermissionRequestHandler((_w,_p,cb)=>cb(false));sandbox.setPermissionCheckHandler(()=>false);
      this.window=new BrowserWindow({show:false,width:1,height:1,webPreferences:{preload:join(__dirname,'../preload/musicPlugin.js'),partition,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});hosts.set(this.window.webContents.id,this);
      this.window.webContents.setWindowOpenHandler(()=>({action:'deny'}));this.window.webContents.on('will-navigate',event=>event.preventDefault());this.window.webContents.on('render-process-gone',()=>this.dispose('music-plugin-host-crashed'));
      this.ready=new Promise<void>((resolve,reject)=>{this.resolveReady=resolve;const timer=setTimeout(()=>reject(Error('music-plugin-timeout')),10000);this.window!.once('closed',()=>{clearTimeout(timer);reject(Error('music-plugin-cancelled'));});const finish=resolve;this.resolveReady=()=>{clearTimeout(timer);finish();};});
      const url=process.env.ELECTRON_RENDERER_URL;if(url)void this.window.loadURL(url+'/MusicPluginHost.html').catch(()=>this.dispose('music-plugin-host-crashed'));else void this.window.loadFile(join(__dirname,'../renderer/MusicPluginHost.html')).catch(()=>this.dispose('music-plugin-host-crashed'));
    }
    await this.ready;return this.window;
  }
  private async request(action:string,args:unknown[],signal:AbortSignal):Promise<unknown>{
    if(signal.aborted)throw Error('music-cancelled');const window=await this.ensure();if(signal.aborted)throw Error('music-cancelled');
    return new Promise((resolve,reject)=>{const id=randomUUID(),abort=()=>this.dispose('music-cancelled'),timer=setTimeout(()=>this.dispose('music-plugin-timeout'),15000);this.pending={id,resolve,reject,requests:0,controllers:new Set(),timer,abort,signal};signal.addEventListener('abort',abort,{once:true});window.webContents.send('fusion:music:plugin-call',{id,action,args});});
  }
  /** Initializes capability declarations before any search or playback request. */
  call(action:string,args:unknown[],signal:AbortSignal):Promise<unknown>{
    const execute=async()=>{signal.throwIfAborted();if(!this.initialized){const metadata=await this.request('init',[this.code],signal);this.initialized=true;if(action==='init')return metadata;}return this.request(action,args,signal);};const result=this.tail.then(execute,execute);this.tail=result.catch(()=>{});return result;
  }
  private async http(id:string,value:string,optionsInput:unknown):Promise<unknown>{
    const pending=this.pending;if(!pending||pending.id!==id||typeof value!=='string'||value.length>8192||++pending.requests>40)throw Error('music-plugin-request-denied');const options=raw(optionsInput),controller=new AbortController();pending.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),10000);
    try{
      let url=await publicMusicUrl(value),method=String(options.method??'GET').toUpperCase();if(!['GET','POST','HEAD','PUT'].includes(method))throw Error('music-plugin-request-denied');const headers=musicPluginHeaders(options.headers);let body:string|undefined;
      if(options.form&&typeof options.form==='object'){body=new URLSearchParams(Object.entries(raw(options.form)).map(([k,v])=>[k,String(v)])).toString();headers['Content-Type']='application/x-www-form-urlencoded';}else if(options.body!==undefined){body=typeof options.body==='string'?options.body:JSON.stringify(options.body);if(typeof options.body!=='string')headers['Content-Type']='application/json';}
      if(body&&body.length>1_000_000)throw Error('music-response-too-large');
      for(let redirect=0;redirect<5;redirect++){if(this.pending!==pending)throw Error('music-cancelled');const response=await publicMusicRequest(url,{method,headers,body,signal:controller.signal});
        if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('music-invalid-source');url=await publicMusicUrl(new URL(location,url).href);if(response.status===303){method='GET';body=undefined;}continue;}
        if(!response.ok){await response.body?.cancel();throw Error('music-http-'+response.status);}const text=await musicResponseText(response);let result:unknown=text;try{result=JSON.parse(text);}catch{/* LRC and HTML may be text. */}return {status:response.status,headers:musicPluginHeaders(Object.fromEntries(response.headers)),body:result};
      }throw Error('music-too-many-redirects');
    }finally{clearTimeout(timer);pending.controllers.delete(controller);controller.abort();}
  }
  /** Cancel, disable, timeout and application exit destroy the worker and all owned HTTP requests. */
  dispose(reason='music-cancelled'):void{
    const window=this.window;this.window=null;this.ready=null;this.initialized=false;this.resolveReady=null;const pending=this.pending;this.pending=null;if(pending){clearTimeout(pending.timer);pending.signal.removeEventListener('abort',pending.abort);pending.controllers.forEach(c=>c.abort());pending.reject(Error(reason));}if(window&&!window.isDestroyed()){hosts.delete(window.webContents.id);window.destroy();}
  }
}
