/*
 * eIsland - A sleek, Apple Dynamic Island inspired floating widget for Windows, built with Electron.
 * https://github.com/JNTMTMTM/eIsland
 *
 * Copyright (C) 2026 JNTMTMTM
 * Copyright (C) 2026 pyisland.com
 *
 * Original author: JNTMTMTM[](https://github.com/JNTMTMTM)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */

/**
 * @file downloadEngine.ts
 * @description 多线程下载引擎核心实现。
 * @author 鸡哥
 */

import { randomUUID } from 'crypto';
import { constants } from 'fs';
import { mkdir, open, copyFile, rm, stat, unlink } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { EMIT_INTERVAL_MS } from './downloadEngine/config';
import {
  buildChunks,
  inferFileNameFromUrl,
  isAbortError,
  mergePartFiles,
  normalizeThreads,
  parseContentDispositionFileName,
  safeFileName,
  type ChunkInfo,
} from './downloadEngine/utils';
import type { DownloadTaskSnapshot } from '../types/core/DownloadTaskSnapshot';
import type { StartDownloadOptions } from '../types/core/StartDownloadOptions';

export type { DownloadTaskStatus, DownloadTaskSnapshot } from '../types/core/DownloadTaskSnapshot';
export type { StartDownloadOptions } from '../types/core/StartDownloadOptions';

interface DownloadEngineOptions {
  onTaskUpdated?: (task: DownloadTaskSnapshot) => void;
}

interface DownloadProbeResult {
  validator:string;
  fileName: string;
  totalBytes: number;
  supportsRange: boolean;
}

interface InternalTask extends DownloadTaskSnapshot {
  validator:string;
  request: typeof fetch;
  tempDir: string;
  tempOutputPath: string;
  partPaths: string[];
  supportsRange: boolean;
  abortControllers: Set<AbortController>;
  lastSampleTime: number;
  lastSampleBytes: number;
  lastEmitTime: number;
}

