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
 * @file DynamicIslandStateContent.tsx
 * @description 灵动岛状态内容路由组件。
 * @author 鸡哥
 */

import { useEffect, useState, type JSX } from 'react';
import { MediaBar } from '../fusion/MediaBar';
import { useMediaState } from '../fusion/mediaState';
import { useMusicState } from '../fusion/musicState';
import { FusionCompact } from '../fusion/FusionCompact';
import { FusionGuide } from '../fusion/FusionGuide';
import { subscribeFusionActivity } from '../fusion/fusionActivity';
import { initializeFusionPreferences } from '../fusion/fusionPreferences';
import type { NotificationData, WeatherData } from '../../store/types';
import { NotificationContent } from '../states/notification/NotificationContent';
import { FusionChat } from '../fusion/FusionChat';
import { LyricsContent } from '../states/lyrics/LyricsContent';
import { LyricsTranslationContent } from '../states/lyricsTranslation/LyricsTranslationContent';
import { LoginContent } from '../states/login';
import { RegisterContent } from '../states/register/RegisterContent';
import { ResetPasswordContent } from '../states/resetPassword';
import { PaymentContent } from '../states/payment/PaymentContent';
import { QuestionnaireContent } from '../states/questionnaire';
import { AnnouncementContent } from '../states/announcement/AnnouncementContent';
import { AgentVoiceInputContent } from '../states/agentVoiceInput/AgentVoiceInputContent';
import { AgentContent } from '../states/agent/AgentContent';
import { SttContent } from '../states/stt/SttContent';
import { CliContent } from '../states/cli/CliContent';
import { SetPasswordContent } from '../states/setPassword';
import { BindOAuthContent } from '../states/bindOAuth';
import { BindEmailContent } from '../states/bindEmail';
import { MusicProvidersLoginContent } from '../states/musicProvidersLogin';
import type { IslandState } from '../hooks/useDynamicIslandShell';

interface DynamicIslandStateContentProps {
  state: IslandState;
  compactHud?: boolean;
  timeStr: string;
  dayStr: string;
  weather: WeatherData;
  timerState: 'idle' | 'running' | 'paused';
  remainingSeconds: number;
  pomodoroRunning: boolean;
  pomodoroRemaining: number;
  fullTimeStr: string;
  lunarStr: string;
  notification: NotificationData;
}

/**
 * @description 根据当前状态渲染对应的内容组件。
 * @param props - 状态内容渲染参数。
 * @returns 对应状态的内容节点；无匹配时返回 null。
 */
function TransientStateContent({ state, notification }: DynamicIslandStateContentProps): JSX.Element | null {
  if (state === 'idle') return <FusionCompact />;
  if (state === 'hover' || state === 'expanded') return <FusionCompact overview />;

  if (state === 'notification') {
    return (
      <NotificationContent
        title={notification.title}
        body={notification.body}
        icon={notification.icon}
        type={notification.type}
        sourceAppId={notification.sourceAppId}
        updateVersion={notification.updateVersion}
        updateSourceLabel={notification.updateSourceLabel}
        weatherAlertTime={notification.weatherAlertTime}
        startupUpdateSource={notification.startupUpdateSource}
        startupUpdateResolvedUrl={notification.startupUpdateResolvedUrl}
        urls={notification.urls}
        breakReminderItemId={notification.breakReminderItemId}
        agentName={notification.agentName}
      />
    );
  }


  if (state === 'lyrics') return <LyricsContent />;
  if (state === 'lyricsTranslation') return <LyricsTranslationContent />;
  if (state === 'guide') return <FusionGuide />;
  if (state === 'login') return <LoginContent />;
  if (state === 'register') return <RegisterContent />;
  if (state === 'resetPassword') return <ResetPasswordContent />;
  if (state === 'setPassword') return <SetPasswordContent />;
  if (state === 'bindOAuth') return <BindOAuthContent />;
  if (state === 'bindEmail') return <BindEmailContent />;
  if (state === 'musicProvidersLogin') return <MusicProvidersLoginContent />;
  if (state === 'payment') return <PaymentContent />;
  if (state === 'announcement') return <AnnouncementContent />;
  if (state === 'questionnaire') return <QuestionnaireContent />;
  if (state === 'agentVoiceInput') return <AgentVoiceInputContent />;
  if (state === 'agent') return <AgentContent />;
  if (state === 'stt') return <SttContent />;
  if (state === 'cli') return <CliContent />;

  return null;
}

/** Keeps the workspace alive while the capsule is visible, preserving drafts and subscriptions. */
export function DynamicIslandStateContent(props: DynamicIslandStateContentProps): JSX.Element {
  const music = useMusicState();
  const media = useMediaState().some(item => item.active) || Boolean(music?.active);
  const [opened, setOpened] = useState(props.state === 'maxExpand');
  useEffect(() => { if (props.state === 'maxExpand') setOpened(true); }, [props.state]);
  useEffect(() => { void initializeFusionPreferences(); return subscribeFusionActivity(); }, []);
  return <>
    <div className="fusion-retained-workspace" hidden={props.state !== 'maxExpand'}>
      {(opened || props.state === 'maxExpand') && <FusionChat compact visible={props.state === 'maxExpand'} />}
    </div>
    {props.state !== 'maxExpand' && !(props.compactHud && ['idle','hover','expanded'].includes(props.state)) && (media && ['idle', 'hover', 'expanded'].includes(props.state) ? <MediaBar collapsed /> : <TransientStateContent {...props} />)}
  </>;
}
