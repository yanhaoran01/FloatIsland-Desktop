/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file fusionWorkspaceService.ts @description Main-owned drafts, assistant streams and workspace IPC. @author 楦″摜 */
import {registerFusionOnboarding} from './fusionOnboardingService';
import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { readdirSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { normalizeAvatar, validAvatar, type AvatarConfig } from '../../shared/avatarConfig';
import { registerFusionFileTools } from './fusionFileTools';
import {registerProductSharing} from './productSharing';
import {registerProductRecorder} from './productRecorder';
import { registerFusionProduct } from './fusionProductService';
import { FusionDraftStore } from './fusionDraftStore';
import { reportAgentCompletion, broadcastFusion, isFusionView } from './fusionWindows';
import { openStandaloneWindow, getWorkspaceTarget } from '../window/standaloneWindow';
import type { createLocalAssistantService } from './localAssistantService';
import type { AssistantConversation, FusionDraft, WorkspaceTarget } from '../../preload/types/fusionWorkspace';
import type { FusionAssistantProvider } from '../../preload/types/fusion';

/** Registers shared state independently from either renderer's lifetime. */
export function registerFusionWorkspace(service: ReturnType<typeof createLocalAssistantService>, agents?: {
  codex: { loadModels: () => Promise<import('../../preload/types/fusionWorkspace').FusionModel[]> };
  dsh: { loadModels: () => Promise<import('../../preload/types/fusionWorkspace').FusionModel[]> };
}): void {
  registerFusionOnboarding();
  registerFusionFileTools();
  registerFusionProduct();
  registerProductRecorder();
  registerProductSharing();
  const root = join(app.getPath('userData'), 'fusion-workspace');
  const drafts = new FusionDraftStore(join(root, 'drafts.json'));
  const conversations = new Map<string, AssistantConversation>();
  try {
    const saved = JSON.parse(readFileSync(join(root, 'conversations.json'), 'utf8')) as AssistantConversation[];
    for (const conversation of saved) conversations.set(conversation.key, { ...conversation, working: false, requestId: undefined });
  } catch { /* no saved local assistant conversations */ }
  const persist = (): void => {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'conversations.tmp'), JSON.stringify([...conversations.values()]), 'utf8');
    renameSync(join(root, 'conversations.tmp'), join(root, 'conversations.json'));
  };
  const get = (key: string): AssistantConversation => {
    if (typeof key !== 'string' || !/^(openai|anthropic|ollama):[^:]+$/.test(key)) throw new Error('invalid-assistant-session');
    return conversations.get(key) || { key, messages: [], working: false, error: null };
  };
  const publish = (value: AssistantConversation): void => {
    conversations.set(value.key, value); broadcastFusion('fusion:conversation:updated', value);
  };
  const handle = (channel: string, fn: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!isFusionView(event.sender)) throw new Error('untrusted-view');
      return fn(event, ...args);
    });
  };
  handle('fusion:workspace:open', (_event, target: WorkspaceTarget = {}) => {
    if (target.tab && !['fusionSessions', 'aiChat', 'toolbox', 'settings'].includes(target.tab)) throw new Error('invalid-workspace-tab');
    if (target.settingsSection && !['agents','models','pet','navigation','reminders','tools','about'].includes(target.settingsSection)) throw new Error('invalid-settings-section');
    if (target.sessionKey && (typeof target.sessionKey !== 'string' || target.sessionKey.length > 1024)) throw new Error('invalid-session-key');
    openStandaloneWindow(target); return true;
  });
  handle('fusion:config:backup', (_event, action: string) => {
    if (!['backup','restore'].includes(action)) throw Error('invalid-backup-action');
    const directory=join(app.getPath('userData'),'eIsland_store');
    const backups=join(app.getPath('userData'),'fusion-config-backups');mkdirSync(backups,{recursive:true});
    const snapshots=readdirSync(backups).filter(name=>/^config-\d+$/.test(name)).sort();
    const latest=snapshots.at(-1);
    if(action==='restore' && !latest) throw Error('no-config-backup');
    const snapshot=join(backups,(action==='restore'?'rollback-':'config-')+Date.now());mkdirSync(snapshot,{recursive:true});
    if(existsSync(directory)) for(const name of readdirSync(directory).filter(n=>n.endsWith('.json')))copyFileSync(join(directory,name),join(snapshot,name));
    if(action==='restore') {mkdirSync(directory,{recursive:true});const source=join(backups,latest!);const names=readdirSync(source).filter(n=>n.endsWith('.json'));for(const name of names)JSON.parse(readFileSync(join(source,name),'utf8'));for(const name of names)copyFileSync(join(source,name),join(directory,name));}
    return snapshot;
  });
  handle('fusion:workspace:target', () => getWorkspaceTarget());
  handle('fusion:models:list', (_event, provider: string) => {
    if (provider === 'codex' || provider === 'dsh') {
      if (!agents) throw new Error('agent-models-unavailable');
      return agents[provider].loadModels();
    }
    if (!['openai', 'anthropic', 'ollama'].includes(provider)) throw new Error('invalid-provider');
    return service.loadModels(provider as FusionAssistantProvider);
  });
  const avatarFile=join(app.getPath('userData'),'eIsland_store','fusion-avatar.json');
  const readAvatar=():AvatarConfig=>{try{return normalizeAvatar(JSON.parse(readFileSync(avatarFile,'utf8')));}catch{return normalizeAvatar(null);}};
  handle('fusion:avatar:get',readAvatar);
  handle('fusion:avatar:save',(_event,value:unknown)=>{
    if(!validAvatar(value))throw Error('invalid-avatar-config');
    const config=normalizeAvatar(value);mkdirSync(join(app.getPath('userData'),'eIsland_store'),{recursive:true});
    writeFileSync(avatarFile+'.tmp',JSON.stringify(config));renameSync(avatarFile+'.tmp',avatarFile);
    broadcastFusion('fusion:avatar:updated',config);return config;
  });
  handle('fusion:preferences:patch', (_event, patch: Record<string, boolean>) => {
    const allowed = ['voiceGlow', 'voiceOrb', 'voiceWave', 'wheelNavigation', 'muted', 'reducedMotion', 'autoDiscover', 'completionReminders'];
    if (!patch || typeof patch !== 'object' || Object.entries(patch).some(([key, value]) => !allowed.includes(key) || typeof value !== 'boolean')) throw new Error('invalid-preferences');
    const directory = join(app.getPath('userData'), 'eIsland_store');
    const file = join(directory, 'fusion-preferences.json');
    let saved = {};
    try { saved = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first configuration */ }
    const next = { ...saved, ...patch };
    mkdirSync(directory, { recursive: true });
    writeFileSync(file + '.tmp', JSON.stringify(next));
    renameSync(file + '.tmp', file);
    broadcastFusion('fusion:preferences:updated', next);
    return next;
  });
  handle('fusion:draft:get', (_event, key: string) => drafts.get(key));
  handle('fusion:draft:write', (_event, key: string, revision: number, value: FusionDraft) => {
    const result = drafts.write(key, revision, value);
    if (result.accepted) broadcastFusion('fusion:draft:updated', result.draft);
    return result;
  });
  handle('fusion:conversation:get', (_event, key: string) => get(key));
  handle('fusion:conversation:list', (_event, provider: string) => {
    if (!['openai', 'anthropic', 'ollama'].includes(provider)) throw new Error('invalid-provider');
    return [...conversations.values()].filter(value => value.key.startsWith(provider + ':'));
  });
  handle('fusion:conversation:create', (_event, provider: string) => {
    if (!['openai', 'anthropic', 'ollama'].includes(provider)) throw new Error('invalid-provider');
    const value = get(provider + ':' + randomUUID());
    publish(value); persist(); return value;
  });
  handle('fusion:conversation:prompt', (_event, key: string, text: string, model?: import('../../preload/types/fusionWorkspace').FusionModel) => {
    const conversation = get(key);
    if (conversation.working) throw new Error('session-already-running');
    if (typeof text !== 'string' || !text.trim() || text.length > 2_100_000) throw new Error('invalid-message');
    const requestId = randomUUID();
    const messages = [...conversation.messages, { id: randomUUID(), role: 'user' as const, text }];
    const reply = { id: randomUUID(), role: 'assistant' as const, text: '' };
    const next: AssistantConversation = { key, messages: [...messages, reply], working: true, error: null, requestId };
    publish(next); persist();
    void service.send(event => {
      if (event.chunk) reply.text += event.chunk;
      if (event.error) next.error = event.error;
      if (event.done) { next.working = false; if(!event.cancelled&&!next.error)reportAgentCompletion(key.split(':')[0] as FusionAssistantProvider,key.split(':').slice(1).join(':'),reply); persist(); }
      publish(next);
    }, {
      requestId, provider: key.split(':')[0] as FusionAssistantProvider,
      model: model?.id,
      messages: messages.filter(m => m.role !== 'tool').map(m => ({ role: m.role as 'user' | 'assistant', content: m.text })),
    }).catch(error => {
      next.working = false; next.error = error instanceof Error ? error.message : String(error); publish(next); persist();
    });
  });
}
