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
 * @file localAssistantService.ts
 * @description Stores provider credentials in the main process and streams BYO AI replies.
 * @author 鸡哥
 */

import { app, net, safeStorage, type WebContents } from 'electron';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import {recordHudUsage} from './agentHudUsage';
import type {
  FusionAssistantConfig,
  FusionAssistantMessage,
  FusionAssistantProvider,
  FusionAssistantSaveConfig,
  FusionAssistantStreamEvent,
} from '../../preload/types/fusion';

interface StoredAssistantConfig extends Omit<FusionAssistantSaveConfig, 'apiKey' | 'clearApiKey'> {
  encryptedApiKey?: string;
}

interface StoredAssistantStore {
  providers: Partial<Record<FusionAssistantProvider, StoredAssistantConfig>>;
}

interface AssistantRequest {
  model?: string;
  requestId: string;
  provider: FusionAssistantProvider;
  messages: FusionAssistantMessage[];
}

const defaultConfig = (provider: FusionAssistantProvider): StoredAssistantConfig => ({
  provider,
  baseUrl: provider === 'anthropic' ? 'https://api.anthropic.com/v1' : provider === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'https://api.openai.com/v1',
  model: '',
});

/**
 * Creates encrypted assistant settings and a streaming provider client.
 * @returns Settings, message streaming, and cancellation operations.
 */
