/* FloatIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file mediaDownloadModel.ts @description Validated metadata and finite extractor options. @author 鸡哥 */
import { randomUUID } from 'node:crypto';
import type { MediaEntry, MediaFormat, MediaSubtitle, MediaDownloadOptions, DownloadPreferences } from '../../preload/types/download';

export const DEFAULT_MEDIA_OPTIONS: MediaDownloadOptions = {mode: 'video', format: 'best', audioFormat: 'm4a', subtitles: [], automaticSubtitles: false, embedSubtitles: false, cover: false};
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
const text = (value: unknown): string => typeof value === 'string' ? value.slice(0, 1000) : '';

/** Accepts only HTTP(S) source pages without embedded credentials. @param input - Page address. @returns Normalized URL. */
export function mediaSourceUrl(input: unknown): string {
  if (typeof input !== 'string' || input.length > 8192) throw Error('media-invalid-url');
  const url = new URL(input.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('media-invalid-url');
  return url.toString();
}
/** Converts extractor JSON to public metadata. @param raw - Extractor response. @param fallback - Original page. @param playlistTitle - Parent title. @returns Entries. */
export function mediaEntries(raw: unknown, fallback: string, playlistTitle?: string): MediaEntry[] {
  const row = object(raw);
  if (Array.isArray(row.entries)) return row.entries.flatMap((item, index) => {
    if (!item) return [];
    return mediaEntries(item, fallback, text(row.title) || playlistTitle).map(entry => ({...entry,
      playlistIndex: entry.url === mediaSourceUrl(fallback) ? number(object(item).playlist_index) || index + 1 : undefined}));
  });
  let url: string;
  try { url = mediaSourceUrl(row.webpage_url || row.original_url || row.url || fallback); }
  catch { return []; }
  const formats: MediaFormat[] = (Array.isArray(row.formats) ? row.formats : []).map(value => {
    const f = object(value);
    return {id: text(f.format_id), ext: text(f.ext), height: number(f.height), fps: number(f.fps),
      video: text(f.vcodec), audio: text(f.acodec), size: number(f.filesize || f.filesize_approx) || null,
      language: text(f.language), note: text(f.format_note)};
  }).filter(f => /^[\w.-]+$/.test(f.id) && (f.video !== 'none' || f.audio !== 'none'));
  const subtitles: MediaSubtitle[] = [];
  for (const [source, automatic] of [[row.subtitles, false], [row.automatic_captions, true]] as const)
    for (const language of Object.keys(object(source))) if (/^[\w.-]+$/.test(language)) subtitles.push({language, automatic});
  return [{id: randomUUID(), url, title: text(row.title) || text(row.id) || url,
    duration: number(row.duration) || null, playlistTitle, formats, subtitles}];
}

/** Validates structured choices, rejecting raw command syntax. @param raw - User settings. @returns Safe options. */
export function mediaOptions(raw: unknown): MediaDownloadOptions {
  const row = object(raw);
  if (!['video', 'audio'].includes(String(row.mode)) || !['m4a', 'mp3', 'opus'].includes(String(row.audioFormat))
    || (row.maxHeight !== undefined && (!Number.isInteger(row.maxHeight) || Number(row.maxHeight) < 0))
    || typeof row.format !== 'string' || !(row.format === 'best' || /^[\w.-]+$/.test(row.format))
    || !Array.isArray(row.subtitles) || row.subtitles.some(x => typeof x !== 'string' || !/^[\w.-]+$/.test(x))
    || ['automaticSubtitles', 'embedSubtitles', 'cover'].some(key => typeof row[key] !== 'boolean')) throw Error('media-invalid-options');
  return {mode: row.mode as MediaDownloadOptions['mode'], audioFormat: row.audioFormat as MediaDownloadOptions['audioFormat'],
    format: row.format, maxHeight: row.maxHeight === undefined ? undefined : Number(row.maxHeight), subtitles: [...new Set(row.subtitles as string[])], automaticSubtitles: Boolean(row.automaticSubtitles),
    embedSubtitles: Boolean(row.embedSubtitles), cover: Boolean(row.cover)};
}

/** Validates versioned download preferences. @param raw - Saved settings. @returns Preferences. */
export function downloadPreferences(raw: unknown): DownloadPreferences {
  const row = object(raw);
  if (row.version !== 1 || !Number.isInteger(row.concurrency) || Number(row.concurrency) < 1 || Number(row.concurrency) > 4 || !Array.isArray(row.presets)) throw Error('media-invalid-options');
  const ids = new Set<string>();
  const presets = row.presets.map(value => {
    const preset = object(value);
    if (typeof preset.id !== 'string' || !/^[\w-]{1,80}$/.test(preset.id) || ids.has(preset.id)
      || typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 120) throw Error('media-invalid-options');
    ids.add(preset.id);
    return {id: preset.id, name: preset.name.trim(), options: mediaOptions(preset.options)};
  });
  const limits:Record<string,number>={};
  for(const [key,max] of [['downloadLimit',1e12],['uploadLimit',1e12],['seedMinutes',10080],['seedRatio',100]] as const){const value=row[key]??0;if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)throw Error('media-invalid-options');limits[key]=value;}
  return {version: 1, concurrency: Number(row.concurrency), presets,...limits};
}

