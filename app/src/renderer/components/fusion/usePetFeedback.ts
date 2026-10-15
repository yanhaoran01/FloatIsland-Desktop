/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file usePetFeedback.ts @description 按会话和消息去重角色反馈，优先真实状态并取消旧动作。 @author 鸡哥 */
import { useEffect, useRef, useState } from 'react';
import { actionDuration } from './avatarController';
import { contentReaction, type ContentReaction } from './petFeedback';
import type { FusionPetMood } from './FusionPet';
interface FeedbackInput { session: string; message?: { id: string; text: string }; working: boolean; priority: FusionPetMood; active: boolean; }
/**
 * 仅在亲眼观察到任务完成后分析回复，历史载入、流式变化与取消不会触发庆祝。
 * @param input - 会话、完成回复和真实状态。
 * @returns 当前反馈及取消旧动作的方法。
 */
export function usePetFeedback({ session, message, working, priority, active }: FeedbackInput): { reaction: ContentReaction; cancel: () => void } {
  const [reaction, setReaction] = useState<ContentReaction>('idle');
  const observed = useRef({ session, working: false, cancelled: false, completed: false, baseline: '' });
  const seen = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = (): void => { clearTimeout(timer.current); timer.current = undefined; setReaction('idle'); };
  useEffect(() => {
    if (observed.current.session !== session) { observed.current = { session, working: false, cancelled: false, completed: false, baseline: '' }; clear(); }
    const state = observed.current;
    if(!active){state.completed=false;state.cancelled=true;state.working=false;clear();return;}
    if (['listening', 'thinking', 'error', 'waiting'].includes(priority)) clear();
    if (priority === 'listening') { state.cancelled = true; state.completed = false; }
    if (working) { if (!state.working) { state.cancelled = false; state.baseline = (message?.id || '') + ':' + (message?.text || ''); } state.working = true; state.completed = false; clear(); return; }
    if (state.working) { state.working = false; state.completed = !state.cancelled && priority !== 'error'; }
    if (!active || !state.completed || !message || priority === 'listening' || priority === 'thinking' || priority === 'error' || priority === 'waiting') return;
    if (state.baseline === message.id + ':' + message.text) return;
    const id = session + ':' + message.id;
    if (seen.current.has(id)) return;
    state.completed = false; seen.current.add(id);
    // Keep per-mount deduplication bounded even in a long-lived desktop session.
    if (seen.current.size > 500) seen.current.delete(seen.current.values().next().value!);
    const next = contentReaction(message.text); setReaction(next);
    timer.current = setTimeout(() => setReaction('idle'), Math.ceil(actionDuration(next==='warning'?'alert':next==='thanks'?'wink':'wide')*1000)+50);
  }, [session, message?.id, message?.text, working, priority, active]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { reaction, cancel: () => { observed.current.cancelled = true; observed.current.completed = false; clear(); } };
}
