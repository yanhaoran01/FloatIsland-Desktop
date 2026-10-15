/*
 * FusionIsland - derived from eIsland (https://github.com/JNTMTMTM/eIsland).
 * Copyright (C) 2026 JNTMTMTM and FusionIsland contributors.
 * Licensed under the GNU General Public License, version 3 or later.
 */
/**
 * @file bootstrap.ts
 * @description 在加载原生模块前建立启动日志和单实例保护，启动失败时给出可见提示。
 * @author 鸡哥
 */
import { app, BrowserWindow, dialog } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { BRAND, brandName } from '../shared/brand';
app.setName(BRAND.internalName);
const retainedUserData = app.getPath('userData');
app.setName(BRAND.englishName);
app.setPath('userData', retainedUserData);
const logDirectory = join(app.getPath('userData'), 'logs');
const logFile = join(logDirectory, 'startup.log');
let failed = false;

function writeStartupLog(message: string): void {
  try {
    mkdirSync(logDirectory, { recursive: true });
    appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch {
    console.error(message);
  }
}

function reportStartupFailure(error: unknown): void {
  if (failed) return;
  failed = true;
  // 动态模块加载器可能包装底层错误；保留 cause 才能定位缺失的原生依赖。
  const causes: string[] = [];
  const visited = new Set<unknown>();
  let current = error;
  while (current != null && !visited.has(current) && causes.length < 5) {
    visited.add(current);
    causes.push(current instanceof Error ? current.stack || current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  const detail = causes.join('\nCaused by: ');
  writeStartupLog(detail);
  void app.whenReady().then(() => {
    const chinese = app.getLocale().toLowerCase().startsWith('zh');
    dialog.showErrorBox(
      chinese ? `${brandName('zh')} 启动失败` : `${BRAND.englishName} could not start`,
      chinese
        ? `启动失败，详细信息已记录到：\n${logFile}\n\n${detail}`
        : `Startup failed. Details were saved to:\n${logFile}\n\n${detail}`,
    );
    app.exit(1);
  });
}

process.on('uncaughtException', reportStartupFailure);
process.on('unhandledRejection', (error) => {
  if (BrowserWindow.getAllWindows().length === 0) reportStartupFailure(error);
  else writeStartupLog(`Unhandled rejection: ${error instanceof Error ? error.stack : String(error)}`);
});
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  writeStartupLog(`Starting ${BRAND.englishName} ${app.getVersion()} (${process.arch})`);
  void import('./index').catch(reportStartupFailure);
}
