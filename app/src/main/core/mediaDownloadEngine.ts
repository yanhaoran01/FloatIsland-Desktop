/* FloatIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file mediaDownloadEngine.ts @description Main-owned media analysis, queue and recoverable download jobs. @author 鸡哥 */
import { randomUUID } from 'node:crypto';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { basename, extname, isAbsolute, join, relative } from 'node:path';
import type { DownloadTask, MediaAnalysis, MediaEntry, MediaDownloadOptions } from '../../preload/types/download';
import { mediaSourceUrl, mediaEntries, mediaDownloadArgs, mediaOptions, mediaFailure } from './mediaDownloadModel';
import { runMediaProgram } from './mediaPrograms';

interface MediaJob { value: DownloadTask; entry?: MediaEntry; controller?: AbortController; stop?: 'paused' | 'canceled'; }
interface EngineOptions {
  onUpdate: (task: DownloadTask) => void;
  capacity: () => number;
  run?: typeof runMediaProgram;
}
/** Checks that an output directory is a real directory, never a redirected link. */
function outputDirectory(path: string): void {
  if (!isAbsolute(path)) throw Error('file-not-authorized');
  mkdirSync(path, {recursive: true});
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('file-not-authorized');
}
/** Generates a new output name using an exclusive copy, preserving existing files. */
function publishOutput(source: string, directory: string): string {
  const name = basename(source), ext = extname(name), stem = name.slice(0, name.length - ext.length);
  for (let index = 0; ; index++) {
    const target = join(directory, index ? stem + ' (' + index + ')' + ext : name);
    try { copyFileSync(source, target, constants.COPYFILE_EXCL); unlinkSync(source); return target; }
    catch (reason) { if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'EEXIST') continue; throw reason; }
  }
}

/** Media tasks survive page changes; only explicit control or application exit interrupts them. */
export class MediaDownloadEngine {
  private readonly jobs = new Map<string, MediaJob>();
  private readonly analyses = new Map<string, AbortController>();
  private readonly run: typeof runMediaProgram;
  private closing = false;
  constructor(private readonly options: EngineOptions, restored: DownloadTask[] = []) {
    this.run = options.run ?? runMediaProgram;
    for (const value of restored) if (value.engine === 'yt-dlp' && value.media && value.outputDir && /^[\w-]+$/.test(value.id)) {
      this.jobs.set(value.id, {value: {...value, media: mediaOptions(value.media)}});
    }
  }