/** Builds bounded argv from an analyzed entry and typed options. @param entry - Metadata. @param options - Choices. @param output - Owned staging folder. @returns Argv. */
export function mediaDownloadArgs(entry: MediaEntry, options: MediaDownloadOptions, output: string): string[] {
  let format = options.mode === 'audio' ? 'ba/b' : 'bv*+ba/b';
  if (options.mode === 'video' && options.maxHeight) format = 'bv*[height<=' + options.maxHeight + ']+ba/b[height<=' + options.maxHeight + ']';
  if (options.format !== 'best') {
    const selected = entry.formats.find(f => f.id === options.format);
    if (!selected) throw Error('media-format-unavailable');
    if (options.mode === 'audio' && selected.audio === 'none') throw Error('media-format-unavailable');
    format = selected.video !== 'none' && selected.audio === 'none' ? selected.id + '+ba' : selected.id;
  }
  const args = [...(entry.playlistIndex ? ['--yes-playlist', '--playlist-items', String(entry.playlistIndex)] : ['--no-playlist']), '--no-overwrites', '--continue', '--windows-filenames', '--trim-filenames', '160',
    '--newline', '--progress', '--progress-delta', '0.3', '--progress-template', 'download:FI_PROGRESS:%(progress)j',
    '--progress-template', 'postprocess:FI_POST:%(progress)j',
    '--print', 'after_move:FI_FILE:%(filepath)j', '--no-simulate',
    '-P', process.platform === 'win32' && !output.startsWith('\\\\?\\') ? (output.startsWith('\\\\') ? '\\\\?\\UNC\\' + output.slice(2) : '\\\\?\\' + output) : output, '-o', '%(title).120B [%(id).40B].%(ext)s', '-f', format, '--embed-metadata'];
  if (options.mode === 'audio') args.push('-x', '--audio-format', options.audioFormat, '--audio-quality', '0');
  else args.push('--merge-output-format', 'mp4/webm/mkv');
  if (options.subtitles.length) {
    args.push('--write-subs', '--sub-langs', options.subtitles.join(','), '--convert-subs', 'srt');
    if (options.automaticSubtitles) args.push('--write-auto-subs');
    if (options.embedSubtitles && options.mode === 'video') args.push('--embed-subs');
  }
  if (options.cover) args.push('--write-thumbnail', '--convert-thumbnails', 'jpg');
  return [...args, '--', mediaSourceUrl(entry.url)];
}

/** Normalizes actual site restrictions while retaining sanitized diagnostics. @param reason - Runtime failure. @returns User-facing code and optional detail. */
export function mediaFailure(reason: unknown): {message: string; detail?: string} {
  const detail = (reason instanceof Error ? reason.message : String(reason)).replace(/https?:\/\/\S+/g, '[URL]').slice(-2000);
  const message = /confirm.*not a bot|captcha|bot verification/i.test(detail) ? 'media-site-verification'
    : /sign in|log.?in|authentication|premium|members.only|subscription/i.test(detail) ? 'media-site-login'
    : /drm|encrypted|protected content/i.test(detail) ? 'media-site-drm'
    : /not available in your country|geo.?restricted|region.?restricted/i.test(detail) ? 'media-site-region'
    : /HTTP Error 403|HTTP Error 429/i.test(detail) ? 'media-site-rejected'
    : /^[a-z]+(?:-[a-z]+)+$/.test(detail) ? detail : 'media-extractor-failed';
  return {message, detail: message === detail ? undefined : detail};
}
