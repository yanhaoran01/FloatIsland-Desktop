/* FloatIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file mediaPrograms.ts @description Bundled media binaries and owned Windows process trees. @author 鸡哥 */
import { app } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import koffi from 'koffi';

/** Resolves the bundled directory without falling back to user PATH. @returns Binary directory. */
export function mediaRuntimeDirectory(): string {
  const path = app.isPackaged ? join(process.resourcesPath, 'download-runtime') : join(app.getAppPath(), 'resources', 'download-runtime');
  for (const name of ['yt-dlp.exe', 'deno.exe', 'ffmpeg.exe', 'ffprobe.exe'])
    if (!existsSync(join(path, name))) throw Error('media-runtime-missing');
  return path;
}

/** Assigns a just-started process to a kill-on-close Windows job. @param pid - Owned child PID. @returns Idempotent tree cleanup. */
export function ownMediaProcessTree(pid: number): () => void {
  if (process.platform !== 'win32') throw Error('media-platform-unsupported');
  const kernel = koffi.load('kernel32.dll');
  const create = kernel.func('void * __stdcall CreateJobObjectW(void *, void *)');
  const set = kernel.func('bool __stdcall SetInformationJobObject(void *, int, void *, uint32_t)');
  const open = kernel.func('void * __stdcall OpenProcess(uint32_t, bool, uint32_t)');
  const assign = kernel.func('bool __stdcall AssignProcessToJobObject(void *, void *)');
  const close = kernel.func('bool __stdcall CloseHandle(void *)');
  const handle = create(null, null);
  if (!handle) throw Error('media-process-ownership-failed');
  const limits = Buffer.alloc(144);
  limits.writeUInt32LE(0x2000, 16); // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, x64 extended information.
  const processHandle = open(0x0101, false, pid); // SET_QUOTA | TERMINATE.
  let assigned = false;
  try { assigned = Boolean(processHandle && set(handle, 9, limits, limits.length) && assign(handle, processHandle)); }
  finally { if (processHandle) close(processHandle); }
  if (!assigned) { close(handle); throw Error('media-process-ownership-failed'); }
  let closed = false;
  return () => { if (!closed) { closed = true; close(handle); } };
}

/** Runs only the bundled extractor with argv, bounded output and full process cleanup.
 * @param args - Internally constructed flags. @param signal - Cancellation.
 * @param onLine - Structured progress receiver. @param timeout - Maximum duration.
 * @returns Extractor stdout. */
export function runMediaProgram(args: string[], signal: AbortSignal, onLine?: (line: string) => void, timeout = 180000): Promise<string> {
  signal.throwIfAborted();
  const root = mediaRuntimeDirectory();
  const base = ['--encoding', 'utf-8', '--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-js-runtimes',
    '--js-runtimes', 'deno:' + join(root, 'deno.exe'), '--ffmpeg-location', root,
    '--socket-timeout', '30', '--retries', '3', '--fragment-retries', '3'];
  return new Promise((resolve, reject) => {
    const child = spawn(join(root, 'yt-dlp.exe'), [...base, ...args], {shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let closeTree: (() => void) | undefined;
    let output = '', pending = '', errorPending = '', errors = '', failure: Error | undefined;
    const deliver = (line: string): void => {
      try { onLine?.(line); }
      catch (reason) { failure = reason instanceof Error ? reason : Error(String(reason)); closeTree?.(); child.kill(); }
    };
    const receiveErrorLine = (line: string): void => {
      if (onLine && /^FI_(PROGRESS|POST|FILE):/.test(line)) deliver(line);
      else errors = (errors + line + '\n').slice(-16000);
    };
    const abort = (): void => { failure = Error('media-cancelled'); closeTree?.(); child.kill(); };
    const timer = setTimeout(() => { failure = Error('media-timeout'); closeTree?.(); child.kill(); }, timeout);
    signal.addEventListener('abort', abort, {once: true});
    child.once('spawn', () => {
      try { closeTree = ownMediaProcessTree(child.pid!); if (signal.aborted) abort(); }
      catch (reason) { failure = reason instanceof Error ? reason : Error(String(reason)); child.kill(); }
    });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (!onLine) output += chunk;
      pending += chunk;
      const lines = pending.split(/\r?\n/); pending = lines.pop() ?? '';
      if (onLine) for (const line of lines) deliver(line);
      if (output.length > 64 * 1024 * 1024 || pending.length > 64 * 1024 * 1024) { failure = Error('media-response-too-large'); closeTree?.(); child.kill(); }
    });
    child.stderr.on('data', (chunk: string) => {
      errorPending += chunk;
      const lines = errorPending.split(/\r?\n/); errorPending = lines.pop() ?? '';
      for (const line of lines) receiveErrorLine(line);
      if (errorPending.length > 64000) { errors = errorPending.slice(-16000); errorPending = ''; }
    });
    const cleanup = (): void => { clearTimeout(timer); signal.removeEventListener('abort', abort); closeTree?.(); };
    child.once('error', reason => { failure = reason; });
    child.once('close', code => {
      if (errorPending) receiveErrorLine(errorPending);
      if (onLine && pending) deliver(pending);
      cleanup();
      if (failure) reject(failure);
      else if (code !== 0) reject(Error(errors.trim().replace(/https?:\/\/\S+/g, '[URL]').slice(-2000) || 'media-extractor-failed'));
      else resolve(output);
    });
  });
}