  /** Resolves explicit source pages without starting downloads. @param urls - Source pages. @param id - Cancellable request id. @returns Metadata and per-source errors. */
  async analyze(urls: string[], id: string): Promise<MediaAnalysis> {
    if (!/^[\w-]{1,80}$/.test(id) || this.analyses.has(id) || !Array.isArray(urls) || !urls.length) throw Error('media-invalid-request');
    const sources = [...new Set(urls.map(mediaSourceUrl))], controller = new AbortController();
    this.analyses.set(id, controller);
    const result: MediaAnalysis = {id, entries: [], errors: []};
    try {
      for (const url of sources) {
        controller.signal.throwIfAborted();
        try {
          const output = await this.run(['-J', '--flat-playlist', '--skip-download', '--', url], controller.signal);
          result.entries.push(...mediaEntries(JSON.parse(output), url));
        } catch (reason) {
          if (controller.signal.aborted) throw Error('media-cancelled');
          result.errors.push({url, ...mediaFailure(reason)});
        }
      }
      return result;
    } finally { this.analyses.delete(id); }
  }
  /** Cancels only an owned metadata request. @param id - Request id. @returns Whether found. */
  cancelAnalysis(id: string): boolean {
    const controller = this.analyses.get(id);
    if (!controller) return false;
    controller.abort(); return true;
  }
  /** Enqueues independently tracked selected entries. @param entries - Explicit selection. @param options - Structured preset. @param directory - Authorized output. @returns Task snapshots. */
  enqueue(entries: MediaEntry[], options: MediaDownloadOptions, directory: string): DownloadTask[] {
    if (this.closing || !entries.length) throw Error('media-invalid-request');
    outputDirectory(directory);
    const safe = mediaOptions(options), batchId = randomUUID(), now = Date.now();
    const tasks = entries.map(entry => {
      mediaSourceUrl(entry.url);
      const value: DownloadTask = {id: randomUUID(), url: entry.url, fileName: entry.title, savePath: directory, outputDir: directory,
        totalBytes: 0, downloadedBytes: 0, progress: 0, speedBytesPerSecond: 0, estimatedFinishAt: null, threads: 1,
        status: 'queued', phase: 'queued', engine: 'yt-dlp', batchId, playlistTitle: entry.playlistTitle,
        media: structuredClone(safe), mediaEntryIndex: entry.playlistIndex, outputs: [], canPause: true, createdAt: now, updatedAt: now};
      const job = {value, entry}; this.jobs.set(value.id, job); this.publish(job); return structuredClone(value);
    });
    this.pump(); return tasks;
  }
  /** Schedules queued work within the coordinator's current capacity. */
  activeCount(): number { return [...this.jobs.values()].filter(job => job.controller).length; }
  /** Schedules queued work within the coordinator's current capacity. */
  pump(): void {
    if (this.closing) return;
    const running = this.activeCount();
    let remaining = Math.max(0, this.options.capacity() - running);
    for (const job of this.jobs.values()) if (remaining && job.value.status === 'queued' && !job.controller) {
      remaining--; job.controller = new AbortController();
      void this.execute(job).finally(() => { job.controller = undefined; this.pump(); });
    }
  }
  private publish(job: MediaJob, patch: Partial<DownloadTask> = {}): void {
    Object.assign(job.value, patch, {updatedAt: Date.now()});
    this.options.onUpdate(structuredClone(job.value));
  }
  private staging(job: MediaJob): string { return join(job.value.outputDir!, '.float-download-' + job.value.id); }
  private async execute(job: MediaJob): Promise<void> {
    const signal = job.controller!.signal, directory = job.value.outputDir!, staging = this.staging(job);
    let phase: DownloadTask['phase'] = 'resolving';
    const moved: string[] = [];
    try {
      outputDirectory(directory); outputDirectory(staging);
      this.publish(job, {status: 'downloading', phase, canPause: true, errorMessage: undefined, errorDetail: undefined});
      let entry = job.entry;
      if (!entry?.formats.length) {
        const raw = await this.run(['-J', ...(job.value.mediaEntryIndex ? ['--yes-playlist', '--playlist-items', String(job.value.mediaEntryIndex)] : ['--no-playlist']), '--skip-download', '--', job.value.url], signal);
        const entries = mediaEntries(JSON.parse(raw), job.value.url);
        entry = job.value.mediaEntryIndex ? entries.find(x => x.playlistIndex === job.value.mediaEntryIndex) ?? entries[0] : entries[0];
        if (entry && job.value.mediaEntryIndex) entry.playlistIndex = job.value.mediaEntryIndex;
        if (!entry) throw Error('media-no-results');
        job.entry = entry;
      }
      signal.throwIfAborted();
      this.publish(job, {fileName: entry.title, phase: 'downloading'});
      const options = job.value.media!;
      let finalFile = '';
      await this.run(mediaDownloadArgs(entry, options, staging), signal, line => {
        if (signal.aborted) return;
        if (line.startsWith('FI_PROGRESS:')) {
          const value: unknown = JSON.parse(line.slice(12));
          if (!value || typeof value !== 'object') return;
          const row = value as Record<string, unknown>;
          const numeric = (key: string): number => typeof row[key] === 'number' && Number.isFinite(row[key]) ? Math.max(0, row[key]) : 0;
          const downloadedBytes = numeric('downloaded_bytes'), totalBytes = numeric('total_bytes') || numeric('total_bytes_estimate');
          phase = 'downloading';
          this.publish(job, {phase, canPause: true, downloadedBytes, totalBytes, progress: totalBytes ? Math.min(.99, downloadedBytes / totalBytes) : 0,
            speedBytesPerSecond: numeric('speed'), estimatedFinishAt: numeric('eta') ? Date.now() + numeric('eta') * 1000 : null});
        } else if (line.startsWith('FI_POST:')) {
          const value: unknown = JSON.parse(line.slice(8));
          const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
          phase = /Merger/.test(String(row.postprocessor)) ? 'merging' : 'converting';
          this.publish(job, {phase, canPause: false, speedBytesPerSecond: 0, estimatedFinishAt: null});
        } else if (line.startsWith('FI_FILE:')) {
          const parsed: unknown = JSON.parse(line.slice(8));
          const raw = typeof parsed === 'string' && parsed.startsWith('\\\\?\\UNC\\') ? '\\\\' + parsed.slice(8) : typeof parsed === 'string' && parsed.startsWith('\\\\?\\') ? parsed.slice(4) : parsed;
          if (typeof raw !== 'string' || relative(staging, raw).startsWith('..') || isAbsolute(relative(staging, raw))) throw Error('file-not-authorized');
          finalFile = raw;
        }
      }, 24 * 60 * 60 * 1000);
      signal.throwIfAborted();
      if (!finalFile || !existsSync(finalFile)) throw Error('media-output-missing');
      const files = [finalFile, ...readdirSync(staging).map(name => join(staging, name)).filter(path => path !== finalFile)];
      for (const path of files) {
        const stat = lstatSync(path);
        if (!stat.isFile() || stat.isSymbolicLink() || /\.(part|ytdl|temp)$/.test(path)) continue;
        moved.push(publishOutput(path, directory));
      }
      if (!moved.length) throw Error('media-output-missing');
      rmSync(staging, {recursive: true, force: true});
      const totalBytes = moved.reduce((sum, path) => sum + lstatSync(path).size, 0);
      this.publish(job, {status: 'completed', phase: 'completed', canPause: false, outputs: moved, savePath: moved[0], fileName: basename(moved[0]),
        totalBytes, downloadedBytes: totalBytes, progress: 1, speedBytesPerSecond: 0, estimatedFinishAt: null});
    } catch (reason) {
      const stopped = job.stop;
      job.stop = undefined;
      if (stopped === 'canceled') {
        try { rmSync(staging, {recursive: true, force: true}); } catch {}
      }
      const failure = mediaFailure(reason);
      this.publish(job, {status: stopped ?? (this.closing ? 'paused' : 'failed'), canPause: false, outputs: moved,
        speedBytesPerSecond: 0, estimatedFinishAt: null, errorMessage: stopped || this.closing ? undefined : failure.message, errorDetail: stopped || this.closing ? undefined : failure.detail});
    }
  }
  /** Controls a queued/active task with actual stage eligibility. @param id - Task id. @param command - Pause or cancel. @returns Accepted. */
  stop(id: string, command: 'paused' | 'canceled'): boolean {
    const job = this.jobs.get(id);
    if (!job || ['completed', 'canceled'].includes(job.value.status) || (command === 'paused' && (job.value.status === 'paused' || !job.value.canPause))) return false;
    if (job.controller) { job.stop = command; job.controller.abort(); }
    else {
      if (command === 'canceled') try { rmSync(this.staging(job), {recursive: true, force: true}); } catch {}
      this.publish(job, {status: command, canPause: false});
    }
    return true;
  }
  /** Retries or resumes without changing identity. @param id - Task id. @returns Snapshot. */
  resume(id: string): DownloadTask {
    const job = this.jobs.get(id);
    if (!job || job.controller || !['paused', 'failed'].includes(job.value.status)) throw Error('media-task-unavailable');
    job.entry = undefined;
    this.publish(job, {status: 'queued', phase: 'queued', canPause: true, errorMessage: undefined, errorDetail: undefined});
    this.pump(); return structuredClone(job.value);
  }
  /** Removes an inactive history item. @param id - Task id. @returns Accepted. */
  remove(id: string): boolean {
    const job = this.jobs.get(id); if (!job || job.controller || job.value.status === 'queued') return false;
    try { rmSync(this.staging(job), {recursive: true, force: true}); } catch {}
    return this.jobs.delete(id);
  }
  /** Interrupts analysis and active jobs while retaining resumable files. */
  close(): void {
    this.closing = true;
    for (const controller of this.analyses.values()) controller.abort();
    for (const job of this.jobs.values()) if (job.controller) { job.stop = 'paused'; job.controller.abort(); this.publish(job, {status: 'paused', canPause: false, speedBytesPerSecond: 0, estimatedFinishAt: null}); }
  }
}
