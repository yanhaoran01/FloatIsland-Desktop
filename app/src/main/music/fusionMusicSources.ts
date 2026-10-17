/* FloatIsland contributors, GPL-3.0. */
/** @file fusionMusicSources.ts @description Versioned dynamic catalogs/resolvers, atomic plugin imports and strict fallback. @author 鸡哥 */
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'fs';
import {join} from 'path';
import {createHash,randomUUID} from 'crypto';
import type {BuiltinMusicProvider,MusicSource,MusicTrack,MusicCapability,MusicSearchResult,MusicSourceCommand,RemoteMusicPlaylist,MusicPlaylistPreview,MusicQuality} from '../../preload/types/fusionMusic';
import {musicQualityTiers} from './musicQuality';
import {MusicProviders,type MusicStream} from './fusionMusicProviders';
import {LxMusicCatalog} from './fusionMusicCatalog';
import {MusicPluginHost,publicMusicUrl,publicMusicRequest,musicResponseText,musicPluginHeaders} from './fusionMusicPluginHost';
import {normalizeMusicTrack} from './fusionMusicModel';
import {identicalMusic,searchMusicSources} from './fusionMusicMatching';
import {PublicMusicCatalog,PUBLIC_MUSIC_PROVIDERS,type PublicMusicProvider} from './publicMusicCatalog';
type Raw=Record<string,unknown>;
const raw=(v:unknown):Raw=>v&&typeof v==='object'&&!Array.isArray(v)?v as Raw:{};
const providers:BuiltinMusicProvider[]=['netease','qq','migu','kuwo','kugou','qianqian'];
const codes:Record<string,string>={netease:'wy',qq:'tx',migu:'mg',kuwo:'kw',kugou:'kg',qianqian:'bd'};
const healthy=():MusicSource['health']=>({playlist:'unknown',download:'unknown',search:'unknown',playback:'unknown',lyrics:'unknown',error:''});
interface StoredSource {source:MusicSource;code:string;catalogsLinked?:boolean;previous?:{code:string;source:MusicSource};}
/** Owns packaged catalog code and imported sandbox instances, never arbitrary Node scripts. */
export class MusicSources {
  private records:StoredSource[]=[];private hosts=new Map<string,MusicPluginHost>();private payloads=new Map<string,Raw>();private tracks=new Map<string,MusicTrack>();private file:string;
  private playlistPayloads=new Map<string,Raw>();private catalog:LxMusicCatalog;private legacy:MusicProviders;
  private publicCatalog=new PublicMusicCatalog();
  constructor(directory:string,vendor:string,request:(url:string,options:RequestInit)=>Promise<Response>,private changed:(sources:MusicSource[])=>void){
    this.file=join(directory,'music-sources-v1.json');this.catalog=new LxMusicCatalog(join(vendor,'lx'),request);this.legacy=new MusicProviders(join(vendor,'listen1'),request);
    try{const value=JSON.parse(readFileSync(this.file,'utf8'));if(value.version===1&&Array.isArray(value.sources))for(const record of value.sources){if(record?.source&&typeof record.source.id==='string'&&typeof record.code==='string'&&record.code.length<=2_000_000&&Array.isArray(record.source.capabilities)&&Array.isArray(record.source.platforms))this.records.push(record);}}catch{/* Isolated from settings and the existing library. */}
    let verification:Record<string,boolean>={};try{verification=JSON.parse(readFileSync(join(vendor,'verified-sources.json'),'utf8'));}catch{/* Unknown sources stay unverified. */}
    for(const provider of providers)if(!this.records.some(r=>r.source.id==='builtin:'+provider)){this.records.push({source:{id:'builtin:'+provider,name:provider,protocol:'builtin',version:'LX ad95d509 / Listen1 v2.33.0',author:'lyswhut / Listen 1',enabled:verification[provider]===true,priority:this.records.length,platforms:[codes[provider]],capabilities:['search','resolve','lyrics'],health:healthy(),origin:'bundled',sha256:'',license:'Apache-2.0 / MIT',updatedAt:0},code:''});}
    for(const provider of PUBLIC_MUSIC_PROVIDERS)if(!this.records.some(r=>r.source.id==='builtin:'+provider))this.records.push({source:{id:'builtin:'+provider,name:provider,protocol:'builtin',version:'1',author:provider==='archive'?'Internet Archive':'Audius',enabled:true,priority:this.records.length,platforms:[provider],capabilities:['search','resolve'],health:healthy(),origin:provider==='archive'?'https://archive.org':'https://audius.co',sha256:'',license:'Catalog API; track terms apply',updatedAt:0},code:''});
    for(const record of this.records){record.source.health={...healthy(),...record.source.health};if(record.source.protocol==='builtin'&&['netease','qq'].includes(record.source.name))record.source.capabilities=[...new Set([...record.source.capabilities,'playlist','playlist-discover','playlist-details'] as MusicCapability[])];}
    for(const record of this.records)if(record.source.protocol==='lx'&&record.source.enabled&&!record.catalogsLinked){this.linkCatalogs(record);}
  }
  /** Returns metadata only; script content and temporary addresses never reach application views. */
  list():MusicSource[]{return this.records.map(r=>structuredClone(r.source)).sort((a,b)=>a.priority-b.priority);}
  /** Retains identities hidden by same-song aggregation for explicit selection and fallback. */
  knownTrack(id:string):MusicTrack|undefined{return this.tracks.get(id);}
  private save():void{mkdirSync(join(this.file,'..'),{recursive:true});writeFileSync(this.file+'.tmp',JSON.stringify({version:1,sources:this.records}));renameSync(this.file+'.tmp',this.file);this.changed(this.list());}
  private record(id:string):StoredSource{const record=this.records.find(r=>r.source.id===id);if(!record)throw Error('music-source-missing');return record;}
  private linkCatalogs(record:StoredSource):void{for(const catalog of this.records)if(catalog.source.protocol==='builtin'&&catalog.source.platforms.some(platform=>record.source.platforms.includes(platform)))catalog.source.enabled=true;record.catalogsLinked=true;}
  private host(record:StoredSource):MusicPluginHost{let host=this.hosts.get(record.source.id);if(!host){host=new MusicPluginHost(record.code);this.hosts.set(record.source.id,host);}return host;}
  private status(id:string,cap:'search'|'playback'|'lyrics'|'playlist'|'download',error=''):void{const record=this.records.find(r=>r.source.id===id);if(!record)return;record.source.health[cap]=error?'failed':'passed';record.source.health.error=error;this.save();}
  /** Playback is marked passed only after the persistent player confirms natural completion. */
  complete(id:string):void{this.status(id,'playback');}
  /** Marks download capability only after verified output is committed. */
  downloaded(id:string):void{this.status(id,'download');}
  fail(id:string,error:string):void{this.status(id,'playback',error);}
  private async parse(codeInput:string,origin:string,signal:AbortSignal,id:string=randomUUID()):Promise<StoredSource>{
    let code=codeInput;
    try{const pack=JSON.parse(codeInput);if(pack&&typeof pack==='object'&&pack.manifest&&typeof pack.code==='string')code='module.exports = '+pack.code+';';}catch{/* Plain JS is the legacy format. */}
    const host=new MusicPluginHost(code);try{const info=raw(await host.call('init',[],signal));if(!['musicfree','lx','ceru-v1','ceru-v2'].includes(String(info.protocol)))throw Error('music-plugin-version');
      const capabilities=(Array.isArray(info.capabilities)?info.capabilities:[]).filter((c):c is MusicCapability=>['search','resolve','lyrics','details','playlist','playlist-discover','playlist-details'].includes(String(c)));
      if(!capabilities.includes('resolve')&&!capabilities.includes('search'))throw Error('music-plugin-invalid');const platforms=Array.isArray(info.platforms)?info.platforms.map(String).filter(p=>p&&p.length<160):[];if(!platforms.length)throw Error('music-plugin-invalid');
      const qualities=Object.fromEntries(Object.entries(raw(info.qualities)).map(([platform,values])=>[platform,Array.isArray(values)?values.filter((v):v is string=>typeof v==='string'&&['128k','320k','flac','flac24bit'].includes(v)):[]]));
      return {code,source:{id,name:String(info.name??'Source').slice(0,100),version:String(info.version??'').slice(0,100),author:String(info.author??'').slice(0,100),protocol:info.protocol as MusicSource['protocol'],enabled:true,priority:this.records.length,platforms,capabilities,qualities,health:healthy(),origin,sha256:createHash('sha256').update(code).digest('hex'),license:String(info.license??'not declared'),updatedAt:Date.now()}};
    }finally{host.dispose();}
  }
  private async download(urlInput:string,signal:AbortSignal):Promise<string>{const url=await publicMusicUrl(urlInput);if(!url.startsWith('https:'))throw Error('music-plugin-https-required');const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,15000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();try{const response=await publicMusicRequest(url,{signal:controller.signal});if(!response.ok){await response.body?.cancel();throw Error('music-http-'+response.status);}return await musicResponseText(response,2_000_000);}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);controller.abort();}}
  /** Stages all subscription entries before committing; a failed import preserves the installed set. */
  async import(code:string,origin:string,signal:AbortSignal):Promise<MusicSource[]>{
    let payload:unknown;try{payload=JSON.parse(code);}catch{/* JS import. */}
    const root=raw(payload),entries=Array.isArray(root.plugins)?root.plugins:Array.isArray(root.sources)?root.sources:null;const staged:StoredSource[]=[];
    if(entries){if(entries.length>20||!entries.length)throw Error('music-plugin-invalid');for(const entry of entries){signal.throwIfAborted();const url=typeof entry==='string'?entry:raw(entry).url;if(typeof url!=='string')throw Error('music-plugin-invalid');staged.push(await this.parse(await this.download(url,signal),url,signal));}}
    else staged.push(await this.parse(code,origin,signal));
    for(const record of staged){const existing=this.records.find(r=>r.source.sha256===record.source.sha256);if(existing)continue;record.source.priority=this.records.length;this.records.push(record);
      if(record.source.protocol==='lx')this.linkCatalogs(record);
    }this.save();return this.list();
  }
  async importUrl(url:string,signal:AbortSignal):Promise<MusicSource[]>{return this.import(await this.download(url,signal),url,signal);}
  async control(id:string,command:MusicSourceCommand,value?:number,signal:AbortSignal=new AbortController().signal):Promise<MusicSource[]>{
    const record=this.record(id);
    if(command==='enable')record.source.enabled=true;else if(command==='disable'){record.source.enabled=false;this.hosts.get(id)?.dispose();this.hosts.delete(id);}
    else if(command==='move'){if(!Number.isInteger(value)||value!<0||value!>=this.records.length)throw Error('music-invalid-value');const sorted=[...this.records].sort((a,b)=>a.source.priority-b.source.priority),at=sorted.indexOf(record);sorted.splice(value!,0,...sorted.splice(at,1));sorted.forEach((r,i)=>r.source.priority=i);}
    else if(command==='delete'){if(record.source.protocol==='builtin')throw Error('music-source-builtin');this.hosts.get(id)?.dispose();this.hosts.delete(id);this.records=this.records.filter(r=>r!==record);}
    else if(command==='rollback'){if(!record.previous)throw Error('music-source-no-backup');const previous=record.previous;record.previous={code:record.code,source:record.source};record.code=previous.code;record.source=previous.source;this.hosts.get(id)?.dispose();this.hosts.delete(id);}
    else if(command==='update'){if(record.source.protocol==='builtin'||!record.source.origin.startsWith('https://'))throw Error('music-source-not-updatable');const next=await this.parse(await this.download(record.source.origin,signal),record.source.origin,signal,id);next.source.enabled=record.source.enabled;next.source.priority=record.source.priority;next.previous={source:record.source,code:record.code};this.hosts.get(id)?.dispose();this.hosts.delete(id);this.records.splice(this.records.indexOf(record),1,next);}
    else if(command==='detect'){if(record.source.protocol!=='builtin')await this.host(record).call('init',[],signal);if(record.source.capabilities.includes('search'))await this.searchOne(record,'经典',1,signal);}
    else throw Error('music-invalid-command');this.save();return this.list();
  }
  private pluginTrack(record:StoredSource,value:unknown,platform?:string):MusicTrack|null{
    const item=raw(value),meta=raw(item.metadata),ref=raw(item.ref),album=raw(meta.album);const nativeId=ref.id??item.id;if(nativeId===undefined)return null;
    const providerId=String(ref.providerId??platform??record.source.platforms[0]),id='plugin:'+record.source.id+':'+providerId+':'+String(nativeId);
    const artists=Array.isArray(meta.artists)?meta.artists.map(a=>typeof a==='string'?a:String(raw(a).name??'')).join('、'):String(item.artist??item.singer??'');
    const track=normalizeMusicTrack({id,sourceId:record.source.id,provider:'plugin:'+record.source.id,title:item.title??item.name,artist:artists,album:album.title??item.album,cover:meta.artworkUrl??item.artwork??item.cover,availability:item.playable===false?'restricted':'unknown',duration:typeof meta.durationMs==='number'?meta.durationMs/1000:typeof item.durationMs==='number'?item.durationMs/1000:Number(item.duration)||undefined,extra:{data:{...item,providerId}}});if(track)this.payloads.set(id,item);return track;
  }
  private async searchOne(record:StoredSource,query:string,page:number,signal:AbortSignal):Promise<MusicSearchResult>{
    try{let result:MusicSearchResult;
      if(record.source.protocol==='builtin'&&PUBLIC_MUSIC_PROVIDERS.includes(record.source.name as PublicMusicProvider))result=await this.publicCatalog.search(record.source.name as PublicMusicProvider,query,page,signal);
      else if(record.source.protocol==='builtin'){const provider=record.source.id.slice(8) as BuiltinMusicProvider;try{result=await this.catalog.search(provider,query,page,signal);}catch(error){if(signal.aborted)throw error;result=await this.legacy.search(provider,query,page,signal);result.tracks=result.tracks.map(t=>({...t,sourceId:record.source.id}));result.hasMore=page*(provider==='qq'?50:20)<result.total;}}
      else{const combined:MusicTrack[]=[];let more=false,total=0;for(const platform of record.source.platforms){const args=record.source.protocol==='ceru-v2'?[platform,query,page]:[query,page],response=raw(await this.host(record).call('search',args,signal));const items=Array.isArray(response.items)?response.items:Array.isArray(response.data)?response.data:null;if(!items)throw Error('music-invalid-response');for(const item of items){const track=this.pluginTrack(record,item,platform);if(track)combined.push(track);}more ||= record.source.protocol==='ceru-v2'?Boolean(response.nextCursor):response.isEnd!==true&&items.length>0;total+=typeof response.totalEstimate==='number'?response.totalEstimate:(page-1)*30+items.length+(more?1:0);}result={tracks:combined,total,hasMore:more};}
      result.tracks.forEach(track=>this.tracks.set(track.id,track));this.status(record.source.id,'search');return result;
    }catch(error){if(!signal.aborted)this.status(record.source.id,'search',error instanceof Error?error.message:String(error));throw error;}
  }
  /** Searches sources independently and reports every failed platform alongside partial results. */
  async search(source:string,query:string,page:number,signal:AbortSignal,batch:(value:MusicSearchResult)=>void=()=>{}):Promise<MusicSearchResult>{
    if(!query.trim()||query.length>200||!Number.isInteger(page)||page<1||page>100)throw Error('music-invalid-query');
    const records=source==='all'?this.records.filter(r=>r.source.enabled&&r.source.capabilities.includes('search')):[this.record(source.startsWith('builtin:')?source:[...providers,...PUBLIC_MUSIC_PROVIDERS].includes(source as BuiltinMusicProvider)?'builtin:'+source:source.startsWith('plugin:')?source.slice(7):source)];
    if(!records.length)throw Error('music-no-enabled-source');return searchMusicSources(records.sort((a,b)=>a.source.priority-b.source.priority).map(record=>({id:record.source.id,run:()=>this.searchOne(record,query,page,signal)})),signal,batch);
  }
  private payload(track:MusicTrack):Raw{return this.payloads.get(track.id)??track.extra?.data??{id:track.id.split(':').at(-1),title:track.title,artist:track.artist,album:track.album};}
  private args(record:StoredSource,track:MusicTrack,quality?:string):unknown[]{const item=this.payload(track);if(record.source.protocol==='musicfree')return [item,quality];const platform=String(item.providerId??raw(item.ref).providerId??codes[track.provider]??record.source.platforms[0]);const data=record.source.protocol==='ceru-v2'?raw(item.ref):track.extra?.data??{songmid:track.id.split('_').at(-1),id:track.id.split('_').at(-1)};return [platform,data,quality];}
  /** Returns at most three strict versions, original first; no title-only replacement. */
  async candidates(track:MusicTrack,signal:AbortSignal):Promise<MusicTrack[]>{
    if(track.provider==='local')return [track];const found=await this.search('all',track.title+' '+track.artist,1,signal).catch(error=>{if(signal.aborted)throw error;return {tracks:[],total:0};});
    const choices=found.tracks.flatMap(item=>[item,...(item.candidates??[]).flatMap(id=>{const candidate=this.tracks.get(id);return candidate?[candidate]:[];})]);
    return [...new Map([track,...choices.filter(t=>t.id!==track.id&&identicalMusic(track,t))].map(item=>[item.id,item])).values()].slice(0,3);
  }
  /** Chooses compatible resolvers independently of the catalog, preferring declared quality tiers. */
  async resolve(track:MusicTrack,signal:AbortSignal,skip=new Set<string>(),preference:MusicQuality='auto'):Promise<MusicStream>{
    const own=track.sourceId??'builtin:'+track.provider,code=codes[track.provider],rank=(r:StoredSource)=>r.source.protocol==='builtin'?2:r.source.id===own?0:1,records=this.records.filter(r=>r.source.enabled&&!skip.has(r.source.id)&&r.source.capabilities.includes('resolve')&&(r.source.id===own||code&&r.source.platforms.includes(code))).sort((a,b)=>rank(a)-rank(b)||a.source.priority-b.source.priority);let failure:unknown=Error('music-unavailable');
    for(const record of records.slice(0,3)){try{signal.throwIfAborted();
      if(record.source.protocol==='builtin'&&PUBLIC_MUSIC_PROVIDERS.includes(record.source.name as PublicMusicProvider)){const result=await this.publicCatalog.resolve(track,preference,signal);return {...result,sourceId:record.source.id,track};}
      if(record.source.protocol==='builtin'){const result=await this.legacy.resolve(track,signal,preference);return {...result,sourceId:record.source.id,track};}
      const metadata=raw(await this.host(record).call('init',[],signal));
      const platform=String(this.args(record,track)[0]),declared=raw(metadata.qualities)[platform];
      const tiers=musicQualityTiers(preference,record.source.protocol==='musicfree'?'musicfree':'lx').filter(quality=>record.source.protocol!=='lx'||Array.isArray(declared)&&declared.includes(quality));
      if(!tiers.length)throw Error('music-unavailable');
      for(const quality of tiers){try{const value=await this.host(record).call('resolve',this.args(record,track,quality),signal),result=raw(value),media=raw(result.media),stream=raw(result.stream);const url=typeof value==='string'?value:result.url??media.url??stream.url;if(typeof url!=='string'||!url)throw Error('music-unavailable');return {url:await publicMusicUrl(url),format:'',bitrate:null,headers:musicPluginHeaders(result.headers??media.headers??stream.headers),sourceId:record.source.id,track};}catch(error){if(signal.aborted)throw error;failure=error;}}
    }catch(error){if(signal.aborted)throw error;failure=error;}this.fail(record.source.id,failure instanceof Error?failure.message:String(failure));}throw failure;
  }
  async lyrics(track:MusicTrack,sourceId:string,signal:AbortSignal):Promise<string>{
    if(PUBLIC_MUSIC_PROVIDERS.includes(track.provider as PublicMusicProvider))return '';
    const record=this.records.find(r=>r.source.id===sourceId),own=this.records.find(r=>r.source.id===track.sourceId);const chosen=record?.source.capabilities.includes('lyrics')?record:own;
    try{let text='';if(!chosen||chosen.source.protocol==='builtin')text=await this.legacy.lyrics(track,signal);else{const value=await this.host(chosen).call('lyrics',this.args(chosen,track),signal),result=raw(value);text=typeof value==='string'?value:String(result.rawLrc??result.lyric??result.lrc??'');if(!text&&typeof result.lyricUrl==='string'){const url=await publicMusicUrl(result.lyricUrl),response=await publicMusicRequest(url,{signal});if(!response.ok){await response.body?.cancel();throw Error('music-http-'+response.status);}text=await musicResponseText(response,500000);}}if(chosen&&text)this.status(chosen.source.id,'lyrics');return text.slice(0,500000);}catch(error){if(chosen&&!signal.aborted)this.status(chosen.source.id,'lyrics',error instanceof Error?error.message:String(error));throw error;}
  }
  /** Loads separately declared playlist discovery and records success only for actual results. */
  async discover(id:string,category:string,page:number,signal:AbortSignal):Promise<{playlists:RemoteMusicPlaylist[];hasMore:boolean}>{
    const record=this.record(id);if(!record.source.enabled)throw Error('music-no-enabled-source');
    if(!record.source.capabilities.includes('playlist-discover')||!Number.isInteger(page)||page<1||page>100||typeof category!=='string'||category.length>100)throw Error('music-plugin-unsupported-capability');
    try{let result:{playlists:RemoteMusicPlaylist[];hasMore:boolean};if(record.source.protocol==='builtin')result=await this.legacy.discover(record.source.name as BuiltinMusicProvider,category,page,signal);
      else{const response=raw(await this.host(record).call('playlist-discover',[{id:category,title:category},page],signal));if(!Array.isArray(response.data))throw Error('music-invalid-response');if(response.data.length>1000)throw Error('music-response-too-large');const playlists=response.data.flatMap(value=>{const item=raw(value);if((typeof item.id!=='string'&&typeof item.id!=='number')||typeof item.title!=='string')return [];const list:RemoteMusicPlaylist={id:String(item.id),name:item.title.slice(0,200),sourceId:id,cover:typeof item.artwork==='string'?item.artwork:'',url:typeof item.url==='string'?item.url:''};this.playlistPayloads.set(id+':'+list.id,item);return [list];});while(this.playlistPayloads.size>2000)this.playlistPayloads.delete(this.playlistPayloads.keys().next().value!);result={playlists,hasMore:response.isEnd===false};}
      if(result.playlists.length)this.status(id,'playlist');return result;
    }catch(error){if(!signal.aborted)this.status(id,'playlist',String(error));throw error;}
  }
  /** Only built-in adapters currently declare playlist keyword search. */
  async searchPlaylists(id:string,query:string,page:number,signal:AbortSignal):Promise<{playlists:RemoteMusicPlaylist[];hasMore:boolean}>{const record=this.record(id);if(!record.source.enabled)throw Error('music-no-enabled-source');if(record.source.protocol!=='builtin')throw Error('music-plugin-unsupported-capability');const result=await this.legacy.searchPlaylists(record.source.name as BuiltinMusicProvider,query,page,signal);if(result.playlists.length)this.status(id,'playlist');return result;}
  /** Lists actual provider/plugin recommendation categories. */
  async categories(id:string,signal:AbortSignal):Promise<Array<{id:string;name:string}>>{const record=this.record(id);if(!record.source.enabled)throw Error('music-no-enabled-source');if(record.source.protocol==='builtin')return this.legacy.playlistCategories(record.source.name as BuiltinMusicProvider,signal);const result=raw(await this.host(record).call('playlist-categories',[],signal)),groups=Array.isArray(result.data)?result.data:[],items=[...(Array.isArray(result.pinned)?result.pinned:[]),...groups.flatMap(group=>Array.isArray(raw(group).data)?raw(group).data as unknown[]:[])];return items.flatMap(value=>{const item=raw(value);return typeof item.id==='string'&&typeof item.title==='string'?[{id:item.id,name:item.title.slice(0,100)}]:[];});}
  /** Returns a bounded preview; importing is a separate explicit library operation. */
  async playlistPreview(id:string,reference:string,signal:AbortSignal):Promise<Omit<MusicPlaylistPreview,'id'>>{
    const record=this.record(id);if(!record.source.enabled)throw Error('music-no-enabled-source');
    try{let result:Omit<MusicPlaylistPreview,'id'>;
      if(record.source.protocol==='builtin')result=await this.legacy.playlist(record.source.name as BuiltinMusicProvider,reference,signal);
      else{const payload=this.playlistPayloads.get(id+':'+reference),items:unknown[]=[];let info=payload||{};
        if(payload&&record.source.capabilities.includes('playlist-details')){for(let page=1;page<=100;page++){signal.throwIfAborted();const value=raw(await this.host(record).call('playlist-details',[payload,page],signal));if(!Array.isArray(value.musicList))throw Error('music-invalid-response');items.push(...value.musicList);if(items.length>10000)throw Error('music-response-too-large');if(page===1)info={...payload,...raw(value.sheetItem)};if(value.isEnd!==false)break;if(page===100)throw Error('music-response-too-large');}}
        else{if(!record.source.capabilities.includes('playlist'))throw Error('music-plugin-unsupported-capability');const url=await publicMusicUrl(reference),value=await this.host(record).call('playlist',[url],signal),row=raw(value),list=Array.isArray(value)?value:row.musicList??row.tracks??row.items;if(!Array.isArray(list)||list.length>10000)throw Error('music-invalid-response');items.push(...list);info={...raw(row.sheetItem),title:raw(row.sheetItem).title||row.title||record.source.name};}
        const tracks=items.flatMap(item=>{const track=this.pluginTrack(record,item);return track?[track]:[];});result={playlist:{id:reference,sourceId:id,name:String(info.title||reference).slice(0,200),cover:String(info.artwork||''),url:payload?String(payload.url||''):reference,count:items.length},tracks,invalid:items.length-tracks.length};
      }result.tracks.forEach(track=>this.tracks.set(track.id,track));if(result.tracks.length)this.status(id,'playlist');return result;
    }catch(error){if(!signal.aborted)this.status(id,'playlist',String(error));throw error;}
  }
  async playlist(id:string,url:string,signal:AbortSignal):Promise<MusicTrack[]>{const record=this.record(id);if(!record.source.capabilities.includes('playlist'))throw Error('music-plugin-unsupported-capability');const value=await this.host(record).call('playlist',record.source.protocol==='ceru-v2'?[record.source.platforms[0],{providerId:record.source.platforms[0],kind:'playlist',id:url}]:[url],signal),result=raw(value),items=Array.isArray(value)?value:Array.isArray(result.items)?result.items:Array.isArray(result.tracks)?result.tracks:[];return items.flatMap(item=>{const track=this.pluginTrack(record,item);return track?[track]:[];});}
  dispose():void{this.hosts.forEach(host=>host.dispose());this.hosts.clear();}
}
