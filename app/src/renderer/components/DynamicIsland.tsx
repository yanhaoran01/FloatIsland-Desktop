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
 * @file DynamicIsland.tsx
 * @description 灵动岛主组件，使用状态模式管理 idle/hover/expanded 等状态
 * @author 鸡哥
 */

import { AgentHud } from './fusion/AgentHud';
import { useFusionDock } from './fusion/useFusionDock';
import { useFusionActivity } from './fusion/fusionActivity';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import useIslandStore from '../store/isLandStore';
import { DynamicIslandBackground } from './components/DynamicIslandBackground';
import { DynamicIslandStateContent } from './components/DynamicIslandStateContent';
import { useDynamicIslandCoordinator } from './hooks/useDynamicIslandCoordinator';

export type { IslandState } from './hooks/useDynamicIslandShell';
export { AI_CHAT_CLIPBOARD_URL_EVENT, getStateClassName, STATE_CONFIGS } from './config/dynamicIslandConfig';

/**
 * 灵动岛主组件
 * @description 使用状态模式管理不同状态的 UI 渲染
 */
function DynamicIsland(): JSX.Element {
  const { t, i18n } = useTranslation();
  const store = useIslandStore();
  const {
    state,
    weather,
    timerData,
    notification,
    pomodoroRunning,
    pomodoroRemaining,
  } = store;

  const dock = useFusionDock(state);
  const activity = useFusionActivity();
  const waiting = (activity.codex?.pendingRequests.length || 0) + (activity.dsh?.pendingRequests.length || 0);
  const {
    handleIslandClick,
    shellClassName,
    shellStyle,
    timeStr,
    dayStr,
    fullTimeStr,
    lunarStr,
    bgMedia,
    bgVideoElementRef,
    bgVideoHwDecode,
    bgVideoMuted,
    bgVideoVolume,
    bgVideoFit,
    handleVideoLoadedMetadata,
    handleVideoCanPlay,
  } = useDynamicIslandCoordinator({
    store,
    t,
    language: i18n.resolvedLanguage,
  });

  return (<>
    {dock.dock?.strip && <button className="fusion-dock-handle" data-edge={dock.dock.config.edge} data-waiting={waiting>0} aria-label={t('fusion.dock.reveal')} onClick={() => { void window.api.fusionDockReveal(); }} />}
    <div
      {...{onPointerDown:dock.onPointerDown,onPointerMove:dock.onPointerMove,onPointerUp:dock.onPointerUp,onPointerCancel:dock.onPointerCancel,onLostPointerCapture:dock.onLostPointerCapture,onClickCapture:dock.onClickCapture}}
      data-dock-preview={dock.dock?.preview || undefined}
      data-dock-edge={dock.dock?.config.edge || 'top'}
      data-island-state={state}
      className={shellClassName}
      onClick={handleIslandClick}
      style={shellStyle}
    >
      {dock.dock?.config.mode==='simple'&&<AgentHud config={dock.dock.config} active={['idle','hover','expanded'].includes(state)}/>}
      {(dock.dock?.config.mode!=='simple'||!['idle','hover','expanded'].includes(state))&&<DynamicIslandBackground
        bgMedia={bgMedia}
        bgVideoElementRef={bgVideoElementRef}
        bgVideoHwDecode={bgVideoHwDecode}
        bgVideoMuted={bgVideoMuted}
        bgVideoVolume={bgVideoVolume}
        bgVideoFit={bgVideoFit}
        onVideoLoadedMetadata={handleVideoLoadedMetadata}
        onVideoCanPlay={handleVideoCanPlay}
      />}
      <DynamicIslandStateContent
        compactHud={dock.dock?.config.mode==='simple'}
        state={state}
        timeStr={timeStr}
        dayStr={dayStr}
        weather={weather}
        timerState={timerData?.state ?? 'idle'}
        remainingSeconds={timerData?.remainingSeconds ?? 0}
        pomodoroRunning={pomodoroRunning}
        pomodoroRemaining={pomodoroRemaining}
        fullTimeStr={fullTimeStr}
        lunarStr={lunarStr}
        notification={notification}
      />
    </div></>
  );
}

export default DynamicIsland;
