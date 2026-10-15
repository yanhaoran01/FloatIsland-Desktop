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
 * @file fusion.ts
 * @description Safe renderer-facing types for the FusionIsland agent bridge.
 * @author 鸡哥
 */

export type FusionCodexState = 'stopped' | 'starting' | 'ready' | 'error';

export interface FusionEchoCodexSession {
  key?: string;
  capabilities?: { focus: boolean; chat: boolean; approve: boolean };
  toolHistory?: Array<{ tool: string; description: string | null; success: boolean; timestamp: string }>;
  sessionId: string;
  source: string;
  cwd: string | null;
  projectName: string | null;
  model: string | null;
  status: string;
  currentTool: string | null;
  lastUserPrompt: string | null;
  lastAssistantMessage: string | null;
  lastActivity: string | null;
  windowTitle: string | null;
}

export interface FusionLocalAgent {
  source: string;
  name: string;
  installed: boolean;
  configured: boolean;
}

export interface FusionEchoCodexSessionsSnapshot {
  agents?: FusionLocalAgent[];
  state: 'ready' | 'restored' | 'unavailable' | 'error';
  updatedAt: string | null;
  sessions: FusionEchoCodexSession[];
  pendingRequests?: Array<{ requestId: string; sessionId: string; source: string; kind: 'approval' | 'question'; text: string; options?: string[]; operation?: unknown; originalRequestId?: string }>;
}

export interface FusionCodexThread {
  id: string;
  name: string;
  preview: string;
  cwd?: string;
  updatedAt?: number;
}

export interface FusionCodexMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  status?: string;
}

export interface FusionCodexQuestion {
  id: string;
  header: string;
  question: string;
  options: Array<{ label: string; description: string }>;
}

export interface FusionCodexRequest {
  submitted?: boolean;
  requestId: string;
  method: 'item/commandExecution/requestApproval' | 'item/fileChange/requestApproval' | 'item/tool/requestUserInput';
  threadId: string;
  turnId?: string;
  itemId?: string;
  reason?: string;
  command?: string;
  cwd?: string;
  pathSummary?: string;
  questions?: FusionCodexQuestion[];
}

export interface FusionCodexSnapshot {
  sessionStates?: Record<string, { messages: FusionCodexMessage[]; working: boolean; activeTurnId: string | null; error: string | null }>;
  state: FusionCodexState;
  error: string | null;
  activeThreadId: string | null;
  activeTurnId: string | null;
  working: boolean;
  threads: FusionCodexThread[];
  messages: FusionCodexMessage[];
  pendingRequests: FusionCodexRequest[];
}

export type FusionCodexDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';

export type FusionAssistantProvider = 'openai' | 'anthropic' | 'ollama';

export interface FusionAssistantConfig {
  provider: FusionAssistantProvider;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export interface FusionAssistantSaveConfig {
  provider: FusionAssistantProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface FusionAssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FusionAssistantStreamEvent {
  requestId: string;
  chunk?: string;
  done?: boolean;
  cancelled?: boolean;
  error?: string;
}

export type FusionDshState = 'stopped' | 'starting' | 'ready' | 'error';

export interface FusionDshSession {
  id: string;
  cwd: string;
  title?: string;
}

export interface FusionDshMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  status?: string;
}

export interface FusionDshPermissionOption {
  optionId: string;
  name: string;
  kind: string;
}

export interface FusionDshPermissionRequest {
  submitted?: boolean;
  native?: boolean;
  questions?: Array<{ id: string; question: string; options?: Array<{ label: string; description?: string }>; multiSelect?: boolean }>;
  requestId: string;
  sessionId: string;
  title: string;
  description: string;
  toolTitle?: string;
  options: FusionDshPermissionOption[];
}

export interface FusionDshSnapshot {
  sessionStates?: Record<string, { messages: FusionDshMessage[]; working: boolean; activeCwd: string | null; error: string | null }>;
  state: FusionDshState;
  error: string | null;
  activeSessionId: string | null;
  activeCwd: string | null;
  working: boolean;
  sessions: FusionDshSession[];
  messages: FusionDshMessage[];
  pendingRequests: FusionDshPermissionRequest[];
}
