/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file toolHooks.ts @description 工具持久化订阅和可取消任务状态。 @author 鸡哥 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolData, FusionToolsApi } from '../../../../preload/types/fusionTools';
import type { DataResult } from './dataOperations';
import type { UtilityJob, DiffPart } from './utilityOperations';

/** 订阅主进程的版本化工具数据。
 * @returns 数据、错误和项目写入方法。
 */
export function useToolData() {
  const [data, setData] = useState<ToolData>({ version: 1, revision: 0, notes: [], colors: [], bookmarks: [] });
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const update = (value: ToolData): void => { if (mounted) setData(old => value.revision >= old.revision ? value : old); };
    const off = window.api.onFusionToolData(update);
    void window.api.fusionToolData().then(update).catch(reason => { if (mounted) setError(String(reason)); });
    return () => { mounted = false; off(); };
  }, []);
  const write = useCallback(async (...args: Parameters<FusionToolsApi['fusionToolWrite']>): Promise<void> => {
    try { setError(''); const value = await window.api.fusionToolWrite(...args); setData(old => value.revision >= old.revision ? value : old); }
    catch (reason) { setError(String(reason)); throw reason; }
  }, []);
  return { data, error, write };
}

/** 每次任务使用独立工作线程，取消后不接收过期结果。
 * @returns 任务状态、启动和取消方法。
 */
export function useToolJob() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | DiffPart[] | Uint8Array | DataResult | null>(null);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback((): void => {
    worker.current?.terminate(); worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; setBusy(false);
  }, []);
  const run = useCallback((job: UtilityJob): void => {
    cancel(); setError(''); setResult(null); setBusy(true);
    const instance = new Worker(new URL('./utility.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = event => { if (worker.current !== instance) return; setError(event.data.error || ''); setResult(event.data.result ?? null); cancel(); };
    instance.onerror = event => { if (worker.current !== instance) return; setError(event.message); cancel(); };
    timer.current = setTimeout(() => { setError('job-timeout'); cancel(); }, job.kind === 'regex' ? 1500 : job.kind === 'pdf' ? 60000 : 10000);
    instance.postMessage(job);
  }, [cancel]);
  useEffect(() => () => { worker.current?.terminate(); if (timer.current) clearTimeout(timer.current); }, []);
  return { busy, error, result, run, cancel };
}
