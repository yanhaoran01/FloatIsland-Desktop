import type {GenieApi} from './genie';
import type {AgentHudApi} from './agentHud';
import type { AvatarConfig } from '../../shared/avatarConfig';
/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file fusionWorkspace.ts @description Shared draft, navigation and voice contracts. @author 鸡哥 */
import type { FusionCodexMessage } from './fusion';
import type { FusionToolsApi } from './fusionTools';
export type FusionProvider = 'codex' | 'dsh' | 'openai' | 'anthropic' | 'ollama';
export interface FusionModel { id: string; name: string; provider?: string; }
export interface FocusOptions {work:number;rest:number;phase:'work'|'rest';todoId?:number;}
export interface IndependentTimer {id:string;name:string;state:'idle'|'running'|'paused'|'finished';duration:number;remaining:number;deadline:number|null;finishedAt?:number;notificationError?:string;}
export type TimerCommand={type:'create';name:string;seconds:number}|{type:'start'|'pause'|'resume'|'reset'|'remove';id:string}|{type:'rename';id:string;name:string};
export interface FusionTimer {history?:Array<{finishedAt:number;duration:number;todoId?:number}>; state: 'idle' | 'running' | 'paused' | 'finished'; duration: number; remaining: number; deadline: number | null; focus?:FocusOptions; }
export interface WorkspaceTarget {
  tab?: 'fusionSessions' | 'aiChat' | 'toolbox' | 'settings';
  sessionKey?: string;
  requestId?: string;
  settingsSection?: 'agents' | 'models' | 'pet' | 'navigation' | 'reminders' | 'tools' | 'about';
}
export interface FusionAttachment { id: string; name: string; text: string; size: number; }
export interface FusionDraft {
  model?: FusionModel;
  text: string;
  attachments: FusionAttachment[];
  project: string;
}
export interface VersionedDraft { key: string; revision: number; value: FusionDraft; }
export interface DraftWriteResult { accepted: boolean; draft: VersionedDraft; }
export interface AssistantConversation {
  key: string;
  messages: FusionCodexMessage[];
  working: boolean;
  error: string | null;
  requestId?: string;
}
export interface SpeechStatus {
  providerId?: string;
  language?: string;
  available: boolean;
  ready: boolean;
  reason?: string;
  maxAudioBytes: number;
  maxDurationSeconds: number;
}
export interface FusionDockConfig { edge: 'top' | 'bottom' | 'left' | 'right'; position: number; autoHide: boolean; delayMs: number; shortcut: string; displayId: string; mode:'simple'|'island'; quotaDisplay:'ring'|'number'|'both'; }
export interface FusionDockState { config: FusionDockConfig; strip: boolean; preview: string | null; shortcutError: string; }
export type ResizeEdge = 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw';
export interface ViewportState { preferred:{width:number;height:number}; actual:{width:number;height:number}; revision:number; adjusting:boolean; token:string|null; }
export interface WorkBuddyConfig { version:1; edition:'cn'|'intl'; executable:string; configDir:string; candidates:string[]; }
export interface FusionWorkspaceApi extends FusionToolsApi, GenieApi, AgentHudApi {
  fusionWorkBuddyGet:()=>Promise<WorkBuddyConfig>;
  fusionWorkBuddySave:(config:WorkBuddyConfig)=>Promise<WorkBuddyConfig>;
  fusionViewportGet:()=>Promise<ViewportState>;
  fusionViewportControl:(command:'begin'|'move'|'end'|'cancel'|'reset',value?:ResizeEdge|string)=>Promise<ViewportState>;
  onFusionViewport:(callback:(state:ViewportState)=>void)=>()=>void;
  fusionOnboardingGet: () => Promise<import('../../shared/onboarding').OnboardingState>;
  fusionOnboardingSave: (patch: import('../../shared/onboarding').OnboardingPatch) => Promise<import('../../shared/onboarding').OnboardingState>;
  fusionOnboardingFinish: (status: 'completed'|'skipped') => Promise<import('../../shared/onboarding').OnboardingState>;
  fusionOnboardingReopen: () => Promise<import('../../shared/onboarding').OnboardingState>;
  onFusionOnboarding: (callback: (state: import('../../shared/onboarding').OnboardingState) => void) => () => void;
  fusionConfigBackup: (action:'backup'|'restore') => Promise<string>;
  fusionDockGet: () => Promise<FusionDockState>;
  fusionDockSave: (patch: Partial<FusionDockConfig>) => Promise<FusionDockState>;
  fusionDockReset: () => Promise<FusionDockState>;
  fusionDockReveal: () => Promise<FusionDockState>;
  fusionDockActivity: (expanded: boolean, keepVisible?: boolean) => Promise<void>;
  fusionDockDrag: (action: 'start'|'move'|'end'|'cancel') => Promise<boolean|void>;
  onFusionDock: (callback: (state:FusionDockState)=>void) => ()=>void;
  onFusionReveal: (callback: ()=>void) => ()=>void;
  onFusionVoiceHidden: (callback: (reason:string)=>void) => ()=>void;