function toTaskSnapshot(task: InternalTask): DownloadTaskSnapshot {
  return {
    id: task.id,
    engine: 'http',
    phase: task.status === 'completed' ? 'completed' : task.phase ?? 'downloading',
    canResume: task.supportsRange && ['paused', 'failed'].includes(task.status),
    canPause: task.status === 'downloading' && task.phase !== 'merging',
    url: task.url,
    savePath: task.savePath,
    fileName: task.fileName,
    totalBytes: task.totalBytes,
    downloadedBytes: task.downloadedBytes,
    progress: task.progress,
    speedBytesPerSecond: task.speedBytesPerSecond,
    estimatedFinishAt: task.estimatedFinishAt,
    threads: task.threads,
    status: task.status,
    errorMessage: task.errorMessage,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export class MultiThreadDownloadEngine {
  private readonly tasks = new Map<string, InternalTask>();
  private readonly executions = new Map<string, Promise<void>>();

  private readonly onTaskUpdated?: (task: DownloadTaskSnapshot) => void;

  constructor(options?: DownloadEngineOptions) {
    this.onTaskUpdated = options?.onTaskUpdated;
  }

  listTasks(): DownloadTaskSnapshot[] {
    return Array.from(this.tasks.values()).map((task) => toTaskSnapshot(task));
  }

  getTask(taskId: string): DownloadTaskSnapshot | null {
    const task = this.tasks.get(taskId);
    return task ? toTaskSnapshot(task) : null;
  }

  async startDownload(options: StartDownloadOptions): Promise<DownloadTaskSnapshot> {
    const normalizedUrl = String(options.url || '').trim();
    if (!normalizedUrl) {
      throw new Error('下载地址不能为空');
    }
    const parsedUrl = new URL(normalizedUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('仅支持 HTTP/HTTPS 下载地址');
    }

    const probe = await this.probeRemoteFile(parsedUrl, options.signal, options.request);
    options.signal?.throwIfAborted();
    const threads = normalizeThreads(options.threads);
    const savePath = options.savePath && options.savePath.trim()
      ? options.inferName ? join(dirname(options.savePath.trim()), probe.fileName) : options.savePath.trim()
      : join(options.defaultDir, probe.fileName);

    await mkdir(dirname(savePath), { recursive: true });

    const taskId = options.id ?? randomUUID();
    const tempDir = join(dirname(savePath), `.eisland-download-${taskId}`);
    const tempOutputPath = join(tempDir, `target${extname(savePath) || '.tmp'}`);
    await mkdir(tempDir, { recursive: true });

    const now = Date.now();
    const task: InternalTask = {
      id: taskId,
      url: parsedUrl.toString(),
      savePath,
      fileName: basename(savePath),
      totalBytes: probe.totalBytes,
      downloadedBytes: 0,
      progress: 0,
      speedBytesPerSecond: 0,
      estimatedFinishAt: null,
      threads,
      status: 'downloading',
      engine: 'http',
      phase: 'downloading',
      canPause: true,
      createdAt: now,
      updatedAt: now,
      request: options.request ?? fetch,
      tempDir,
      tempOutputPath,
      partPaths: [],
      supportsRange: probe.supportsRange,
      validator:probe.validator,
      abortControllers: new Set<AbortController>(),
      lastSampleTime: now,
      lastSampleBytes: 0,
      lastEmitTime: 0,
    };

    this.tasks.set(task.id, task);
    this.emitTask(task, true);

    const execution = this.executeDownload(task, probe).catch(error => this.handleTaskFailure(task, error));
    this.executions.set(task.id, execution);
    void execution.finally(() => { if (this.executions.get(task.id) === execution) this.executions.delete(task.id); });

    return toTaskSnapshot(task);
  }

  cancelDownload(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (!['downloading', 'paused', 'failed'].includes(task.status)) return false;

    task.status = 'canceled';
    task.updatedAt = Date.now();
    task.abortControllers.forEach((controller) => controller.abort());
    task.abortControllers.clear();
    this.emitTask(task, true);
    void (this.executions.get(task.id) ?? Promise.resolve()).then(() => this.cleanupTaskFiles(task));
    return true;
  }

  /** Waits for all writes from an acknowledged stop before the coordinator cleans its enclosing directory. */
  async waitStopped(taskId:string):Promise<void>{await this.executions.get(taskId);}

  pauseDownload(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status !== 'downloading') return false;

    if (task.phase === 'merging') return false;
    task.status = 'paused';
    task.speedBytesPerSecond = 0;
    task.estimatedFinishAt = null;
    task.updatedAt = Date.now();
    task.abortControllers.forEach((controller) => controller.abort());
    task.abortControllers.clear();
    this.emitTask(task, true);
    return true;
  }

  async resumeDownload(taskId: string, signal?: AbortSignal, source?:{url:string;request:typeof fetch}): Promise<DownloadTaskSnapshot> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('下载任务不存在');
    }
    if (!['paused', 'failed'].includes(task.status)) {
      throw new Error('仅可继续已暂停的任务');
    }

    await this.executions.get(taskId);
    signal?.throwIfAborted();
    if (this.tasks.get(taskId) !== task || !['paused', 'failed'].includes(task.status)) throw new Error('media-task-unavailable');
    const now = Date.now();
    const previousUrl=task.url;if(source){task.url=source.url;task.request=source.request;}
    const probe = await this.probeRemoteFile(new URL(task.url), signal, task.request);
    signal?.throwIfAborted();
    if (this.tasks.get(taskId) !== task || !['paused', 'failed'].includes(task.status)) throw new Error('media-task-unavailable');

    const canResume =
      probe.supportsRange &&
      probe.totalBytes > 0 &&
      probe.totalBytes === task.totalBytes && (task.validator?probe.validator===task.validator:!probe.validator&&previousUrl===task.url);

    if (!canResume) {
      await this.cleanupTaskFiles(task);
      await mkdir(task.tempDir, { recursive: true });
      task.downloadedBytes = 0;
      task.progress = 0;
      task.partPaths = [];
    }

    signal?.throwIfAborted();
    if (this.tasks.get(taskId) !== task || !['paused', 'failed'].includes(task.status)) throw new Error('media-task-unavailable');
    task.status = 'downloading';
    task.phase = 'downloading';
    task.errorMessage = undefined;
    task.totalBytes = probe.totalBytes;
    task.supportsRange = probe.supportsRange;task.validator=probe.validator;
    task.speedBytesPerSecond = 0;
    task.estimatedFinishAt = null;
    task.abortControllers.clear();
    task.lastSampleTime = now;
    task.lastSampleBytes = task.downloadedBytes;
    task.lastEmitTime = 0;
    task.updatedAt = now;

    this.emitTask(task, true);
    const execution = this.executeDownload(task, probe).catch(error => this.handleTaskFailure(task, error));
    this.executions.set(task.id, execution);
    void execution.finally(() => { if (this.executions.get(task.id) === execution) this.executions.delete(task.id); });

    return toTaskSnapshot(task);
  }

  removeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status === 'downloading') return false;
    this.tasks.delete(taskId);
    void (this.executions.get(task.id) ?? Promise.resolve()).then(() => this.cleanupTaskFiles(task));
    return true;
  }

  private async probeRemoteFile(url: URL, signal?: AbortSignal, request: typeof fetch = fetch): Promise<DownloadProbeResult> {
    let fileName = inferFileNameFromUrl(url);
    let totalBytes = 0;
    let supportsRange = false,validator='';

    try {
      const headResponse = await request(url.toString(), { method: 'HEAD', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
      if (headResponse.ok) {
        validator=headResponse.headers.get('etag')||headResponse.headers.get('last-modified')||'';
        const contentLength = headResponse.headers.get('content-length');
        totalBytes = Number(contentLength || 0) || 0;
        const acceptRanges = (headResponse.headers.get('accept-ranges') || '').toLowerCase();
        supportsRange = acceptRanges.includes('bytes');
        const disposition = headResponse.headers.get('content-disposition') || '';
        const dispositionName = parseContentDispositionFileName(disposition);
        if (dispositionName) {
          fileName = dispositionName;
        } else if (headResponse.url) {
          fileName = inferFileNameFromUrl(new URL(headResponse.url));
        }
        const mime = (headResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const extension = ({'application/epub+zip':'.epub','application/pdf':'.pdf','audio/mpeg':'.mp3'} as Record<string,string>)[mime];
        if (extension && !fileName.toLowerCase().endsWith(extension)) fileName = fileName.replace(/\.[^.]+$/, '') + extension;
      }
    } catch {
      // ignore head errors
    }

    return {
      fileName: safeFileName(fileName),
      totalBytes,
      supportsRange,validator,
    };
  }

  private async executeDownload(task: InternalTask, probe: DownloadProbeResult): Promise<void> {
    const useMultiThread = probe.supportsRange && probe.totalBytes > 0 && task.threads > 1;

    if (useMultiThread) {
      const chunks = buildChunks(probe.totalBytes, task.threads, task.tempDir);
      task.partPaths = chunks.map((chunk) => chunk.partPath);

      // Sync downloadedBytes with actual chunk file sizes on disk
      const chunkSizes = await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const fileStat = await stat(chunk.partPath);
            return fileStat.size;
          } catch {
            return 0;
          }
        }),
      );
      const existingBytes = chunkSizes.reduce((sum, size) => sum + size, 0);
      task.downloadedBytes = Math.min(existingBytes, probe.totalBytes);
      if (existingBytes > 0) {
        this.updateTaskProgress(task);
      }

      await Promise.all(chunks.map((chunk) => this.downloadChunk(task, chunk)));
      if (task.status === 'canceled') {
        await this.cleanupTaskFiles(task);
        return;
      }
      await mergePartFiles(task.partPaths, task.tempOutputPath);
    } else {
      // Sync downloadedBytes with actual temp file size on disk
      if (probe.supportsRange && probe.totalBytes > 0) {
        try {
          const fileStat = await stat(task.tempOutputPath);
          if (fileStat.size > 0 && fileStat.size < probe.totalBytes) {
            task.downloadedBytes = fileStat.size;
            this.updateTaskProgress(task);
          } else {
            task.downloadedBytes = 0;
          }
        } catch {
          task.downloadedBytes = 0;
        }
      } else {
        task.downloadedBytes = 0;
      }

      await this.downloadSingle(task);
      if (task.status === 'canceled') {
        await this.cleanupTaskFiles(task);
        return;
      }
    }

    if (task.status !== 'downloading') return;
    const completedSize = (await stat(task.tempOutputPath)).size;
    if (task.totalBytes > 0 && completedSize !== task.totalBytes) throw Error('download-size-mismatch');
    task.phase = 'merging'; this.emitTask(task, true);
    const outputName = task.savePath, outputExt = extname(outputName);
    for (let suffix = 0; ; suffix++) {
      const target = suffix ? outputName.slice(0, outputName.length - outputExt.length) + ' (' + suffix + ')' + outputExt : outputName;
      try {
        await copyFile(task.tempOutputPath, target, constants.COPYFILE_EXCL);
        if (this.getTask(task.id)?.status !== 'downloading') { await unlink(target); await this.cleanupTaskFiles(task); return; }
        await unlink(task.tempOutputPath); task.savePath = target; task.fileName = basename(target); break;
      } catch (reason) {
        if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'EEXIST') continue;
        throw reason;
      }
    }

    if (task.totalBytes <= 0) {
      task.totalBytes = task.downloadedBytes;
    }
    task.downloadedBytes = Math.max(task.downloadedBytes, task.totalBytes);
    task.progress = 1;
    task.speedBytesPerSecond = 0;
    task.estimatedFinishAt = null;
    task.status = 'completed';
    task.updatedAt = Date.now();
    this.emitTask(task, true);

    await this.cleanupTaskFiles(task, { keepOutput: true });
  }

  private async downloadSingle(task: InternalTask): Promise<void> {
    const controller = new AbortController();
    task.abortControllers.add(controller);
    try {
      let existingSize = 0;
      if (task.supportsRange && task.totalBytes > 0) {
        try {
          const fileStat = await stat(task.tempOutputPath);
          if (fileStat.size > 0 && fileStat.size < task.totalBytes) {
            existingSize = fileStat.size;
          }
        } catch {
          // file doesn't exist
        }
      }

      const headers: Record<string, string> = {};
      if (existingSize > 0) {
        headers['Range'] = `bytes=${existingSize}-`;
      }

      const response = await task.request(task.url, { signal: controller.signal, headers });
      if (existingSize > 0 && response.status !== 206) {
        // Server doesn't support range for this request, restart
        existingSize = 0;
        task.downloadedBytes = 0;
      }
      if (!existingSize && !response.ok) {
        throw new Error(`下载请求失败: HTTP ${response.status}`);
      }
      if (!response.body) {
        throw new Error(`下载请求失败: HTTP ${response.status}`);
      }
      const contentLength = Number(response.headers.get('content-length') || 0) || 0;
      if (task.totalBytes <= 0 && contentLength > 0) {
        task.totalBytes = existingSize + contentLength;
      }

      const fileHandle = await open(task.tempOutputPath, existingSize > 0 ? 'a' : 'w');
      try {
        const reader = response.body.getReader();
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          const chunk = result.value;
          if (chunk && chunk.byteLength > 0) {
            await fileHandle.write(chunk);
            task.downloadedBytes += chunk.byteLength;
            this.updateTaskProgress(task);
          }
        }
      } finally {
        await fileHandle.close();
      }
    } finally {
      task.abortControllers.delete(controller);
    }
  }

  private async downloadChunk(task: InternalTask, chunk: ChunkInfo): Promise<void> {
    const chunkExpectedSize = chunk.end - chunk.start + 1;

    // Check existing partial data
    let existingSize = 0;
    try {
      const fileStat = await stat(chunk.partPath);
      existingSize = fileStat.size;
    } catch {
      // file doesn't exist
    }

    // Chunk already fully downloaded
    if (existingSize >= chunkExpectedSize) {
      return;
    }

    const controller = new AbortController();
    task.abortControllers.add(controller);
    try {
      const rangeStart = chunk.start + existingSize;
      const response = await task.request(task.url, {
        signal: controller.signal,
        headers: {
          Range: `bytes=${rangeStart}-${chunk.end}`,
        },
      });
      if (response.status !== 206 || !response.body) {
        throw new Error(`分片下载失败: HTTP ${response.status}`);
      }

      const fileHandle = await open(chunk.partPath, existingSize > 0 ? 'a' : 'w');
      try {
        const reader = response.body.getReader();
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          const bytes = result.value;
          if (bytes && bytes.byteLength > 0) {
            await fileHandle.write(bytes);
            task.downloadedBytes += bytes.byteLength;
            this.updateTaskProgress(task);
          }
        }
      } finally {
        await fileHandle.close();
      }
    } finally {
      task.abortControllers.delete(controller);
    }
  }

  private updateTaskProgress(task: InternalTask): void {
    const now = Date.now();
    const elapsedMs = Math.max(1, now - task.lastSampleTime);
    const deltaBytes = task.downloadedBytes - task.lastSampleBytes;

    task.speedBytesPerSecond = Math.max(0, Math.round((deltaBytes / elapsedMs) * 1000));
    task.lastSampleBytes = task.downloadedBytes;
    task.lastSampleTime = now;
    task.updatedAt = now;

    if (task.totalBytes > 0 && task.speedBytesPerSecond > 0 && task.downloadedBytes < task.totalBytes) {
      const remainBytes = task.totalBytes - task.downloadedBytes;
      const remainSeconds = remainBytes / task.speedBytesPerSecond;
      task.estimatedFinishAt = now + Math.max(0, Math.round(remainSeconds * 1000));
    } else {
      task.estimatedFinishAt = null;
    }

    if (task.totalBytes > 0) {
      task.progress = Math.max(0, Math.min(1, task.downloadedBytes / task.totalBytes));
    }

    this.emitTask(task, false);
  }

  private emitTask(task: InternalTask, force: boolean): void {
    const now = Date.now();
    if (!force && now - task.lastEmitTime < EMIT_INTERVAL_MS) return;
    task.lastEmitTime = now;
    this.onTaskUpdated?.(toTaskSnapshot(task));
  }

  private async cleanupTaskFiles(task: InternalTask, options?: { keepOutput?: boolean }): Promise<void> {
    if (!options?.keepOutput) {
      await rm(task.tempOutputPath, { force: true }).catch(() => {});
    }
    if (task.partPaths.length > 0) {
      await Promise.all(task.partPaths.map((path) => rm(path, { force: true }).catch(() => {})));
    }
    await rm(task.tempDir, { recursive: true, force: true }).catch(() => {});
  }

  private handleTaskFailure(task: InternalTask, error: unknown): void {
    if (task.status === 'paused') {
      task.speedBytesPerSecond = 0;
      task.estimatedFinishAt = null;
      task.updatedAt = Date.now();
      this.emitTask(task, true);
      return;
    }

    if (task.status === 'canceled' || isAbortError(error)) {
      task.status = 'canceled';
      task.speedBytesPerSecond = 0;
      task.estimatedFinishAt = null;
      task.updatedAt = Date.now();
      this.emitTask(task, true);
      void (this.executions.get(task.id) ?? Promise.resolve()).then(() => this.cleanupTaskFiles(task));
      return;
    }

    task.status = 'failed';
    task.errorMessage = error instanceof Error ? error.message : String(error);
    task.speedBytesPerSecond = 0;
    task.estimatedFinishAt = null;
    task.updatedAt = Date.now();
    this.emitTask(task, true);
    void (this.executions.get(task.id) ?? Promise.resolve()).then(() => this.cleanupTaskFiles(task));
  }
}
