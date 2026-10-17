/* FloatIsland contributors. GPL-3.0. */
import { createHash } from 'node:crypto';
import type { MusicQuality, MusicSearchResult, MusicTrack } from '../../preload/types/fusionMusic';
import type { MusicStream } from './fusionMusicProviders';
import { normalizeMusicTrack } from './fusionMusicModel';
import { musicResponseText, publicMusicRequest, publicMusicUrl } from './fusionMusicPluginHost';

export const PUBLIC_MUSIC_PROVIDERS = ['archive', 'audius'] as const;
export type PublicMusicProvider = typeof PUBLIC_MUSIC_PROVIDERS[number];
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown): string => Array.isArray(value) ? value.map(String).join('、') : typeof value === 'string' ? value : '';
const audioFile = (file: Row): boolean => typeof file.name === 'string' && /\.(flac|wav|mp3|m4a|ogg|opus)$/i.test(file.name) && !file.private;
const group = (file: Row): string => text(file.original) || text(file.name);
const trackKey = (name: string): string => createHash('sha256').update(name).digest('hex').slice(0, 20);

/** Public catalogs retain stable IDs; media links and access decisions are refreshed for playback. */
export class PublicMusicCatalog {
  private archiveCache = new Map<string, { expires: number; value: Row }>();

  private async json(url: string, signal: AbortSignal): Promise<Row> {
    const response = await publicMusicRequest(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      headers: { 'User-Agent': 'FloatIsland/1.3.4 (+https://github.com/yanhaoran01/FloatIsland-Desktop)' },
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('music-http-' + response.status); }
    const value = row(JSON.parse(await musicResponseText(response)));
    if (value.error) throw new Error('music-service-rejected');
    return value;
  }

