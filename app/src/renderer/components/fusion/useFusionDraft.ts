/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file useFusionDraft.ts @description Per-session optimistic drafts with revision conflict protection. @author 鸡哥 */
import { useEffect, useSyncExternalStore } from 'react';
import type { DraftWriteResult, FusionDraft, VersionedDraft } from '../../../preload/types/fusionWorkspace';
interface Entry { saved: VersionedDraft; value: FusionDraft; ready: boolean; dirty: number; version: number; conflict: boolean; error: string; }
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const writes = new Map<string, Promise<void>>();
const deferred = new Map<string, VersionedDraft>();
const reservations = new Set<string>();
const emit = (): void => listeners.forEach(fn => fn());
const get = (key: string): Entry => {
  if (!entries.has(key)) {
    const value = { text: '', attachments: [], project: '' };
    entries.set(key, { saved: { key, revision: 0, value }, value, ready: false, dirty: 0, version: 0, conflict: false, error: '' });
  }
  return entries.get(key)!;
};
let subscribed = false;
const receive = (draft: VersionedDraft): void => {
  const entry = get(draft.key);
  if (draft.revision <= entry.saved.revision) return;
  if (writes.has(draft.key) || reservations.has(draft.key)) {
    if (!deferred.has(draft.key) || deferred.get(draft.key)!.revision < draft.revision) deferred.set(draft.key, draft);
    return;
  }
  entries.set(draft.key, entry.dirty ? { ...entry, saved: draft, conflict: true } :
    { ...entry, saved: draft, value: draft.value, version: entry.version + 1, ready: true });
  emit();
};
const write = (key: string): Promise<void> => {
  if (reservations.has(key)) return Promise.resolve();
  if (writes.has(key)) return writes.get(key)!;
  const task = Promise.resolve().then(async () => {
    while (get(key).dirty && !get(key).conflict) {
      const entry = get(key);
      const result = await window.api.fusionDraftWrite(key, entry.saved.revision, entry.value);
      const current = get(key);
      entries.set(key, { ...current, saved: result.draft, ready: true,
        dirty: result.accepted && current.dirty === entry.dirty ? 0 : current.dirty,
        conflict: !result.accepted, error: '' });
      emit();
      if (!result.accepted) break;
    }
  }).catch(error => {
    entries.set(key, { ...get(key), error: String(error) }); emit();
  }).finally(() => {
    writes.delete(key);
    const pending = deferred.get(key);
    deferred.delete(key);
    if (pending) receive(pending);
  });
  writes.set(key, task);
  return task;
};

/** Flushes pending edits before handing a conversation to another window. */
export async function flushFusionDraft(key: string): Promise<boolean> {
  await write(key);
  const entry = get(key);
  return !entry.dirty && !entry.conflict && !entry.error;
}

/** Keeps unsaved edits local on a conflict until the user chooses which draft to keep. */
export function useFusionDraft(key: string) {
  const entry = useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => get(key));
  useEffect(() => {
    if (!subscribed) { subscribed = true; window.api.onFusionDraft(receive); }
    if (!get(key).ready) void window.api.fusionDraftGet(key).then(draft => {
      const current = get(key);
      entries.set(key, { ...current, saved: draft, value: current.dirty ? current.value : draft.value, ready: true });
      emit(); if (current.dirty) void write(key);
    }).catch(error => { entries.set(key, { ...get(key), error: String(error) }); emit(); });
  }, [key]);
  const update = (patch: Partial<FusionDraft>): void => {
    const current = get(key);
    entries.set(key, { ...current, value: { ...current.value, ...patch }, dirty: current.dirty + 1, version: current.version + 1, error: '' });
    emit(); if (current.ready) void write(key);
  };
  const resolve = (keepMine: boolean): void => {
    const current = get(key);
    entries.set(key, { ...current, conflict: false, value: keepMine ? current.value : current.saved.value, version: current.version + 1, dirty: keepMine ? current.dirty || 1 : 0 });
    emit(); if (keepMine) void write(key);
  };
  const consume = async () => {
    if (reservations.has(key)) return null;
    if (!await flushFusionDraft(key)) return null;
    if (reservations.has(key)) return null;
    const submitted = get(key);
    if (!submitted.value.text.trim() && !submitted.value.attachments.length) return null;
    const cleared = { ...submitted.value, text: '', attachments: [] };
    reservations.add(key);
    let result: DraftWriteResult;
    try {
      result = await window.api.fusionDraftWrite(key, submitted.saved.revision, cleared);
    } catch (error) {
      reservations.delete(key);
      const pending = deferred.get(key);
      deferred.delete(key);
      if (pending) receive(pending);
      if (get(key).dirty) void write(key);
      throw error;
    } finally {
      reservations.delete(key);
    }
    if (!result.accepted) {
      const pending = deferred.get(key);
      deferred.delete(key);
      receive(pending && pending.revision > result.draft.revision ? pending : result.draft);
      return null;
    }
    // A newer local edit may arrive while the main process reserves this revision.
    const current = get(key);
    const unchanged = current.version === submitted.version;
    entries.set(key, { ...current, saved: result.draft, value: unchanged ? cleared : current.value,
      dirty: unchanged ? 0 : current.dirty, conflict: false, version: current.version + 1 });
    emit();
    const pending = deferred.get(key);
    deferred.delete(key);
    if (pending) receive(pending);
    if (!unchanged) void write(key);
    const clearedVersion = get(key).version;
    return {
      value: submitted.value,
      restore: async (): Promise<void> => {
        if (get(key).version !== clearedVersion || !unchanged) return;
        const restored = await window.api.fusionDraftWrite(key, result.draft.revision, submitted.value);
        receive(restored.draft);
      },
    };
  };
  return { ...entry, update, resolve, consume, flush: () => flushFusionDraft(key) };
}
