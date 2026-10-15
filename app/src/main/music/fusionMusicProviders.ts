/* FloatIsland - https://github.com/yanhaoran01/FloatIsland; Copyright (C) 2026 contributors. GPL-3.0. Listen 1 adapters: MIT, copyright Listen 1. */
/** @file fusionMusicProviders.ts @description Executes only pinned adapters with anonymous bounded HTTP and real errors. @author 鸡哥 */
import {readFileSync} from 'fs';
import {join} from 'path';
import {runInNewContext} from 'vm';
import forge from 'node-forge';
import {load as loadHtml} from 'cheerio';
import {musicQualityTiers} from './musicQuality';
import {playlistReference} from './musicPlaylistInput';
import type {MusicTrack,BuiltinMusicProvider,MusicSearchResult,RemoteMusicPlaylist,MusicPlaylistPreview,MusicQuality} from '../../preload/types/fusionMusic';
import {normalizeMusicTrack} from './fusionMusicModel';
type Online=BuiltinMusicProvider;
type Raw=Record<string,unknown>;
type Adapter={show_playlist:(url:string)=>{success:(fn:(value:Raw)=>void)=>void};get_playlist:(url:string)=>{success:(fn:(value:Raw)=>void)=>void};get_playlist_filters:()=>Raw|{success:(fn:(value:Raw)=>void)=>void};search:(url:string)=>{success:(fn:(value:Raw)=>void)=>void};bootstrap_track:(track:Raw,success:(value:Raw)=>void,failure:()=>void)=>void;lyric:(url:string)=>{success:(fn:(value:Raw)=>void)=>void};ne_ensure_cookie?:(callback:()=>void)=>void;htmlDecode?:(value:string)=>string;};
export interface MusicStream {url:string;format:string;bitrate:number|null;headers?:Record<string,string>;sourceId?:string;track?:MusicTrack;}
/** Only official API/CDN hosts returned by fixed provider modules may be requested. */
export function musicRemoteUrl(raw:string):string {
  const url=new URL(raw.startsWith('//')?'https:'+raw:raw);
  if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.port&&url.port!=='80'&&url.port!=='443'||!['163.com','126.net','qq.com','gtimg.cn','gtimg.com','migu.cn','cmvideo.cn','kuwo.cn','kugou.com','kgimg.com','kugou.net','taihe.com','qianqian.com','baidu.com','bdstatic.com'].some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain)))throw Error('music-invalid-source');
  return url.href;
}
/** Adapts pinned callback APIs without exposing arbitrary provider method calls. */
export class MusicProviders {
  constructor(private directory:string,private request:(url:string,options:RequestInit)=>Promise<Response>=fetch){}
  private call<T>(provider:Online,signal:AbortSignal,invoke:(adapter:Adapter,resolve:(value:T)=>void,reject:(error:Error)=>void)=>void,quality='128'):Promise<T>{
    if(!['netease','qq','migu','kuwo','kugou','qianqian'].includes(provider))return Promise.reject(Error('music-invalid-provider'));
    return new Promise<T>((resolve,reject)=>{
      let done=false;const controller=new AbortController();
      const finish=(error:Error|null,value?:T)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);controller.abort();if(error)reject(error);else resolve(value!);};
      const abort=()=>finish(Error('music-cancelled')),timer=setTimeout(()=>finish(Error('music-timeout')),15000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
      const rejectCall=(error:unknown)=>finish(error instanceof Error&&error.name!=='TypeError'?error:Error('music-invalid-response'));
      // The compatibility chain catches network AND upstream callback errors; no unhandled rejections.
      const chain=(promise:Promise<unknown>):unknown=>({then:(fn:(value:unknown)=>unknown)=>{const next=promise.then(fn);void next.catch(rejectCall);return chain(next);},catch:(fn:(error:unknown)=>unknown)=>chain(promise.catch(fn))});
      const http=(method:string,raw:string,body?:unknown,config?:{headers?:Record<string,string|number>})=>chain((async()=>{
        const url=musicRemoteUrl(raw),headers=new Headers({'User-Agent':'Mozilla/5.0','Referer':provider==='netease'?'https://music.163.com/':provider==='qq'?'https://y.qq.com/':'https://music.migu.cn/'});
        for(const [name,value] of Object.entries(config?.headers??{}))if(!/cookie|authorization/i.test(name))headers.set(name,String(value));
        let encoded:string|undefined;if(body!==undefined){encoded=body instanceof URLSearchParams?body.toString():typeof body==='string'?body:JSON.stringify(body);headers.set('Content-Type',body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json');}
        if(provider==='netease')headers.set('Cookie','os=pc'); // Anonymous platform preference; no user cookie store.
        const response=await this.request(url,{method,headers,body:encoded,signal:controller.signal,redirect:'error',credentials:'omit'});
        if(!response.ok)throw Error('music-http-'+response.status);const content=await response.text();if(content.length>5_000_000)throw Error('music-response-too-large');
        let data:unknown=content;try{data=JSON.parse(content);}catch{/* Lyrics may be plain text. */}
        if(data&&typeof data==='object'&&!Array.isArray(data)){
          const value=data as Raw,code=value.code;
          if(provider==='netease'&&typeof code==='number'&&code!==200){
            if(code===-462||code===301)throw Error('music-login-required');
            throw Error('music-service-rejected');
          }
          if(provider==='qq'&&typeof code==='number'&&code!==0)throw Error('music-service-rejected');
        }
        // Validate the API envelope BEFORE the pinned callback reads nested song lists.
        if(provider==='netease'&&url.includes('/search/')){
          const value=data as {result?:Raw};
          if(!value?.result)throw Error('music-invalid-response');
          const playlist=body instanceof URLSearchParams&&body.get('type')==='1000',key=playlist?'playlists':'songs',count=playlist?'playlistCount':'songCount';
          if(!Array.isArray(value.result[key])){if(value.result[count]===0)value.result[key]=[];else throw Error('music-invalid-response');}
        }
        if(provider==='qq'&&body&&typeof body==='object'&&'req' in body){
          const value=data as {req?:{code?:number;data?:{body?:Record<string,{list?:unknown[]}>}}},request=body as {req?:{param?:{search_type?:number}}};
          if(value.req?.code&&value.req.code!==0)throw Error('music-service-rejected');
          if(!Array.isArray(value.req?.data?.body?.[request.req?.param?.search_type===3?'songlist':'song']?.list))throw Error('music-invalid-response');
        }
        if(provider==='migu'&&url.includes('/search/')&&!Array.isArray(data))throw Error('music-service-rejected');
        if(provider==='netease'&&url.includes('player/url')&&data&&typeof data==='object'){
          const items=(data as {data?:{freeTrialInfo?:unknown}[]}).data;if(items?.[0]?.freeTrialInfo)throw Error('music-preview-only');
        }
        return {data,request:{responseURL:url}};
      })());
      try{
        const moduleName=provider==='qianqian'?'taihe':provider;
        let source=readFileSync(join(this.directory,moduleName+'.js'),'utf8');
        if(provider==='netease')source=source.replace('br: 999000,','br: '+(quality==='128'?128000:quality==='320'?320000:999000)+',');
        if(provider==='qq')source=source.replace("const fileType = '128';",'const fileType = '+JSON.stringify(quality)+';');
        const parallel=(tasks:((callback:(error:unknown,value:unknown)=>void)=>void)[],complete:(error:null,values:unknown[])=>void)=>{void Promise.all(tasks.map(task=>new Promise<unknown>((resolve,reject)=>task((error,value)=>error?reject(error):resolve(value))))).then(values=>complete(null,values)).catch(rejectCall);};
        const concat=(items:unknown[],worker:(item:unknown,callback:(error:unknown,result:unknown[])=>void)=>void,complete:(error:null,results:unknown[])=>void)=>{if(!Array.isArray(items)||items.length>100)throw Error('music-response-too-large');void Promise.all(items.map(item=>new Promise<unknown[]>((resolve,reject)=>worker(item,(error,result)=>error?reject(error):resolve(result))))).then(results=>complete(null,results.flat())).catch(rejectCall);};
        class HtmlParser {parseFromString(html:string){const $=loadHtml(html),wrap=(element:Parameters<typeof $>[0]):unknown=>{const node=$(element);return {children:node.children().toArray().map(child=>wrap(child)),getElementsByTagName:(tag:string)=>node.find(tag).toArray().map(child=>wrap(child)),src:node.attr('src')||'',href:node.attr('href')||'',title:node.attr('title')||''};};return {getElementsByClassName:(name:string)=>$('.'+name).toArray().map(element=>wrap(element))};}}
        const axios={get:(url:string,config?:{headers?:Record<string,string|number>})=>http('GET',url,undefined,config),post:(url:string,body:unknown,config?:{headers?:Record<string,string|number>})=>http('POST',url,body,config),create:(defaults:{baseURL:string})=>{let intercept:(value:{params:Record<string,unknown>})=>{params:Record<string,unknown>}=v=>v;return {interceptors:{request:{use:(fn:typeof intercept)=>{intercept=fn;}}},get:(path:string,config:{params?:Record<string,unknown>}={})=>{const value=intercept({params:config.params??{}}),url=new URL(defaults.baseURL+path);for(const [key,item] of Object.entries(value.params))url.searchParams.set(key,String(item));return http('GET',url.href);}};}};
        const adapter=runInNewContext(source+'\n;'+moduleName,{forge,URL,URLSearchParams,btoa,atob,async:{parallel,concat},DOMParser:HtmlParser,console:{log:()=>{},warn:()=>{}},axios,getParameterByName:(name:string,url:string)=>new URL(url,'https://adapter.invalid').searchParams.get(name),cookieSet:(_value:unknown,callback:()=>void)=>callback()}, {timeout:1000}) as Adapter;
        if(provider==='netease')adapter.ne_ensure_cookie=callback=>callback();
        if(provider==='qq')adapter.htmlDecode=value=>String(value).replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
        invoke(adapter,value=>finish(null,value),error=>finish(error));
      }catch(error){rejectCall(error);}
    });
  }
  /** Queries explicit provider pages; never silently treats a network error as an empty catalog. */
  async search(provider:Online,query:string,page:number,signal:AbortSignal):Promise<MusicSearchResult>{
    if(typeof query!=='string'||!query.trim()||query.length>200||!Number.isInteger(page)||page<1||page>100)throw Error('music-invalid-query');
    const data=await this.call<Raw>(provider,signal,(p,resolve)=>p.search('?'+new URLSearchParams({keywords:query.trim(),curpage:String(page),type:'0'})).success(resolve));
    if(!Array.isArray(data.result))throw Error('music-invalid-response');
    const tracks=data.result.flatMap((value:Raw)=>{const track=normalizeMusicTrack({id:value.id,provider,title:value.title,artist:value.artist,album:value.album,cover:value.img_url,availability:provider==='netease'&&value.url===''?'restricted':'unknown',extra:{contentId:String(value.content_id??''),quality:value.quality,lyricUrl:value.lyric_url,translationUrl:value.tlyric_url}});return track?[track]:[];});
    // Migu's upstream placeholder total (1000) is not an actual catalog count.
    const total=provider==='migu'?(page-1)*20+tracks.length+(tracks.length===20?1:0):typeof data.total==='number'?data.total:tracks.length;
    return {tracks,total};
  }
  /** Tries anonymously available quality tiers, never escalating account permissions. */
  async resolve(track:MusicTrack,signal:AbortSignal,quality:MusicQuality='auto'):Promise<MusicStream>{
    if(track.provider==='local'||track.provider.startsWith('plugin:'))throw Error('music-invalid-provider');if(track.availability==='restricted')throw Error('music-restricted');
    const provider=track.provider as BuiltinMusicProvider;
    // LX songmid and Migu's playback content_id are different namespaces.
    // Resolve by the exact copyright ID from the anonymous original catalog.
    if(provider==='migu'&&!track.extra?.contentId){
      const catalog=await this.search(provider,track.title,1,signal),match=catalog.tracks.find(item=>item.id===track.id);
      if(!match?.extra?.contentId)throw Error('music-unavailable');
      track={...track,extra:{...track.extra,...match.extra,data:track.extra?.data}};
    }
    const raw:Raw={id:track.id,content_id:track.extra?.contentId,quality:track.extra?.quality};
    if(provider==='kugou'&&track.extra?.data?.hash)raw.id='kgtrack_'+track.extra.data.hash;
    if(provider==='qianqian')raw.id='thtrack_'+String(track.extra?.data?.songmid??track.id.split('_').at(-1));
    const levels=track.provider==='qq'?musicQualityTiers(quality,'qq'):track.provider==='migu'?musicQualityTiers(quality,'migu'):quality==='standard'?['128']:quality==='high'?['320']:['default'];
    let failure:unknown=Error('music-unavailable');
    for(const level of levels){signal.throwIfAborted();try{
      const result=await this.call<Raw>(provider,signal,(p,resolve,reject)=>p.bootstrap_track({...raw,...(track.provider==='migu'?{quality:level}:{})},resolve,()=>reject(Error('music-unavailable'))),level);
      if(typeof result.url!=='string')throw Error('music-unavailable');const url=musicRemoteUrl(result.url);
      // Labels in Listen 1 may be request tiers rather than measured media: keep bitrate unknown.
      return {url,format:'',bitrate:null};
    }catch(error){failure=error;if(signal.aborted)throw error;}}
    throw failure;
  }
  /** Lists real public playlists through the pinned adapter; empty catalogs retain unverified status. */
  async discover(provider:Online,category:string,page:number,signal:AbortSignal):Promise<{playlists:RemoteMusicPlaylist[];hasMore:boolean}>{
    if(!['netease','qq'].includes(provider)||!Number.isInteger(page)||page<1||page>100||typeof category!=='string'||category.length>100)throw Error('music-invalid-query');
    const response=await this.call<Raw>(provider,signal,(adapter,resolve)=>adapter.show_playlist('?'+new URLSearchParams({filter_id:category,offset:String((page-1)*(provider==='netease'?35:30))})).success(resolve));
    if(!Array.isArray(response.result))throw Error('music-invalid-response');const playlists=response.result.flatMap(value=>{const item=value as Raw;if(typeof item.id!=='string'||typeof item.title!=='string')return [];let url='';try{url=musicRemoteUrl(String(item.source_url));}catch{return [];}return [{id:item.id,sourceId:'builtin:'+provider,name:item.title.slice(0,200),cover:typeof item.cover_img_url==='string'?item.cover_img_url:'',url}];});return {playlists,hasMore:response.result.length>=(provider==='netease'?35:30)};
  }
  /** Searches real public playlist catalogs through the same pinned adapters. */
  async searchPlaylists(provider:Online,query:string,page:number,signal:AbortSignal):Promise<{playlists:RemoteMusicPlaylist[];hasMore:boolean}>{
    if(!['netease','qq'].includes(provider)||typeof query!=='string'||!query.trim()||query.length>200||!Number.isInteger(page)||page<1||page>100)throw Error('music-invalid-query');
    const response=await this.call<Raw>(provider,signal,(adapter,resolve)=>adapter.search('?'+new URLSearchParams({keywords:query.trim(),curpage:String(page),type:'1'})).success(resolve));
    if(!Array.isArray(response.result))throw Error('music-invalid-response');
    const playlists=response.result.flatMap(value=>{const item=value as Raw;if(typeof item.id!=='string'||typeof item.title!=='string')return [];let url='';try{url=musicRemoteUrl(String(item.source_url));}catch{return [];}return [{id:item.id,sourceId:'builtin:'+provider,name:item.title.slice(0,200),cover:typeof item.img_url==='string'?item.img_url:'',url,count:typeof item.count==='number'?item.count:undefined}];});
    return {playlists,hasMore:page*(provider==='netease'?20:50)<Number(response.total)};
  }
  /** Returns provider categories using callback and synchronous variants. */
  async playlistCategories(provider:Online,signal:AbortSignal):Promise<Array<{id:string;name:string}>>{
    const result=await this.call<Raw>(provider,signal,(adapter,resolve)=>{const value=adapter.get_playlist_filters();if(typeof value.success==='function')value.success(resolve);else resolve(value as Raw);});
    const groups=Array.isArray(result.all)?result.all:[],items=[...(Array.isArray(result.recommend)?result.recommend:[]),...groups.flatMap(group=>Array.isArray((group as Raw).filters)?(group as Raw).filters as unknown[]:[])];return [...new Map(items.flatMap(value=>{const item=value as Raw;return typeof item.name==='string'&&(typeof item.id==='string'||typeof item.id==='number')?[[String(item.id),{id:String(item.id),name:item.name.slice(0,100)}] as const]:[];})).values()];
  }
  /** Loads preview tracks without adding a playlist or starting playback. */
  async playlist(provider:Online,reference:string,signal:AbortSignal):Promise<Omit<MusicPlaylistPreview,'id'>>{
    const parsed=playlistReference(reference);if(!parsed||parsed.sourceId!=='builtin:'+provider)throw Error('music-invalid-source');
    const result=await this.call<Raw>(provider,signal,(adapter,resolve)=>adapter.get_playlist('?'+new URLSearchParams({list_id:parsed.id})).success(resolve));
    if(!Array.isArray(result.tracks)||!result.info||typeof result.info!=='object')throw Error('music-invalid-response');if(result.tracks.length>10000)throw Error('music-response-too-large');const info=result.info as Raw;
    const tracks=result.tracks.flatMap(value=>{const item=value as Raw,track=normalizeMusicTrack({id:item.id,provider,title:item.title,artist:item.artist,album:item.album,cover:item.img_url,sourceId:'builtin:'+provider,availability:item.url===''?'restricted':'unknown'});return track?[track]:[];});
    return {playlist:{id:parsed.id,sourceId:parsed.sourceId,name:String(info.title||parsed.id).slice(0,200),cover:typeof info.cover_img_url==='string'?info.cover_img_url:'',url:parsed.url,count:result.tracks.length},tracks,invalid:result.tracks.length-tracks.length};
  }
  /** Lyrics use the same pinned provider and cancellation policy. */
  async lyrics(track:MusicTrack,signal:AbortSignal):Promise<string>{
    if(track.provider==='local'||track.provider.startsWith('plugin:'))return '';
    const params=new URLSearchParams({track_id:track.id,...(track.provider==='migu'?{lyric_url:track.extra?.lyricUrl||'null',tlyric_url:track.extra?.translationUrl||''}:{})});
    if(track.provider==='kugou'&&track.extra?.data?.hash)params.set('track_id','kgtrack_'+track.extra.data.hash);
    const data=await this.call<Raw>(track.provider as BuiltinMusicProvider,signal,(p,resolve)=>p.lyric('?'+params).success(resolve));
    return typeof data.lyric==='string'?data.lyric.slice(0,500000):'';
  }
}