  fusionModels: (provider: FusionProvider) => Promise<FusionModel[]>;
  fusionIntegrationsList: () => Promise<Array<{ source: 'codex' | 'claude' | 'dsh' | 'workbuddy'; installed: boolean; configured: boolean; configPath: string }>>;
  fusionIntegrationChange: (source: 'codex' | 'claude' | 'dsh' | 'workbuddy', remove?: boolean) => Promise<{ backup: string; restartRequired: boolean }>;
  fusionIntegrationOpen: (source: 'codex' | 'claude' | 'dsh' | 'workbuddy') => Promise<void>;
  fusionTimersGet:()=>Promise<IndependentTimer[]>;
  fusionTimersCommand:(command:TimerCommand)=>Promise<IndependentTimer[]>;
  onFusionTimers:(callback:(value:IndependentTimer[])=>void)=>()=>void;
  fusionTimerGet: () => Promise<FusionTimer>;
  fusionTimerFocus:(options:FocusOptions)=>Promise<FusionTimer>;
  fusionTimerControl: (action: 'start' | 'pause' | 'resume' | 'reset', seconds?: number) => Promise<FusionTimer>;
  onFusionTimer: (callback: (value: FusionTimer) => void) => () => void;
  fusionAvatarGet: () => Promise<AvatarConfig>;
  fusionAvatarSave: (config: AvatarConfig) => Promise<AvatarConfig>;
  onFusionAvatar: (callback: (value: AvatarConfig) => void) => () => void;
  fusionPreferencesPatch: (patch: Record<string, boolean>) => Promise<Record<string, boolean>>;
  onFusionPreferences: (callback: (value: Record<string, boolean>) => void) => () => void;
  fusionResizeChat: (height: number, width?: number) => Promise<{ width: number; height: number } | null>;
  fusionFocusSession: (source: string, sessionId: string) => Promise<boolean>;
  fusionAnswerExternalRequest: (requestId: string, action: string, answer?: string) => Promise<boolean>;
  openWorkspace: (target?: WorkspaceTarget) => Promise<boolean>;
  workspaceTarget: () => Promise<WorkspaceTarget>;
  onWorkspaceTarget: (callback: (target: WorkspaceTarget) => void) => () => void;
  fusionDraftGet: (key: string) => Promise<VersionedDraft>;
  fusionDraftWrite: (key: string, revision: number, value: FusionDraft) => Promise<DraftWriteResult>;
  onFusionDraft: (callback: (draft: VersionedDraft) => void) => () => void;
  fusionDshAnswerQuestions: (id: string, answers: Array<{ id: string; selected: string[]; custom?: string }>) => Promise<void>;
  fusionSpeechStatus: (provider: FusionProvider) => Promise<SpeechStatus>;
  onFusionSpeechStatus: (callback: (event: { provider: FusionProvider; status: SpeechStatus }) => void) => () => void;
  fusionClaimMicrophone: (requestId: string) => Promise<void>;
  fusionReleaseMicrophone: (requestId: string) => Promise<void>;
  fusionTranscribe: (provider: FusionProvider, requestId: string, audioBase64: string, selection?: { providerId?: string; language?: string }) => Promise<string>;
  fusionCancelTranscription: (requestId: string) => Promise<void>;
  fusionVoiceGlow: (active: boolean, reducedMotion?: boolean, requestId?: string) => Promise<void>;
  fusionAssistantConversation: (key: string) => Promise<AssistantConversation>;
  fusionAssistantConversations: (provider: FusionProvider) => Promise<AssistantConversation[]>;
  fusionAssistantCreate: (provider: FusionProvider) => Promise<AssistantConversation>;
  fusionAssistantPrompt: (key: string, text: string, model?: FusionModel) => Promise<void>;
  onFusionAssistantConversation: (callback: (value: AssistantConversation) => void) => () => void;
}

