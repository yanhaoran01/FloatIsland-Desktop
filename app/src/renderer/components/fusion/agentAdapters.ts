/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file agentAdapters.ts @description Capability-based access to main-owned Agent sessions. @author 鸡哥 */
import type { FusionCodexMessage, FusionCodexDecision } from '../../../preload/types/fusion';
import type { FusionProvider, SpeechStatus } from '../../../preload/types/fusionWorkspace';

export interface AgentSession {
  id: string;
  key: string;
  title: string;
  project: string;
  messages: FusionCodexMessage[];
  working: boolean;
}
export interface AgentAnswer {
  requestId: string;
  decision?: FusionCodexDecision;
  optionId?: string;
  answers?: Array<{ id: string; selected: string[]; custom?: string }>;
}
export interface AgentAdapter {
  source: FusionProvider;
  capabilities: { create: boolean; resume: boolean; send: boolean; cancel: boolean; answer: boolean; focus: boolean; speech: boolean };
  discover: () => Promise<AgentSession[]>;
  list: () => Promise<AgentSession[]>;
  read: (id: string) => Promise<AgentSession | undefined>;
  create: (project: string) => Promise<{ id: string }>;
  resume: (id: string) => Promise<void>;
  send: (id: string, text: string, model?: import('../../../preload/types/fusionWorkspace').FusionModel) => Promise<void>;
  subscribe: (changed: () => void) => () => void;
  cancel: (id: string) => Promise<void>;
  answer: (answer: AgentAnswer) => Promise<void>;
  focus: (id: string) => Promise<boolean>;
  speech?: { status: () => Promise<SpeechStatus> };
}

/** Uses snapshot-only discovery; a read never starts a managed server or revives a cold session. */
export function getAgentAdapter(source: FusionProvider): AgentAdapter {
  const api = window.api;
  const hosted = source === 'codex' || source === 'dsh';
  const list = async (): Promise<AgentSession[]> => {
    if (source === 'codex') {
      const snapshot = await api.fusionCodexSnapshot();
      return snapshot.threads.map(thread => ({ id: thread.id, key: source + ':' + thread.id,
        title: thread.name || thread.preview || thread.id, project: thread.cwd || '',
        messages: snapshot.sessionStates?.[thread.id]?.messages || [], working: snapshot.sessionStates?.[thread.id]?.working || false }));
    }
    if (source === 'dsh') {
      const snapshot = await api.fusionDshSnapshot();
      return snapshot.sessions.map(session => ({ id: session.id, key: source + ':' + session.id,
        title: session.title || session.cwd || session.id, project: session.cwd || '',
        messages: snapshot.sessionStates?.[session.id]?.messages || [], working: snapshot.sessionStates?.[session.id]?.working || false }));
    }
    return (await api.fusionAssistantConversations(source)).map(session => ({
      id: session.key.slice(source.length + 1), key: session.key,
      title: session.messages.find(message => message.role === 'user')?.text.slice(0, 80) || session.key.slice(source.length + 1),
      project: '', messages: session.messages, working: session.working,
    }));
  };
  return {
    source, capabilities: { create: true, resume: true, send: true, cancel: true, answer: hosted, focus: hosted, speech: source === 'dsh' },
    discover: list, list, read: async id => (await list()).find(session => session.id === id),
    create: async project => {
      if (source === 'codex') return api.fusionCodexCreateThread(project);
      if (source === 'dsh') return api.fusionDshCreateSession(project);
      const value = await api.fusionAssistantCreate(source);
      return { id: value.key.slice(source.length + 1) };
    },
    resume: async id => {
      if (source === 'codex') await api.fusionCodexResumeThread(id);
      else if (source === 'dsh') await api.fusionDshResumeSession(id);
      else await api.fusionAssistantConversation(source + ':' + id);
    },
    send: async (id, text, model) => {
      if (source === 'codex') await api.fusionCodexSend(id, text, model);
      else if (source === 'dsh') await api.fusionDshPrompt(id, text, model);
      else await api.fusionAssistantPrompt(source + ':' + id, text, model);
    },
    subscribe: changed => source === 'codex' ? api.onFusionCodexUpdated(changed) :
      source === 'dsh' ? api.onFusionDshUpdated(changed) : api.onFusionAssistantConversation(value => { if (value.key.startsWith(source + ':')) changed(); }),
    cancel: async id => {
      if (source === 'codex') await api.fusionCodexInterrupt(id);
      else if (source === 'dsh') await api.fusionDshCancel(id);
      else {
        const value = await api.fusionAssistantConversation(source + ':' + id);
        if (value.requestId) await api.fusionAssistantCancel(value.requestId);
      }
    },
    answer: async answer => {
      if (source === 'codex') await api.fusionCodexAnswer(answer.requestId, answer.decision || 'decline',
        answer.answers ? Object.fromEntries(answer.answers.map(a => [a.id, [...a.selected, ...(a.custom ? [a.custom] : [])]])) : undefined);
      else if (source === 'dsh') {
        if (answer.answers) await api.fusionDshAnswerQuestions(answer.requestId, answer.answers);
        else await api.fusionDshAnswerPermission(answer.requestId, answer.optionId || null);
      } else throw new Error('agent-does-not-support-requests');
    },
    focus: id => api.fusionFocusSession(source, id),
    ...(source === 'dsh' ? { speech: { status: () => api.fusionSpeechStatus(source) } } : {}),
  };
}
