/*
 * FusionIsland - A private Windows companion for local coding agents.
 * https://github.com/JNTMTMTM/eIsland
 *
 * Copyright (C) 2026 JNTMTMTM
 * Copyright (C) 2026 pyisland.com
 * Copyright (C) 2026 FusionIsland contributors
 *
 * Licensed under GPL-3.0 with eIsland's additional terms. See LICENSE.
 */

/**
 * @file FusionPet.tsx
 * @description 本地 SVG 角色与现有任务完成、声音接口。
 * @author 鸡哥
 */

import { useEffect, useRef, useState, type JSX } from 'react';
import {useProductStore} from './productStore';
import { BloubAvatar } from './BloubAvatar';
import { Sound } from '../../vendor/coucou/core/sound';
import './fusionIsland.css';
import { useFusionPreferences } from './fusionPreferences';

export type FusionPetMood = 'idle' | 'working' | 'waiting' | 'finished' | 'error' | 'listening' | 'thinking' | 'warning' | 'curious' | 'thanks' | 'surprised';

interface FusionPetProps {
  actionToken?:string|number;
  mood: FusionPetMood;
  label: string;
  muted: boolean;
  dropActive?: boolean;
  attachmentCount?: number;
  disabled?: boolean;
}

/**
 * Plays the original Coucou sound that matches the agent state.
 * @param mood - Companion state used to select the WAV cue.
 */
export function playFusionPetCue(mood: FusionPetMood): void {
  const cues: Record<FusionPetMood, string> = { idle: 'blip', working: 'work', waiting: 'approval', finished: 'finish', error: 'error', listening: 'blip', thinking: 'think', warning: 'approval', curious: 'question', thanks: 'love', surprised: 'pop' };
  Sound.play(cues[mood]);
}

/**
 * Shows a short celebration after an agent finishes a task and keeps stop actions neutral.
 * @param isWorking - Whether the current session is actively running a turn.
 * @param hasError - Whether the most recent transition ended with an error.
 * @param muted - Whether automatic pet cues are muted.
 * @returns Celebration state and a callback to suppress the next finish cue.
 */
export function usePetCompletion(isWorking: boolean, hasError: boolean, muted: boolean, session?: string, active = true): { finished: boolean; suppressNextFinish: () => void } {
  const reminders = useFusionPreferences((s) => s.value.completionReminders);
  const [finished, setFinished] = useState(false);
  const wasWorking = useRef(false);
  const suppress = useRef(false);
  const mutedRef = useRef(muted);
  const previousSession = useRef(session);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(() => {
    if(!active){clearTimeout(timer.current);timer.current=undefined;wasWorking.current=false;suppress.current=true;setFinished(false);return;}
    if (previousSession.current !== session || isWorking || hasError || !reminders) {
      clearTimeout(timer.current); timer.current=undefined;setFinished(false);
      if(previousSession.current!==session){previousSession.current=session;wasWorking.current=false;suppress.current=false;}
    }
    if(isWorking){wasWorking.current=true;suppress.current=false;return;}
    if(wasWorking.current){
      wasWorking.current=false;const celebrate=!suppress.current&&!hasError&&reminders;suppress.current=false;
      if(celebrate){setFinished(true);if(!mutedRef.current)playFusionPetCue('finished');timer.current=setTimeout(()=>{setFinished(false);timer.current=undefined;},2700);}
    }
  },[hasError,isWorking,reminders,session,active]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);

  const suppressNextFinish = (): void => {
    clearTimeout(timer.current);timer.current=undefined;
    suppress.current = true;
    setFinished(false);
  };
  return { finished, suppressNextFinish };
}

/**
 * 使用固定版本的 SVG 角色替换旧 Canvas 角色，保留声音与现有调用接口。
 * @param props - 真实状态、提示说明、静音和附件反馈。
 * @returns 动作仅发生在角色内部的按钮。
 */
export function FusionPet({ mood, label, muted, dropActive = false, attachmentCount = 0, disabled = false, actionToken }: FusionPetProps): JSX.Element {
  const microphoneActive=useProductStore(s=>s.record?.microphoneActive===true);
  useEffect(() => { Sound.setEnabled(!muted&&!microphoneActive); }, [muted,microphoneActive]);
  return <BloubAvatar mood={mood} label={label} disabled={disabled} dropActive={dropActive} attachmentCount={attachmentCount} actionToken={actionToken} />;
}
