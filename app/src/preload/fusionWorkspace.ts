/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file fusionWorkspace.ts @description Allowlisted workspace and recording IPC. @author 鸡哥 */
import { ipcRenderer } from 'electron';
import { fusionToolsApi } from './fusionTools';
import type { FusionWorkspaceApi } from './types/fusionWorkspace';
const listen = <T>(channel: string, callback: (value: T) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, value: T): void => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
export const fusionWorkspaceApi: FusionWorkspaceApi = {
  fusionHudDismiss:id=>ipcRenderer.invoke('fusion:hud:dismiss',id),
  fusionHudSnapshot:()=>ipcRenderer.invoke('fusion:hud:snapshot'),
  onFusionHud:callback=>listen('fusion:hud:updated',callback),
  fusionHudPanel:open=>ipcRenderer.invoke('fusion:hud:panel',open),
  fusionGenie:(command,value)=>ipcRenderer.invoke('fusion:genie',command,value),
  onFusionGenieCancelled:callback=>listen('fusion:genie:cancelled',callback),
  fusionWorkBuddyGet:()=>ipcRenderer.invoke('fusion:workbuddy:get'),
  fusionWorkBuddySave:config=>ipcRenderer.invoke('fusion:workbuddy:save',config),
  fusionViewportGet:()=>ipcRenderer.invoke('fusion:viewport:get'),
  fusionViewportControl:(command,value)=>ipcRenderer.invoke('fusion:viewport:control',command,value),
  onFusionViewport:callback=>listen('fusion:viewport:changed',callback),
  ...fusionToolsApi,
  fusionOnboardingGet: () => ipcRenderer.invoke('fusion:onboarding:get'),
  fusionOnboardingSave: patch => ipcRenderer.invoke('fusion:onboarding:save',patch),
  fusionOnboardingFinish: status => ipcRenderer.invoke('fusion:onboarding:finish',status),
  fusionOnboardingReopen: () => ipcRenderer.invoke('fusion:onboarding:reopen'),
  onFusionOnboarding: callback => listen('fusion:onboarding:state',callback),
  fusionConfigBackup: action => ipcRenderer.invoke('fusion:config:backup',action),
  fusionDockGet: () => ipcRenderer.invoke('fusion:dock:get'),
  fusionDockSave: patch => ipcRenderer.invoke('fusion:dock:save',patch),
  fusionDockReset: () => ipcRenderer.invoke('fusion:dock:reset'),
  fusionDockReveal: () => ipcRenderer.invoke('fusion:dock:reveal-compact'),
  fusionDockActivity: (expanded, keepVisible) => ipcRenderer.invoke('fusion:dock:activity',expanded,keepVisible),
  fusionDockDrag: action => ipcRenderer.invoke('fusion:dock:drag',action),
  onFusionDock: callback => listen('fusion:dock:changed',callback),
  onFusionReveal: callback => listen('fusion:dock:reveal',callback),
  onFusionVoiceHidden: callback => listen('fusion:voice:hidden',callback),

  fusionModels: provider => ipcRenderer.invoke('fusion:models:list', provider),
  fusionIntegrationsList: () => ipcRenderer.invoke('fusion:integrations:list'),
  fusionIntegrationChange: (source, remove) => ipcRenderer.invoke('fusion:integrations:change', source, remove),
  fusionIntegrationOpen: source => ipcRenderer.invoke('fusion:integrations:open', source),
  fusionTimersGet:()=>ipcRenderer.invoke('fusion:timers:get'),
  fusionTimersCommand:command=>ipcRenderer.invoke('fusion:timers:command',command),
  onFusionTimers:callback=>listen('fusion:timers:updated',callback),
  fusionTimerGet: () => ipcRenderer.invoke('fusion:timer:get'),
  fusionTimerFocus:options=>ipcRenderer.invoke('fusion:timer:focus',options),
  fusionTimerControl: (action, seconds) => ipcRenderer.invoke('fusion:timer:control', action, seconds),
  onFusionTimer: callback => listen('fusion:timer:updated', callback),
  fusionAvatarGet: () => ipcRenderer.invoke('fusion:avatar:get'),
  fusionAvatarSave: config => ipcRenderer.invoke('fusion:avatar:save',config),
  onFusionAvatar: callback => listen('fusion:avatar:updated',callback),
  fusionPreferencesPatch: patch => ipcRenderer.invoke('fusion:preferences:patch', patch),
  onFusionPreferences: callback => listen('fusion:preferences:updated', callback),
  fusionResizeChat: (height, width) => ipcRenderer.invoke('fusion:window:chat-height', height, width),
  fusionFocusSession: (source, id) => ipcRenderer.invoke('fusion:echo:focus', source, id),
  fusionAnswerExternalRequest: (id, action, answer) => ipcRenderer.invoke('fusion:echo:answer', id, action, answer),
  openWorkspace: target => ipcRenderer.invoke('fusion:workspace:open', target),
  workspaceTarget: () => ipcRenderer.invoke('fusion:workspace:target'),
  onWorkspaceTarget: callback => listen('fusion:workspace:target', callback),
  fusionDraftGet: key => ipcRenderer.invoke('fusion:draft:get', key),
  fusionDraftWrite: (key, revision, value) => ipcRenderer.invoke('fusion:draft:write', key, revision, value),
  onFusionDraft: callback => listen('fusion:draft:updated', callback),
  fusionDshAnswerQuestions: (id, answers) => ipcRenderer.invoke('fusion:dsh:questions:answer', id, answers),
  fusionSpeechStatus: provider => ipcRenderer.invoke('fusion:speech:status', provider),
  onFusionSpeechStatus: callback => listen('fusion:speech:updated', callback),
  fusionClaimMicrophone: requestId => ipcRenderer.invoke('fusion:voice:claim', requestId),
  fusionReleaseMicrophone: requestId => ipcRenderer.invoke('fusion:voice:release', requestId),
  fusionTranscribe: (provider, requestId, audioBase64, selection) => ipcRenderer.invoke('fusion:speech:transcribe', provider, requestId, audioBase64, selection),
  fusionCancelTranscription: id => ipcRenderer.invoke('fusion:speech:cancel', id),
  fusionVoiceGlow: (active, reducedMotion, requestId) => ipcRenderer.invoke('fusion:voice:glow', active, reducedMotion, requestId),
  fusionAssistantConversation: key => ipcRenderer.invoke('fusion:conversation:get', key),
  fusionAssistantConversations: provider => ipcRenderer.invoke('fusion:conversation:list', provider),
  fusionAssistantCreate: provider => ipcRenderer.invoke('fusion:conversation:create', provider),
  fusionAssistantPrompt: (key, text, model) => ipcRenderer.invoke('fusion:conversation:prompt', key, text, model),
  onFusionAssistantConversation: callback => listen('fusion:conversation:updated', callback),
};

