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
 * @file tray.ts
 * @description 系统托盘模块：托盘图标加载、托盘实例创建及右键菜单配置
 * @author 鸡哥
 */

import { Tray, Menu, nativeImage, BrowserWindow, app, shell, nativeTheme } from 'electron';
import {BRAND,brandName} from '../shared/brand';
import zh from '../../i18n/zh-CN.json';
import en from '../../i18n/en-US.json';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { is } from '@electron-toolkit/utils';
import { revealFusionIsland } from './window/fusionDock';
import { openStandaloneWindow } from './window/standaloneWindow';

let tray: Tray | null = null;
let cachedMainWindow: BrowserWindow | null = null;

/**
 * 托盘图标路径常量
 * @description 开发环境从项目根目录加载，生产环境从 extraResources 打包目录加载
 */
const trayIconPath = ():string => join(is.dev ? join(__dirname,'../../resources') : process.resourcesPath,nativeTheme.shouldUseDarkColors ? BRAND.trayLight : BRAND.trayDark);
const trayLanguage = ():string => {try {return String(JSON.parse(readFileSync(join(app.getPath('userData'),'eIsland_store','i18n-language.json'),'utf8')));}catch{return app.getLocale();}};
const trayText = (key:keyof typeof zh.fusion.tray):string => (trayLanguage().startsWith('zh')?zh:en).fusion.tray[key];
const updateTrayIcon = ():void => {tray?.setImage(nativeImage.createFromPath(trayIconPath()));tray?.setToolTip(brandName(trayLanguage()));};

/**
 * 创建系统托盘
 * @description 初始化托盘图标、右键菜单，提供退出和显示窗口功能
 */
function createTray(mainWindow: BrowserWindow | null): Tray {
  cachedMainWindow = mainWindow;
  const icon = nativeImage.createFromPath(trayIconPath());
  tray = new Tray(icon);
  const logDir = join(app.getPath('userData'), 'logs');

  let isStandaloneMode = false;
  try {
    const storeDir = join(app.getPath('userData'), 'eIsland_store');
    const cfgPath = join(storeDir, 'standalone-window-mode.json');
    const legacyCfgPath = join(storeDir, 'countdown-window-mode.json');
    const modePath = existsSync(cfgPath) ? cfgPath : legacyCfgPath;
    if (existsSync(modePath)) {
      const raw = readFileSync(modePath, 'utf-8');
      isStandaloneMode = JSON.parse(raw) === 'standalone';
    }
  } catch { /* ignore */ }

  const menuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: trayText('show'),
      click: () => {
        revealFusionIsland();
      }
    },
    {
      label: trayText('hide'),
      click: () => {
        mainWindow?.hide();
      }
    },
  ];

  if (isStandaloneMode) {
    menuItems.push({
      label: trayText('settings'),
      click: () => {
        openStandaloneWindow();
      }
    });
  }

  menuItems.push(
    {
      label: trayText('top'),
      type: 'checkbox',
      checked: mainWindow?.isAlwaysOnTop() ?? false,
      click: (menuItem) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.setAlwaysOnTop(Boolean(menuItem.checked));
      }
    },
    { type: 'separator' },
    {
      label: trayText('logs'),
      click: async () => {
        await shell.openPath(logDir);
      }
    },
    {
      label: trayText('restart'),
      click: () => {
        app.relaunch();
        app.quit();
      }
    },
    { type: 'separator' },
    {
      label: trayText('quit'),
      click: () => {
        app.quit();
      }
    }
  );

  const contextMenu = Menu.buildFromTemplate(menuItems);
  updateTrayIcon();
  nativeTheme.removeListener('updated',updateTrayIcon);
  nativeTheme.on('updated',updateTrayIcon);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  return tray;
}

/**
 * 销毁系统托盘
 * @description 应用退出时调用，释放托盘资源
 */
function destroyTray(): void {
  nativeTheme.removeListener('updated',updateTrayIcon);
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

/**
 * 切换系统托盘图标显示/隐藏
 * @description 隐藏时销毁托盘；显示时重建托盘
 */
function toggleTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  } else {
    createTray(cachedMainWindow);
  }
}

export { createTray, destroyTray, toggleTray };
