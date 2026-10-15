/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file fusionToolStore.ts @description 按便签和收藏项目更新持久化数据，避免整表覆盖。 @author 鸡哥 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { ToolData, ToolNote, ToolBookmark } from '../../preload/types/fusionTools';
const isText = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length <= limit;
/** 只允许常规网页地址。
 * @param raw - 用户输入网址。
 * @returns 规范化的 HTTP/HTTPS 地址。
 */
export function normalizeWebUrl(raw: string): string {
  if (!isText(raw, 8192) || !raw.trim()) throw new Error('invalid-url');
  const value = raw.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid-url');
  return url.href;
}
/** 版本化的小型工具数据仓库。 */
export class FusionToolStore {
  private data: ToolData = { version: 1, revision: 0, notes: [], colors: [], bookmarks: [] };

  /** 从应用专用目录读取数据。
   * @param file - 本地 JSON 文件。
   */
  constructor(private file: string) {
    if (existsSync(file)) {
      try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as ToolData;
      if (saved.version !== 1 || !Array.isArray(saved.notes) || !Array.isArray(saved.colors) || !Array.isArray(saved.bookmarks)) throw new Error('invalid-tool-data');
      if (!Number.isSafeInteger(saved.revision) || saved.revision < 0 || saved.notes.length > 1000 || saved.bookmarks.length > 500 || saved.colors.length > 100 ||
        !saved.notes.every(note => note && isText(note.id, 100) && isText(note.title, 200) && isText(note.text, 1_000_000) && Number.isFinite(note.updated)) ||
        !saved.bookmarks.every(bookmark => bookmark && isText(bookmark.id, 100) && isText(bookmark.title, 200) && normalizeWebUrl(bookmark.url) === bookmark.url) ||
        !saved.colors.every(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) throw new Error('invalid-tool-data');
      this.data = saved;
      } catch (error) {
        renameSync(file, `${file}.invalid-${Date.now()}.bak`);
        console.warn('Tool data was preserved in a backup after a read error:', error);
      }
    }
  }

  /** 返回不可变快照。
   * @returns 当前工具数据。
   */
  snapshot(): ToolData { return structuredClone(this.data); }

  /** 校验并原子保存一次项目变更。
   * @param kind - 有限变更类型。
   * @param value - 便签、收藏、颜色或删除 ID。
   * @returns 保存后的快照。
   */
  write(kind: string, value: unknown): ToolData {
    const next = this.snapshot();
    if (kind === 'note') {
      const note = value as ToolNote;
      if (!note || !isText(note.id, 100) || !note.id || !isText(note.title, 200) || !isText(note.text, 1_000_000)) throw new Error('invalid-note');
      if(note.tags!==undefined&&(!Array.isArray(note.tags)||note.tags.length>20||note.tags.some(tag=>!isText(tag,80))))throw Error('invalid-note');
      const row = { id: note.id, title: note.title, text: note.text, tags:note.tags?[...new Set(note.tags)]:[],updated: Date.now() };
      const index = next.notes.findIndex(item => item.id === row.id);
      if (index < 0) next.notes.unshift(row); else next.notes[index] = row;
    } else if (kind === 'bookmark') {
      const bookmark = value as ToolBookmark;
      if (!bookmark || !isText(bookmark.id, 100) || !bookmark.id || !isText(bookmark.title, 200)) throw new Error('invalid-bookmark');
      const row = { id: bookmark.id, title: bookmark.title, url: normalizeWebUrl(bookmark.url) };
      next.bookmarks = [...next.bookmarks.filter(item => item.id !== row.id), row];
    } else if (kind === 'deleteNote' || kind === 'deleteBookmark') {
      if (!isText(value, 100)) throw new Error('invalid-id');
      if (kind === 'deleteNote') next.notes = next.notes.filter(item => item.id !== value);
      else next.bookmarks = next.bookmarks.filter(item => item.id !== value);
    } else if (kind === 'colors') {
      if (!Array.isArray(value) || value.length > 100 || !value.every(item => typeof item === 'string' && /^#[0-9a-f]{6}$/i.test(item))) throw new Error('invalid-colors');
      next.colors = [...new Set(value as string[])];
    } else throw new Error('invalid-tool-action');
    if (next.notes.length > 1000 || next.bookmarks.length > 500) throw new Error('tool-data-limit');
    next.revision++;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(next), 'utf8');
    renameSync(`${this.file}.tmp`, this.file);
    this.data = next;
    return this.snapshot();
  }
}
