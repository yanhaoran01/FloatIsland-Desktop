/* FloatIsland - https://github.com/yanhaoran01/FloatIsland; Copyright (C) 2026 contributors. GPL-3.0. */
/** @file fusionMusic.ts @description Restricted music catalog, library and persistent player contract. @author 鸡哥 */
export type BuiltinMusicProvider = 'netease'|'qq'|'migu'|'kuwo'|'kugou'|'qianqian';
export type MusicProvider = BuiltinMusicProvider|'archive'|'audius'|'local'|`plugin:${string}`;
export type MusicJson = null|boolean|number|string|MusicJson[]|{[key:string]:MusicJson};
export type MusicCapability = 'search'|'resolve'|'lyrics'|'details'|'playlist'|'playlist-discover'|'playlist-details';
export interface MusicSource {
  id:string;name:string;protocol:'builtin'|'musicfree'|'lx'|'ceru-v1'|'ceru-v2';version:string;author:string;
  enabled:boolean;priority:number;platforms:string[];capabilities:MusicCapability[];
  qualities?:Record<string,string[]>;
  health:{search:'unknown'|'passed'|'failed';playback:'unknown'|'passed'|'failed';lyrics:'unknown'|'passed'|'failed';playlist?:'unknown'|'passed'|'failed';download?:'unknown'|'passed'|'failed';error:string};
  origin:string;sha256:string;license:string;updatedAt:number;
}
export interface MusicTrack {
  id:string; provider:MusicProvider; title:string; artist:string; album:string; cover:string;
  availability:'unknown'|'restricted';
  duration?:number;sourceId?:string;candidates?:string[];
  extra?:{contentId?:string;quality?:string;lyricUrl?:string;translationUrl?:string;data?:{[key:string]:MusicJson}};
}
export interface MusicDownloadOptions {quality:MusicQuality;format:'original'|'mp3';lyrics:boolean;cover:boolean;}
export type MusicQuality='auto'|'standard'|'high'|'lossless'|'hires';
export interface RemoteMusicPlaylist {id:string;sourceId:string;name:string;cover:string;url:string;count?:number;}
export interface MusicPlaylistPreview {id:string;playlist:RemoteMusicPlaylist;tracks:MusicTrack[];invalid:number;}
export interface MusicPlaylist {id:string;name:string;tracks:string[];source?:RemoteMusicPlaylist;updatedAt?:number;favorite?:boolean;}
export interface MusicLibrary {playbackQuality?:MusicQuality;downloadQuality?:MusicQuality;version:2;revision:number;tracks:MusicTrack[];queue:string[];favorites:string[];playlists:MusicPlaylist[];current:string|null;volume:number;shuffle:boolean;repeat:'off'|'all'|'one';}
export interface MusicState {sampleRate?:number;bitsPerSample?:number;qualityFallback?:boolean;library:MusicLibrary;active:boolean;playing:boolean;loading:boolean;time:number;duration:number;muted:boolean;error:string;lyrics:string;lyricError:string;format:string;bitrate:number|null;actualTrackId?:string;actualSourceId?:string;lossless?:boolean;}
export interface MusicSearchResult {tracks:MusicTrack[];total:number;hasMore?:boolean;errors?:{sourceId:string;error:string}[];requestId?:string;}
export interface MusicSearchBatch extends MusicSearchResult {query:string;page:number;done:boolean;}
export type MusicSourceCommand='enable'|'disable'|'move'|'detect'|'update'|'rollback'|'delete';
export type MusicCommand = 'play'|'switch-source'|'pause'|'toggle'|'close'|'next'|'previous'|'seek'|'volume'|'mute'|'shuffle'|'repeat'|'queue-add'|'queue-remove'|'queue-move'|'favorite'|'playlist-create'|'playlist-delete'|'playlist-rename'|'playlist-add'|'playlist-remove'|'playlist-move'|'playlist-favorite';
export interface MusicCommandValue {id?:string;playlist?:string;name?:string;number?:number;repeat?:MusicLibrary['repeat'];}
export interface FusionMusicApi {
  fusionMusicArtwork:(id:string)=>Promise<string>;
  fusionMusicRelocate:(id:string)=>Promise<MusicState>;
  fusionMusicDownload:(ids:string[],options:MusicDownloadOptions)=>Promise<string[]>;
  fusionMusicQuality:(playback?:MusicQuality,download?:MusicQuality)=>Promise<{playback:MusicQuality;download:MusicQuality}>;
  fusionMusicPlaylistDiscover:(sourceId:string,category:string,page:number)=>Promise<{playlists:RemoteMusicPlaylist[];hasMore:boolean}>;
  fusionMusicPlaylistCategories:(sourceId:string)=>Promise<Array<{id:string;name:string}>>;
  fusionMusicPlaylistPreview:(sourceId:string,reference:string)=>Promise<MusicPlaylistPreview>;
  fusionMusicPlaylistCommit:(previewId:string,selected:string[])=>Promise<MusicPlaylist>;
  fusionMusicPlaylistFilePreview:()=>Promise<MusicPlaylistPreview|null>;
  fusionMusicPlaylistExport:(id:string)=>Promise<boolean>;
  fusionMusicPlaylistSearch:(sourceId:string,query:string,page:number)=>Promise<{playlists:RemoteMusicPlaylist[];hasMore:boolean}>;
  fusionMusicState:()=>Promise<MusicState>;
  fusionMusicSearch:(provider:Exclude<MusicProvider,'local'>|'all',query:string,page:number,requestId?:string)=>Promise<MusicSearchResult>;
  fusionMusicCancelSearch:()=>Promise<void>;
  fusionMusicControl:(command:MusicCommand,value?:MusicCommandValue)=>Promise<MusicState>;
  fusionMusicImport:()=>Promise<MusicTrack[]>;
  fusionMusicSources:()=>Promise<MusicSource[]>;
  fusionMusicSourceImport:(url?:string)=>Promise<MusicSource[]>;
  fusionMusicSourceControl:(id:string,command:MusicSourceCommand,value?:number)=>Promise<MusicSource[]>;
  fusionMusicCandidates:(id:string)=>Promise<MusicTrack[]>;
  fusionMusicPlaylistImport:(sourceId:string,url:string)=>Promise<MusicTrack[]>;
  onFusionMusicSearchBatch:(callback:(batch:MusicSearchBatch)=>void)=>()=>void;
  onFusionMusicSources:(callback:(sources:MusicSource[])=>void)=>()=>void;
  onFusionMusicState:(callback:(state:MusicState)=>void)=>()=>void;
}
