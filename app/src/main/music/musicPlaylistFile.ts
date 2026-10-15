/* FloatIsland contributors, GPL-3.0. */
/** @file musicPlaylistFile.ts @description Portable metadata-only playlist import with no imported file permissions or stream credentials. @author 鸡哥 */
import {createHash} from 'crypto';
import {normalizeMusicTrack,normalizeMusicLibrary} from './fusionMusicModel';
import type {MusicTrack,MusicPlaylistPreview} from '../../preload/types/fusionMusic';
/** Restores local IDs only when already authorized in this library; moved files require the local import flow. */
export function playlistFilePreview(text:string,localIds:Set<string>):Omit<MusicPlaylistPreview,'id'>{
 if(text.length>10_000_000)throw Error('file-too-large');
 let input:Record<string,unknown>;try{input=JSON.parse(text);}catch{throw Error('music-invalid-response');}
 if(!input||input.version!==1||typeof input.name!=='string'||!input.name.trim()||!Array.isArray(input.tracks)||input.tracks.length>10000)throw Error('music-invalid-response');
 const tracks=input.tracks.flatMap(value=>{const track=normalizeMusicTrack(value);return track&&(track.provider!=='local'||localIds.has(track.id))?[track]:[];});
 const unique=[...new Map(tracks.map(track=>[track.id,track])).values()];
 const source=normalizeMusicLibrary({version:2,playlists:[{id:'preview',name:input.name,source:input.source}]}).playlists[0]?.source;
 return {playlist:source||{id:createHash('sha256').update(text).digest('hex'),sourceId:'file',name:input.name.slice(0,120),cover:'',url:''},tracks:unique,invalid:input.tracks.length-tracks.length};
}
/** Copies validated track metadata; local paths and ephemeral stream URLs never leave the host. */
export function playlistFileExport(name:string,tracks:MusicTrack[],source?:unknown):string{
 return JSON.stringify({version:1,name,source,tracks:tracks.flatMap(track=>{const normalized=normalizeMusicTrack(track);return normalized?[normalized]:[];})},null,2);
}
