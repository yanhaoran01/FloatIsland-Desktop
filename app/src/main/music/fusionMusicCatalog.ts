/* FloatIsland contributors, GPL-3.0. LX Music modules: Apache-2.0, copyright lyswhut and contributors. */
/** @file fusionMusicCatalog.ts @description Runs pinned LX catalog modules with bounded anonymous requests. @author 鸡哥 */
import {readFileSync} from 'fs';
import {join} from 'path';
import * as crypto from 'crypto';
import {runInNewContext} from 'vm';
import type {BuiltinMusicProvider,MusicTrack,MusicSearchResult} from '../../preload/types/fusionMusic';
import {normalizeMusicTrack} from './fusionMusicModel';
import {musicRemoteUrl} from './fusionMusicProviders';
const codes:Record<BuiltinMusicProvider,string>={netease:'wy',qq:'tx',migu:'mg',kuwo:'kw',kugou:'kg',qianqian:'bd'};
type Raw=Record<string,unknown>;
type Catalog={search:(query:string,page:number,limit?:number)=>Promise<{list:Raw[];total:number;limit:number}>};
/** Keeps original provider IDs useful to LX/Ceru resolvers and legacy favorites. */
export function lxMusicTrack(provider:BuiltinMusicProvider,raw:Raw):MusicTrack|null{
  const code=codes[provider],rawId=provider==='migu'?raw.copyrightId:raw.songmid;
  const id=(provider==='netease'?'netrack_':provider==='qq'?'qqtrack_':provider==='migu'?'mgtrack_':code+'track_')+String(rawId??'');
  let duration=Number(raw._interval)||0;if(!duration&&typeof raw.interval==='string'){const parts=raw.interval.split(':').map(Number);duration=parts.length===2?parts[0]*60+parts[1]:Number(raw.interval);}
  return normalizeMusicTrack({id,provider,sourceId:'builtin:'+provider,title:raw.name,artist:raw.singer,album:raw.albumName,cover:raw.img,availability:'unknown',duration,extra:{contentId:provider==='migu'?'':String(raw.songmid??''),lyricUrl:raw.lrcUrl,translationUrl:raw.trcUrl,data:raw}});
}
/** Only the committed, packaged LX modules enter this VM; imported plugins never enter Node. */
export class LxMusicCatalog {
  constructor(private directory:string,private request:(url:string,options:RequestInit)=>Promise<Response>=fetch){}
  async search(provider:BuiltinMusicProvider,query:string,page:number,signal:AbortSignal):Promise<MusicSearchResult>{
    if(!codes[provider]||!query.trim()||query.length>200||!Number.isInteger(page)||page<1||page>100)throw Error('music-invalid-query');
    const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();const timer=setTimeout(abort,15000);
    const read=(path:string)=>readFileSync(join(this.directory,path),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'');
    const httpFetch=(raw:string,options:{method?:string;headers?:Record<string,string>;body?:unknown;form?:Record<string,string>}={})=>({promise:(async()=>{
      const url=musicRemoteUrl(raw),headers=new Headers({'User-Agent':'Mozilla/5.0',...options.headers});headers.delete('Cookie');headers.delete('Authorization');
      let body:string|undefined;if(options.form){body=new URLSearchParams(options.form).toString();headers.set('Content-Type','application/x-www-form-urlencoded');}else if(options.body!==undefined){body=JSON.stringify(options.body);headers.set('Content-Type','application/json');}
      const response=await this.request(url,{method:options.method??'GET',headers,body,signal:controller.signal,redirect:'error',credentials:'omit'});if(!response.ok)throw Error('music-http-'+response.status);
      const text=await response.text();if(text.length>5_000_000)throw Error('music-response-too-large');let value:unknown;try{value=JSON.parse(text);}catch{throw Error('music-invalid-response');}
      if(value&&typeof value==='object'&&'code' in value&&((value as Raw).code===-462||(value as Raw).code===301))throw Error('music-login-required');return {body:value};
    })()});
    const code=codes[provider],extras=code==='wy'?read('wy/utils/crypto.js')+'\n'+read('wy/utils/index.js'):code==='tx'?read('tx/utils/crypto.js')+'\n'+read('tx/utils/index.js'):'';
    const source=extras+'\n'+read(code+'/musicSearch.js').replace('default {','const catalog = {')+'\n;catalog';
    const formatPlayTime=(value:number)=>Math.floor(value/60)+':'+String(Math.floor(value%60)).padStart(2,'0');
    try{
      const catalog=runInNewContext(source,{crypto,Buffer,httpFetch,createCipheriv:crypto.createCipheriv,createDecipheriv:crypto.createDecipheriv,publicEncrypt:crypto.publicEncrypt,randomBytes:crypto.randomBytes,createHash:crypto.createHash,constants:crypto.constants,formatPlayTime,sizeFormate:(n:number)=>String(n),decodeName:(n:unknown)=>String(n??'').replace(/&amp;/g,'&').replace(/&quot;/g,'"'),formatSinger:(s:string)=>s.replace(/&/g,'、'),formatSingerName:(s:Raw[],key='name')=>s.map(x=>x[key]).join('、'),toMD5:(s:string)=>crypto.createHash('md5').update(s).digest('hex'),console:{log:()=>{}}},{timeout:1000}) as Catalog;
      const result=await Promise.race([catalog.search(query.trim(),page),new Promise<never>((_,reject)=>{if(controller.signal.aborted)reject(Error('music-cancelled'));else controller.signal.addEventListener('abort',()=>reject(Error(signal.aborted?'music-cancelled':'music-timeout')),{once:true});})]);
      if(!Array.isArray(result?.list)||!Number.isFinite(result.total))throw Error('music-invalid-response');
      const tracks=result.list.flatMap(raw=>{const track=lxMusicTrack(provider,raw);return track?[track]:[];});return {tracks,total:result.total,hasMore:page*result.limit<result.total};
    }catch(error){if(signal.aborted)throw Error('music-cancelled');throw error instanceof Error?error:Error('music-invalid-response');}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);controller.abort();}
  }
}