export function createLocalAssistantService() {
  const active = new Map<string, AbortController>();
  const configPath = (): string => path.join(app.getPath('userData'), 'fusion-assistant.json');

  const readStoredStore = async (): Promise<StoredAssistantStore> => {
    try {
      const raw = await readFile(configPath(), 'utf8');
      const parsed = JSON.parse(raw) as StoredAssistantStore & Partial<StoredAssistantConfig>;
      if (parsed.providers) return parsed;
      if (parsed.provider) return { providers: { [parsed.provider]: parsed as StoredAssistantConfig } };
      return { providers: {} };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { providers: {} };
      throw error;
    }
  };

  const readStoredConfig = async (provider: FusionAssistantProvider): Promise<StoredAssistantConfig> => {
    const store = await readStoredStore();
    return { ...defaultConfig(provider), ...store.providers[provider] };
  };

  const decryptApiKey = (config: StoredAssistantConfig): string => {
    if (!config.encryptedApiKey) return '';
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable.');
    return safeStorage.decryptString(Buffer.from(config.encryptedApiKey, 'base64'));
  };

  const publicConfig = async (provider: FusionAssistantProvider = 'openai'): Promise<FusionAssistantConfig> => {
    const stored = await readStoredConfig(provider);
    return {
      provider: stored.provider,
      baseUrl: stored.baseUrl,
      model: stored.model,
      hasApiKey: Boolean(stored.encryptedApiKey),
    };
  };

  const saveConfig = async (input: FusionAssistantSaveConfig): Promise<FusionAssistantConfig> => {
    if (!['openai', 'anthropic', 'ollama'].includes(input.provider)) throw new Error('Choose a supported AI provider.');
    const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
    const model = input.model.trim();
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error('Enter a valid provider URL.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('Provider URL must use HTTP or HTTPS and must not include credentials.');
    }
    if (!model) throw new Error('Enter a model name.');
    const store = await readStoredStore();
    const previous = await readStoredConfig(input.provider);
    const stored: StoredAssistantConfig = {
      provider: input.provider,
      baseUrl,
      model,
      encryptedApiKey: input.clearApiKey ? undefined : previous.encryptedApiKey,
    };
    const apiKey = input.apiKey?.trim();
    if (apiKey) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable.');
      stored.encryptedApiKey = safeStorage.encryptString(apiKey).toString('base64');
    }
    if (input.provider !== 'ollama' && !stored.encryptedApiKey) throw new Error('Save an API key for this provider.');
    await mkdir(path.dirname(configPath()), { recursive: true });
    store.providers[input.provider] = stored;
    await writeFile(configPath(), JSON.stringify(store, null, 2), 'utf8');
    return {
      provider: stored.provider,
      baseUrl: stored.baseUrl,
      model: stored.model,
      hasApiKey: Boolean(stored.encryptedApiKey),
    };
  };

  const send = async (webContents: WebContents | ((event: FusionAssistantStreamEvent) => void), request: AssistantRequest): Promise<void> => {
    if (!request.requestId || active.has(request.requestId)) throw new Error('This assistant request is already active.');
    if (!Array.isArray(request.messages) || request.messages.length === 0) throw new Error('Add a message before sending.');
    const config = await readStoredConfig(request.provider);
    if (request.model !== undefined) {
      if (typeof request.model !== 'string' || !request.model.trim() || request.model.length > 256) throw new Error('invalid-model-selection');
      config.model = request.model;
    }
    const apiKey = decryptApiKey(config);
    if (!config.model) throw new Error('Configure an AI model before sending a message.');
    if (config.provider !== 'ollama' && !apiKey) throw new Error('Configure an API key before sending a message.');

    const controller = new AbortController();
    active.set(request.requestId, controller);
    const sendEvent = (event: Omit<FusionAssistantStreamEvent, 'requestId'>): void => {
      const payload = { requestId: request.requestId, ...event } satisfies FusionAssistantStreamEvent;
      if (typeof webContents === 'function') webContents(payload);
      else if (!webContents.isDestroyed()) webContents.send('fusion:assistant:stream', payload);
    };
    try {
      const baseUrl = config.baseUrl.replace(/\/+$/, '');
      const isAnthropic = config.provider === 'anthropic';
      const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'text/event-stream' };
      let endpoint = `${baseUrl}/chat/completions`;
      let body: Record<string, unknown>;
      if (isAnthropic) {
        endpoint = `${baseUrl}/messages`;
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model: config.model,
          max_tokens: 4096,
          stream: true,
          messages: request.messages.slice(-30).map((message) => ({ role: message.role, content: message.content.slice(0, 40000) })),
        };
      } else {
        if (apiKey) headers.authorization = `Bearer ${apiKey}`;
        body = {
          model: config.model,
          stream: true,
          stream_options: {include_usage:true},
          messages: request.messages.slice(-30).map((message) => ({ role: message.role, content: message.content.slice(0, 40000) })),
        };
      }

      const response = await net.fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) {
        const details = (await response.text()).slice(0, 600);
        throw new Error(`Provider returned ${response.status}${details ? `: ${details}` : ''}`);
      }
      if (!response.body) throw new Error('Provider did not return a streaming response.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      let usage:Record<string,unknown>={};
      const consume = (line: string): void => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          if (isAnthropic) {
            const message=parsed.message as Record<string,unknown>|undefined;
            const next=(message?.usage??parsed.usage) as Record<string,unknown>|undefined;
            if(next){usage={...usage,...next};recordHudUsage(config.provider,request.requestId,usage,true);}
            const delta = parsed.delta as Record<string, unknown> | undefined;
            if (parsed.type === 'content_block_delta' && typeof delta?.text === 'string') sendEvent({ chunk: delta.text });
          } else {
            const next=parsed.usage as Record<string,unknown>|undefined;
            if(next)recordHudUsage(config.provider,request.requestId,next);
            const choices = parsed.choices as Array<{ delta?: { content?: unknown } }> | undefined;
            const content = choices?.[0]?.delta?.content;
            if (typeof content === 'string') sendEvent({ chunk: content });
          }
        } catch {
          // Providers may send event metadata that is not a JSON data frame.
        }
      };

      while (!finished) {
        const { value, done } = await reader.read();
        finished = done;
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.forEach(consume);
      }
      if (buffer) consume(buffer);
      sendEvent({ done: true });
    } catch (error) {
      if ((error as Error).name === 'AbortError') sendEvent({ done: true, cancelled: true });
      else sendEvent({ done: true, error: error instanceof Error ? error.message : String(error) });
    } finally {
      active.delete(request.requestId);
    }
  };

  return {
    configuredProviders:async()=>Object.keys((await readStoredStore()).providers),
    loadModels: async (provider: FusionAssistantProvider) => {
      const config = await readStoredConfig(provider);
      const key = decryptApiKey(config);
      if (provider !== 'ollama' && !key) throw new Error('请先在设置中填写此 AI 服务的 API Key 和模型。');
      const headers: Record<string, string> = provider === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : key ? { authorization: `Bearer ${key}` } : {};
      const response = await net.fetch(config.baseUrl.replace(/\/+$/, '') + '/models', { headers, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error('model-catalog-http-' + response.status);
      const data = await response.json() as { data?: Array<{ id: string; display_name?: string }> };
      const models = (data.data || []).filter(m => typeof m.id === 'string').map(m => ({ id: m.id, name: m.display_name || m.id }));
      if (config.model && !models.some(m => m.id === config.model)) models.unshift({ id: config.model, name: config.model });
      return models;
    },
    publicConfig,
    saveConfig,
    send,
    cancel: (requestId: string): void => active.get(requestId)?.abort(),
    stop: (): void => {
      for (const controller of active.values()) controller.abort();
      active.clear();
    },
  };
}
