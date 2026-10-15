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
 * @file toolboxTranslateApi.ts
 * @description 工具箱翻译接口 — 免账号受限翻译桥
 * @author 鸡哥
 */

import type { TranslateResponse } from './types/TranslateResponse';
import type { TranslateApiResult } from './types/TranslateApiResult';

export type { TranslateResponse, TranslateApiResult };

export async function fetchTranslate(
  text: string,
  source: string,
  target: string,
  requestId: string = crypto.randomUUID(),
): Promise<TranslateApiResult> {
  try {
    const data = await window.api.fusionTranslateText(text, source, target, requestId);
    return { success: true, data };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'translation-failed' };
  }
}
