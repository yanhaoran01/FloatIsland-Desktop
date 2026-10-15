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
 * @file standaloneWindow.ts
 * @description 倒数日/TODOs/设置 独立窗口服务模块
 * @author 鸡哥
 */

import type { WorkspaceTarget } from '../../preload/types/fusionWorkspace';
import { BrowserWindow, shell, screen } from 'electron';
import { fitViewSize } from './fusionViewLayout';
import {workspaceViewportSize,saveWorkspaceViewportSize} from './fusionViewport';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

let workspaceTarget: WorkspaceTarget = {};
/** Returns the latest explicit navigation target to the newly mounted view. */
export function getWorkspaceTarget(): WorkspaceTarget { return workspaceTarget; }

let standaloneWindow: BrowserWindow | null = null;

/**
 * 打开独立窗口（若已打开则聚焦）
 */
function openStandaloneWindow(target?: WorkspaceTarget): void {
  if (target) workspaceTarget = target;
  if (standaloneWindow && !standaloneWindow.isDestroyed()) {
    if (standaloneWindow.isMinimized()) standaloneWindow.restore();
    standaloneWindow.show();
    standaloneWindow.focus();
    if (target) standaloneWindow.webContents.send('fusion:workspace:target', target);
    return;
  }

  standaloneWindow = new BrowserWindow({
    ...fitViewSize({ mode: 'chat', width: 760, height: 560, page: 'workspace' }, screen.getPrimaryDisplay().workArea,workspaceViewportSize()),
    minWidth: Math.max(1,Math.min(560,screen.getPrimaryDisplay().workArea.width-24)),
    minHeight: Math.max(1,Math.min(420,screen.getPrimaryDisplay().workArea.height-24)),
    title:'FloatIsland',
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#1c1d20',
    resizable: true,
    icon: is.dev
      ? join(__dirname, '../../resources/icon/float-island.ico')
      : join(process.resourcesPath, 'icon/float-island.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  let manuallyResizing=false;
  standaloneWindow.on('will-resize',()=>{manuallyResizing=true;});
  standaloneWindow.on('resized',()=>{if(manuallyResizing&&standaloneWindow){manuallyResizing=false;saveWorkspaceViewportSize(standaloneWindow.getBounds());}});

  standaloneWindow.on('ready-to-show', () => {
    standaloneWindow?.show();
  });

  standaloneWindow.on('closed', () => {
    standaloneWindow = null;
  });

  standaloneWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    standaloneWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/DynamicIslandStandalone.html');
  } else {
    standaloneWindow.loadFile(join(__dirname, '../renderer/DynamicIslandStandalone.html'));
  }
}

/**
 * 关闭独立窗口
 */
function closeStandaloneWindow(): void {
  if (standaloneWindow && !standaloneWindow.isDestroyed()) {
    standaloneWindow.close();
  }
}

/**
 * 获取独立窗口实例
 */
function getStandaloneWindow(): BrowserWindow | null {
  return standaloneWindow;
}

export { openStandaloneWindow, closeStandaloneWindow, getStandaloneWindow };
