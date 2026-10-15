/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file fusionDraftStore.ts @description Versioned per-session drafts with atomic persistence. @author 鸡哥 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { DraftWriteResult, FusionDraft, VersionedDraft } from '../../preload/types/fusionWorkspace';

/** Owns revisions so two windows cannot overwrite an unseen edit. */
export class FusionDraftStore {
  private drafts: Record<string, VersionedDraft> = Object.create(null);
  constructor(private readonly file: string) {
    if (existsSync(file)) {
      try {
        const saved = JSON.parse(readFileSync(file, 'utf8'));
        if (!saved || Array.isArray(saved) || typeof saved !== 'object') throw new Error('invalid-draft-store');
        this.drafts = saved;
      } catch {
        renameSync(file, file + '.recovery-' + Date.now());
      }
    }
  }
  /** Reads a draft without creating a remote session. */
  get(key: string): VersionedDraft {
    if (typeof key !== 'string' || !key || key.length > 1024 || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('invalid-session-key');
    return structuredClone(Object.hasOwn(this.drafts, key) ? this.drafts[key] : { key, revision: 0, value: { text: '', attachments: [], project: '' } });
  }
  /** Commits only when the caller has seen the current revision. */
  write(key: string, revision: number, value: FusionDraft): DraftWriteResult {
    const current = this.get(key);
    if (current.revision !== revision) return { accepted: false, draft: current };
    if (!value || typeof value.text !== 'string' || typeof value.project !== 'string' || !Array.isArray(value.attachments) ||
      value.attachments.length > 5 || value.text.length > 2_000_000 ||
      value.attachments.some(a => !a || typeof a.id !== 'string' || typeof a.name !== 'string' || typeof a.text !== 'string' || a.text.length > 400_000)) throw new Error('invalid-draft');
    const next = { key, revision: revision + 1, value: structuredClone(value) };
    const updated = { ...this.drafts, [key]: next };
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file + '.tmp', JSON.stringify(updated), 'utf8');
    renameSync(this.file + '.tmp', this.file);
    this.drafts = updated;
    return { accepted: true, draft: structuredClone(next) };
  }
}
