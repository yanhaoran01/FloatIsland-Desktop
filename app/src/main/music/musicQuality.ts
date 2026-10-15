/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file musicQuality.ts @description Requested quality tiers are independent of measured media quality. @author 鸡哥 */
import type {MusicQuality,MusicDownloadOptions} from '../../preload/types/fusionMusic';
/** Validates a persisted or IPC preference. */
export function musicQuality(value:unknown):MusicQuality {if(!['auto','standard','high','lossless','hires'].includes(String(value)))throw Error('music-invalid-value');return value as MusicQuality;}
/** Produces protocol tiers from a preference, keeping truthful fallback order. */
export function musicQualityTiers(quality:MusicQuality,protocol:'musicfree'|'lx'|'qq'|'migu'):string[]{
 const all=protocol==='musicfree'?['super','high','standard','low']:protocol==='qq'?['flac','320','128','m4a']:protocol==='migu'?['111111','111100','110000','000000']:['flac24bit','flac','320k','128k'];
 const at=quality==='standard'?(protocol==='lx'?3:2):quality==='high'?(protocol==='lx'?2:1):quality==='lossless'&&protocol==='lx'?1:0;return all.slice(at);
}
/** A source label alone never establishes lossless or Hi-Res quality. */
export function measuredMusicFallback(quality:MusicQuality,format:string,rate:number,bits:number,bitrate:number|null):boolean {
 if(!format)return false;const lossless=/^(FLAC|ALAC|PCM_)/.test(format.toUpperCase());return quality==='hires'?!lossless||!(bits>16||rate>48000):quality==='lossless'?!lossless:quality==='high'?!lossless&&bitrate!==null&&bitrate<256000:false;
}

/** Validates song download choices before they enter persistent history. */
export function musicDownloadOptions(value:unknown):MusicDownloadOptions {if(!value||typeof value!=='object')throw Error('music-invalid-value');const row=value as Record<string,unknown>;if(!['original','mp3'].includes(String(row.format))||typeof row.lyrics!=='boolean'||typeof row.cover!=='boolean')throw Error('music-invalid-value');return {quality:musicQuality(row.quality),format:row.format as MusicDownloadOptions['format'],lyrics:row.lyrics,cover:row.cover};}
