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
 * @file StandaloneWindow.tsx
 * @description 倒数日/TODOs/设置 独立窗口根组件 — 浏览器风格顶部 Tab 切换
 * @author 鸡哥
 */

import { useEffect, type ReactElement } from 'react';
import { MaxExpandContent } from './states/maxExpand/MaxExpandContent';
import { initializeFusionPreferences } from './fusion/fusionPreferences';
import { subscribeFusionActivity } from './fusion/fusionActivity';
import useIslandStore from '../store/slices';
import type { WorkspaceTarget } from '../../preload/types/fusionWorkspace';
import './fusion/fusionIsland.css';
import './fusion/workspaceEnhancement.css';
import './fusion/floatStage.css';
import './fusion/compactWorkspace.css';
/** Mounts the full workspace independently from the island's compact view. */
export function StandaloneWindow(): ReactElement {
  useEffect(() => {
    void initializeFusionPreferences();
    const stopActivity = subscribeFusionActivity();
    const route = (target: WorkspaceTarget): void => {
      useIslandStore.getState().setMaxExpandTab(target.tab || 'fusionSessions');
      if (target.sessionKey) {
        const provider = target.sessionKey.split(':')[0];
        localStorage.setItem('fusion.provider', provider);
        localStorage.setItem('fusion.session.' + provider, target.sessionKey.slice(provider.length + 1));
      }
    };
    const stopRoute = window.api.onWorkspaceTarget(route);
    void window.api.workspaceTarget().then(route);
    return () => { stopActivity(); stopRoute(); };
  }, []);
  return <main className="fusion-workbench">
    <MaxExpandContent />
  </main>;
}
