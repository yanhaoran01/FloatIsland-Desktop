/* FloatIsland contributors, GPL-3.0. Independently implements documented MusicFree/LX/Ceru music APIs. */
/** @file musicPluginWorker.ts @description Runs user sources without Node, DOM, credentials or direct network. @author 鸡哥 */
import forge from 'node-forge';
import CryptoJS from 'crypto-js';
import * as cheerio from 'cheerio/slim';
import {unzlibSync,zlibSync} from 'fflate';
type Raw=Record<string,unknown>;
type Fn=(...args:unknown[])=>unknown;
const object=(v:unknown):Raw=>v&&typeof v==='object'&&!Array.isArray(v)?v as Raw:{};
const method=(v:unknown):Fn=>{if(typeof v!=='function')throw Error('music-plugin-unsupported-capability');return v as Fn;};
let exportValue:Raw={},kind='',activeId='',sequence=0,manifest:Raw={},providers=new Map<string,Raw>(),events=new Map<string,Fn>();
const controllers=new Map<string,AbortController>(),httpPending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>(),cursors=new Map<string,string>();
const http=async(url:string,options:Raw={}):Promise<Raw>=>{const id=++sequence;const response=await new Promise<unknown>((resolve,reject)=>{httpPending.set(id,{resolve,reject});postMessage({kind:'http',id,callId:activeId,url,options});});return object(response);};
const bytes=(value:unknown,encoding='utf8'):Uint8Array=>{if(value instanceof Uint8Array)return value;if(Array.isArray(value))return new Uint8Array(value.map(Number));const text=String(value??'');return encoding==='hex'?new Uint8Array((text.match(/../g)??[]).map(v=>parseInt(v,16))):encoding==='base64'?Uint8Array.from(atob(text),s=>s.charCodeAt(0)):new TextEncoder().encode(text);};
const binary=(value:unknown)=>Array.from(bytes(value),b=>String.fromCharCode(b)).join('');
const encoded=(value:Uint8Array,encoding='utf8')=>encoding==='hex'?Array.from(value,b=>b.toString(16).padStart(2,'0')).join(''):encoding==='base64'?btoa(binary(value)):new TextDecoder().decode(value);
const cryptoTools={md5:(value:unknown)=>{const hash=forge.md.md5.create();hash.update(typeof value==='string'?forge.util.encodeUtf8(value):binary(value));return hash.digest().toHex();},randomBytes:(length:number)=>{if(!Number.isInteger(length)||length<0||length>65536)throw Error('music-invalid-value');return crypto.getRandomValues(new Uint8Array(length));},aesEncrypt:(value:unknown,mode:string,key:unknown,iv:unknown)=>{const algorithms:Record<string,forge.cipher.Algorithm>={cbc:'AES-CBC',ecb:'AES-ECB',ctr:'AES-CTR'};const algorithm=algorithms[mode.toLowerCase()];if(!algorithm)throw Error('music-plugin-crypto');const cipher=forge.cipher.createCipher(algorithm,binary(key));cipher.start({iv:mode.toLowerCase()==='ecb'?undefined:binary(iv)});cipher.update(forge.util.createBuffer(binary(value)));if(!cipher.finish())throw Error('music-plugin-crypto');return bytes(cipher.output.toHex(),'hex');},rsaEncrypt:(value:unknown,key:string)=>{const publicKey=forge.pki.publicKeyFromPem(key);return bytes(btoa(publicKey.encrypt(binary(value),'RSAES-PKCS1-V1_5')),'base64');}};
const utils={buffer:{from:bytes,bufToString:encoded},crypto:cryptoTools,zlib:{inflate:(v:unknown)=>unzlibSync(bytes(v)),deflate:(v:unknown)=>zlibSync(bytes(v))}};
const axiosRequest=async(config:Raw):Promise<Raw>=>{const url=new URL(String(config.url??''),typeof config.baseURL==='string'?config.baseURL:undefined);for(const [key,value] of Object.entries(object(config.params)))url.searchParams.set(key,String(value));const result=await http(url.href,{method:config.method??'GET',headers:config.headers??{},body:config.data,responseType:config.responseType});return {data:result.body,status:result.status,headers:result.headers};};
const makeAxios=(defaults:Raw={})=>Object.assign((config:Raw)=>axiosRequest({...defaults,...config}),{get:(url:string,options:Raw={})=>axiosRequest({...defaults,...options,url,method:'GET'}),post:(url:string,data:unknown,options:Raw={})=>axiosRequest({...defaults,...options,url,data,method:'POST'}),request:(config:Raw)=>axiosRequest({...defaults,...config}),create:(config:Raw)=>makeAxios({...defaults,...config}),isAxiosError:(error:unknown)=>error instanceof Error});
const axios=makeAxios();
const allowedModules:Record<string,unknown>={axios,'crypto-js':CryptoJS,cheerio};
const requireModule=(name:string):unknown=>{if(name==='@shiqianjiang/ceru-plugin-sdk')return {definePlugin:(entry:unknown)=>entry};if(!(name in allowedModules))throw Error('music-plugin-unsupported-module:'+name);return allowedModules[name];};
const lxRequest=(url:string,options:Raw,callback:Fn)=>{let cancelled=false;void http(url,options??{}).then(response=>{if(!cancelled)callback(null,{statusCode:response.status,headers:response.headers,body:response.body},response.body);}).catch(error=>{if(!cancelled)callback(error,null,null);});return ()=>{cancelled=true;};};
const lx={version:'2.0.0',env:'desktop',currentScriptInfo:{},EVENT_NAMES:{inited:'inited',request:'request',updateAlert:'updateAlert'},on:(name:string,fn:Fn)=>events.set(name,fn),send:(name:string,value:unknown)=>{if(name==='inited')exportValue={...object(value),protocol:'lx'};},request:lxRequest,utils};
const cerumusic={request:async(url:string,options:Raw={})=>{const value=await http(url,options);return {...value,statusCode:value.status};},utils,NoticeCenter:()=>{},version:'1.14.1'};
Object.assign(globalThis,{lx,cerumusic});
// Libraries are prebundled. No arbitrary require, Node or direct fetch exists in this host.
Object.assign(globalThis,{fetch:()=>Promise.reject(Error('music-plugin-direct-network')),XMLHttpRequest:undefined,WebSocket:undefined,EventSource:undefined});
const operation=(id:string)=>({id,signal:controllers.get(id)!.signal,deadlineAt:Date.now()+15000});
async function initialize(code:string):Promise<Raw>{
  if(typeof code!=='string'||code.length>2_000_000)throw Error('music-plugin-invalid');
  providers.clear();events.clear();exportValue={};kind='';
  lx.currentScriptInfo={name:code.match(/@name\s+([^\r\n]+)/)?.[1]?.trim()??'',version:code.match(/@version\s+([^\r\n]+)/)?.[1]?.trim()??'',rawScript:code};
  const module:{exports:unknown}={exports:{}};
  // Only executed inside the dedicated browser Worker; host CSP forbids any network.
  new Function('module','exports','require',code)(module,module.exports,requireModule);
  let exported=module.exports;if(object(exported).default)exported=object(exported).default;
  manifest=object(object(exported).manifest);
  if(manifest.manifestVersion===2){
    const engines=object(manifest.engines);if(typeof engines.hostApi!=='string'||!engines.hostApi.includes('2.'))throw Error('music-plugin-version');
    const contributes=object(manifest.contributes),declared=Array.isArray(contributes.providers)?contributes.providers.map(object):[];
    const ctx={plugin:{id:manifest.id,version:manifest.version,manifest},host:{apiVersion:'2.0.0',mode:'production',libraries:[]},providers:{register:(id:string,implementation:Raw)=>{if(!declared.some(p=>p.id===id)||providers.size>=32)throw Error('music-plugin-invalid');providers.set(id,implementation);return ()=>providers.delete(id);}},http:{request:async(request:Raw)=>{const permissions=Array.isArray(manifest.permissions)?manifest.permissions.map(object):[];if(!permissions.some(p=>p.key===request.permissionKey&&p.name==='network.request'))throw Error('music-plugin-permission');const value=await http(String(request.url),request);return {status:value.status,headers:value.headers,body:value.body,json:async()=>value.body,text:async()=>typeof value.body==='string'?value.body:JSON.stringify(value.body)};}},effects:{add:()=>{}},actions:{register:()=>()=>{}},log:{debug:()=>{},info:()=>{},warn:()=>{},error:()=>{}},modules:{require:requireModule},utils:{crypto:cryptoTools}};
    await method(object(exported).activate??object(exported).logic)(ctx);kind='ceru-v2';exportValue=object(exported);
    const caps=new Set<string>();for(const p of providers.values()){const tracks=object(p.tracks);if(typeof tracks.search==='function')caps.add('search');if(typeof tracks.resolve==='function')caps.add('resolve');if(typeof tracks.lyrics==='function')caps.add('lyrics');if(typeof object(p.playlists).get==='function')caps.add('playlist');}
    return {protocol:kind,name:manifest.name??manifest.id,version:manifest.version,author:manifest.author,platforms:[...providers.keys()],capabilities:[...caps]};
  }
  // LX scripts may fetch configuration before sending their inited event.
  if(!Object.keys(object(exported)).length&&exportValue.protocol!=='lx'){
    const deadline=Date.now()+10000;
    while(exportValue.protocol!=='lx'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
  }
  if(exportValue.protocol==='lx'){if(exportValue.status===false)throw Error(String(exportValue.message||'music-plugin-invalid'));kind='lx';}else{exportValue=object(exported);kind=typeof exportValue.musicUrl==='function'?'ceru-v1':'musicfree';}
  const caps:string[]=[];
  if(kind==='musicfree'){for(const [cap,key] of [['search','search'],['resolve','getMediaSource'],['lyrics','getLyric'],['details','getMusicInfo'],['playlist','importMusicSheet']])if(typeof exportValue[key]==='function')caps.push(cap);if(typeof exportValue.getRecommendSheetsByTag==='function')caps.push('playlist-discover');if(typeof exportValue.getMusicSheetInfo==='function')caps.push('playlist-details');if(!caps.includes('resolve'))throw Error('music-plugin-invalid');return {protocol:kind,name:exportValue.platform,version:exportValue.version,author:exportValue.author,platforms:[exportValue.platform],capabilities:caps};}
  if(!events.has('request')&&kind==='lx')throw Error('music-plugin-invalid');const sources=object(exportValue.sources);if(!Object.keys(sources).length)throw Error('music-plugin-invalid');
  const platforms=Object.keys(sources).filter(key=>kind!=='lx'||(Array.isArray(object(sources[key]).actions)&&(object(sources[key]).actions as unknown[]).includes('musicUrl')));
  if(!platforms.length)throw Error('music-plugin-invalid');
  const qualities=Object.fromEntries(platforms.map(key=>{const declared=object(sources[key]).qualitys;return [key,Array.isArray(declared)?declared.filter(value=>['128k','320k','flac','flac24bit'].includes(String(value))):[]];}));
  caps.push('resolve');if(typeof exportValue.getLyric==='function')caps.push('lyrics');return {protocol:kind,name:object(exportValue.pluginInfo).name??String(code.match(/@name\s+([^\r\n]+)/)?.[1]??'Source').trim(),version:object(exportValue.pluginInfo).version??code.match(/@version\s+([^\r\n]+)/)?.[1]??'',author:object(exportValue.pluginInfo).author??code.match(/@author\s+([^\r\n]+)/)?.[1]??'',platforms,qualities,capabilities:caps};
}
async function invoke(action:string,args:unknown[],id:string):Promise<unknown>{
  if(action==='init')return initialize(String(args[0]));
  const op=operation(id);
  if(kind==='musicfree'){
    if(action==='search')return method(exportValue.search)(args[0],args[1],'music');
    if(action==='resolve')return method(exportValue.getMediaSource)(args[0],args[1]);
    if(action==='lyrics')return method(exportValue.getLyric)(args[0]);
    if(action==='details')return method(exportValue.getMusicInfo)(args[0]);
    if(action==='playlist')return method(exportValue.importMusicSheet)(args[0]);
    if(action==='playlist-categories')return typeof exportValue.getRecommendSheetTags==='function'?method(exportValue.getRecommendSheetTags)():{pinned:[],data:[]};
    if(action==='playlist-discover')return method(exportValue.getRecommendSheetsByTag)(args[0],args[1]);
    if(action==='playlist-details')return method(exportValue.getMusicSheetInfo)(args[0],args[1]);
  }else if(kind==='lx'){return method(events.get('request'))({source:args[0],action:action==='resolve'?'musicUrl':action==='lyrics'?'lyric':'pic',info:{type:args[2],musicInfo:args[1]}});}
  else if(kind==='ceru-v1'){return method(exportValue[action==='resolve'?'musicUrl':action==='lyrics'?'getLyric':'getPic'])(...args);}
  else if(kind==='ceru-v2'){
    const provider=providers.get(String(args[0]));if(!provider)throw Error('music-plugin-invalid-provider');const tracks=object(provider.tracks);
    if(action==='search'){const key=String(args[0])+':'+String(args[1]),page=Number(args[2]);if(page>1&&!cursors.has(key+':'+page))throw Error('music-plugin-cursor');const result=object(await method(tracks.search)({query:args[1],kinds:['track'],filters:{},limit:30,cursor:page>1?cursors.get(key+':'+page):undefined},op));if(typeof result.nextCursor==='string'&&result.nextCursor)cursors.set(key+':'+(page+1),result.nextCursor);return result;}
    if(action==='resolve')return method(tracks.resolve)(args[1],args[2],op);
    if(action==='lyrics')return method(tracks.lyrics)(args[1],op);
    if(action==='playlist')return method(object(provider.playlists).get)(args[1],undefined,op);
  }
  throw Error('music-plugin-unsupported-capability');
}
globalThis.onmessage=async event=>{
  const message=object(event.data);
  if(message.kind==='http-result'){const pending=httpPending.get(Number(message.id));if(pending){httpPending.delete(Number(message.id));if(message.error)pending.reject(Error(String(message.error)));else pending.resolve(message.value);}return;}
  const id=String(message.id);activeId=id;controllers.set(id,new AbortController());
  try{const value=await invoke(String(message.action),Array.isArray(message.args)?message.args:[],id);postMessage({kind:'result',id,value});}
  catch(error){postMessage({kind:'result',id,error:error instanceof Error?error.message:String(error)});}
  finally{controllers.delete(id);}
};
postMessage({kind:'ready'});
