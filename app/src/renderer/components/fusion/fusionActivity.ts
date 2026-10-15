/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/**
 * @file fusionActivity.ts
 * @description Renderer-wide activity subscriptions, independent of workspace page lifetime.
 * @author 鸡哥
 */
import { create } from 'zustand';
import type { FusionCodexSnapshot, FusionDshSnapshot, FusionEchoCodexSessionsSnapshot } from '../../../preload/types/fusion';
import type { AssistantConversation } from '../../../preload/types/fusionWorkspace';
interface Activity {
  codex: FusionCodexSnapshot | null;
  dsh: FusionDshSnapshot | null;
  echo: FusionEchoCodexSessionsSnapshot | null;
  assistants: Record<string, AssistantConversation>;
}
export const useFusionActivity = create<Activity>(() => ({ codex: null, dsh: null, echo: null, assistants: {} }));

/** Attaches shared snapshots without starting an Agent or loading a conversation. */
export function subscribeFusionActivity(): () => void {
  let disposed = false;
  const apply = (value: Partial<Activity>): void => { if (!disposed) useFusionActivity.setState(value); };
  void window.api.fusionCodexSnapshot().then((codex) => apply({ codex })).catch(() => {});
  void window.api.fusionDshSnapshot().then((dsh) => apply({ dsh })).catch(() => {});
  void window.api.fusionEchoCodexSessions().then((echo) => apply({ echo })).catch(() => {});
  const receiveAssistant = (value: AssistantConversation): void => {
    if (!disposed) useFusionActivity.setState(previous => ({ assistants: { ...previous.assistants, [value.key]: value } }));
  };
  for (const provider of ['openai', 'anthropic', 'ollama'] as const) {
    void window.api.fusionAssistantConversations(provider).then(values => values.forEach(receiveAssistant)).catch(() => {});
  }
  const unsubscribe = [
    window.api.onFusionCodexUpdated((codex) => apply({ codex })),
    window.api.onFusionDshUpdated((dsh) => apply({ dsh })),
    window.api.onFusionEchoCodexSessionsUpdated((echo) => apply({ echo })),
    window.api.onFusionAssistantConversation(receiveAssistant),
  ];
  return () => { disposed = true; unsubscribe.forEach((stop) => stop()); };
}