  private async archiveItem(id: string, signal: AbortSignal): Promise<Row> {
    if (!/^[\w.-]{1,160}$/.test(id)) throw new Error('music-track-missing');
    const cached = this.archiveCache.get(id);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = await this.json('https://archive.org/metadata/' + encodeURIComponent(id), signal);
    const metadata = row(value.metadata);
    const licensed = (Array.isArray(metadata.licenseurl) ? metadata.licenseurl : [metadata.licenseurl]).some(value => {
      try { const url = new URL(String(value)); return url.hostname === 'creativecommons.org' && /^\/(licenses|publicdomain)\//.test(url.pathname); } catch { return false; }
    });
    if (value.is_dark || metadata['access-restricted-item'] === 'true' || !licensed) throw new Error('music-unavailable');
    this.archiveCache.set(id, { expires: Date.now() + 120000, value });
    while (this.archiveCache.size > 80) this.archiveCache.delete(this.archiveCache.keys().next().value!);
    return value;
  }

  async search(provider: PublicMusicProvider, query: string, page: number, signal: AbortSignal): Promise<MusicSearchResult> {
    if (provider === 'audius') {
      const url = new URL('https://api.audius.co/v1/tracks/search');
      url.search = new URLSearchParams({ query, limit: '30', offset: String((page - 1) * 30), app_name: 'FloatIsland' }).toString();
      const response = await this.json(url.href, signal);
      if (!Array.isArray(response.data)) throw new Error('music-invalid-response');
      const tracks = response.data.flatMap(value => {
        const item = row(value), user = row(item.user);
        if (typeof item.id !== 'string' || !/^[\w-]+$/.test(item.id) || item.is_streamable !== true || item.is_stream_gated === true || row(item.access).stream === false) return [];
        const track = normalizeMusicTrack({ id: 'audius:' + item.id, provider, sourceId: 'builtin:audius', title: item.title,
          artist: user.name, album: '', cover: row(item.artwork)['480x480'], duration: item.duration,
          extra: { data: { trackId: item.id } } });
        return track ? [track] : [];
      });
      const hasMore = response.data.length === 30;
      return { tracks, total: (page - 1) * 30 + response.data.length + Number(hasMore), hasMore };
    }
    const url = new URL('https://archive.org/advancedsearch.php');
    const phrase = query.replace(/[\\"]/g, '\\$&');
    url.search = new URLSearchParams({ q: 'mediatype:audio AND collection:netlabels AND licenseurl:*creativecommons.org* AND "' + phrase + '"',
      'fl[]': 'identifier', rows: '4', page: String(page), output: 'json' }).toString();
    const response = row((await this.json(url.href, signal)).response);
    if (!Array.isArray(response.docs)) throw new Error('music-invalid-response');
    const tracks: MusicTrack[] = [];
    const results = await Promise.allSettled(response.docs.map(async value => {
      const id = text(row(value).identifier), item = await this.archiveItem(id, signal), metadata = row(item.metadata);
      const files = (Array.isArray(item.files) ? item.files : []).map(row).filter(audioFile);
      const groups = [...new Set(files.map(group))].slice(0, 60);
      return groups.flatMap(name => {
        const file = files.find(file => text(file.name) === name) || files.find(file => group(file) === name)!;
        const track = normalizeMusicTrack({ id: 'archive:' + id + ':' + trackKey(name), provider, sourceId: 'builtin:archive',
          title: text(file.title) || name.replace(/\.[^.]+$/, ''), artist: text(file.creator) || text(metadata.creator),
          album: text(metadata.title), cover: 'https://archive.org/services/img/' + encodeURIComponent(id), duration: Number(file.length) || undefined,
          extra: { data: { itemId: id, fileGroup: name } } });
        return track ? [track] : [];
      });
    }));
    for (const result of results) if (result.status === 'fulfilled') tracks.push(...result.value);
    signal.throwIfAborted();
    if (results.length && results.every(result => result.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
    const hasMore = page * 4 < Number(response.numFound);
    return { tracks, total: tracks.length + Number(hasMore), hasMore };
  }

  async resolve(track: MusicTrack, quality: MusicQuality, signal: AbortSignal): Promise<MusicStream> {
    const data = track.extra?.data;
    if (track.provider === 'audius') {
      const id = String(data?.trackId || track.id.slice(7));
      if (!/^[\w-]{1,100}$/.test(id)) throw new Error('music-track-missing');
      const response = await this.json('https://api.audius.co/v1/tracks/' + id + '?app_name=FloatIsland', signal);
      const value = row(Array.isArray(response.data) ? response.data[0] : response.data), access = row(value.access);
      if (value.is_streamable !== true || value.is_stream_gated === true || access.stream === false) throw new Error('music-unavailable');
      return { url: 'https://api.audius.co/v1/tracks/' + id + '/stream?app_name=FloatIsland', format: '', bitrate: null,
        publicNetwork: true, downloadAllowed: value.is_downloadable === true && value.is_download_gated !== true && access.download !== false };
    }
    const id = String(data?.itemId || ''), name = String(data?.fileGroup || '');
    const item = await this.archiveItem(id, signal);
    const files = (Array.isArray(item.files) ? item.files : []).map(row).filter(file => audioFile(file) && group(file) === name);
    const formats = quality === 'standard' || quality === 'high' ? ['mp3', 'm4a', 'opus', 'ogg', 'flac', 'wav'] : ['flac', 'wav', 'mp3', 'm4a', 'opus', 'ogg'];
    files.sort((a, b) => formats.indexOf(text(a.name).split('.').at(-1)!.toLowerCase()) - formats.indexOf(text(b.name).split('.').at(-1)!.toLowerCase()) || Number(b.bitrate || 0) - Number(a.bitrate || 0));
    if (!files.length) throw new Error('music-unavailable');
    const path = text(files[0].name).split('/').map(encodeURIComponent).join('/');
    return { url: await publicMusicUrl('https://archive.org/download/' + encodeURIComponent(id) + '/' + path), format: '', bitrate: null,
      publicNetwork: true, downloadAllowed: true };
  }
}
