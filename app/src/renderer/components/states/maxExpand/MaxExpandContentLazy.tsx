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
 * @file MaxExpandContentLazy.tsx
 * @description MaxExpand 性能模式懒加载内容实现。
 * @author 鸡哥
 */

import { Suspense, lazy } from 'react';
import type { ReactElement } from 'react';
import type { MaxExpandTab } from '../../../store/types';
import { MaxExpandContentShell } from './MaxExpandContentShell';

const AiChatTab = lazy(() => import('./components/agent/components/AiChatTab').then((module) => ({ default: module.AiChatTab })));
const AlbumTab = lazy(() => import('./components/album/components/AlbumTab').then((module) => ({ default: module.AlbumTab })));
const MailTab = lazy(() => import('./components/mail').then((module) => ({ default: module.MailTab })));
const SettingsTab = lazy(() => import('../../fusion/FusionSettings').then((module) => ({ default: module.FusionSettings })));
const CountdownTab = lazy(() => import('./components/countdown').then((module) => ({ default: module.CountdownTab })));
const MemoTab = lazy(() => import('./components/memo/components/MemoTab').then((module) => ({ default: module.MemoTab })));
const AlarmTab = lazy(() => import('./components/alarm/components/AlarmTab').then((module) => ({ default: module.AlarmTab })));
const MiniGameTab = lazy(() => import('./components/MiniGameTab').then((module) => ({ default: module.MiniGameTab })));
const StockTab = lazy(() => import('./components/stock').then((module) => ({ default: module.StockTab })));
const CliTab = lazy(() => import('./components/cli').then((module) => ({ default: module.CliTab })));
const CalculatorTab = lazy(() => import('./components/calculator').then((module) => ({ default: module.CalculatorTab })));
const FusionSessionsTab = lazy(() => import('../../fusion/FusionSessionsTab').then((module) => ({ default: module.FusionSessionsTab })));
const FusionToolsTab = lazy(() => import('../../fusion/FusionToolsTab').then((module) => ({ default: module.FusionToolsTab })));

function renderLazyActiveTab(activeTab: MaxExpandTab, loadingFallback: ReactElement, contentReady: boolean): ReactElement | null {
  if (!contentReady) return loadingFallback;
  let content: ReactElement | null = null;
  if (activeTab === 'fusionSessions') content = <FusionSessionsTab />;
  if (activeTab === 'aiChat') content = <AiChatTab />;
  if (activeTab === 'todo') content = <FusionToolsTab request={{ id: 'todo', nonce: 1 }} />;
  if (activeTab === 'urlFavorites') content = <FusionToolsTab request={{ id: 'urlFavorites', nonce: 1 }} />;
  if (activeTab === 'localFileSearch') content = <FusionToolsTab request={{ id: 'localFileSearch', nonce: 1 }} />;
  if (activeTab === 'clipboardHistory') content = <FusionToolsTab request={{ id: 'clipboardHistory', nonce: 1 }} />;
  if (activeTab === 'album') content = <AlbumTab />;
  if (activeTab === 'mail') content = <MailTab />;
  if (activeTab === 'memo') content = <MemoTab />;
  if (activeTab === 'countdown') content = <CountdownTab />;
  if (activeTab === 'alarm') content = <AlarmTab />;
  if (activeTab === 'toolbox') content = <FusionToolsTab />;
  if (activeTab === 'miniGame') content = <MiniGameTab />;
  if (activeTab === 'stock') content = <StockTab />;
  if (activeTab === 'cli') content = <CliTab />;
  if (activeTab === 'calculator') content = <CalculatorTab />;
  if (activeTab === 'settings') content = <SettingsTab />;
  return <Suspense fallback={loadingFallback}>{content}</Suspense>;
}

/**
 * 渲染 MaxExpand 的懒加载内容（性能模式）。
 */
export function MaxExpandContentLazy(): ReactElement {
  return <MaxExpandContentShell renderActiveTab={renderLazyActiveTab} />;
}
