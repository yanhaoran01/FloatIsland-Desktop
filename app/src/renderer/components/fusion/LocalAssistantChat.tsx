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
 * @file LocalAssistantChat.tsx
 * @description BYO OpenAI-compatible, Anthropic, and Ollama chat surface.
 * @author 鸡哥
 */

import useIslandStore from '../../store/slices';
import { useFusionPreferences } from './fusionPreferences';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Bot, ChevronDown, Paperclip, Settings2, Volume2, VolumeX, X } from 'lucide-react';
import type { FusionAssistantConfig, FusionAssistantMessage, FusionAssistantProvider } from '../../../preload/types/fusion';
import { FusionPet, usePetCompletion, type FusionPetMood } from './FusionPet';

import { FusionProviderIcon } from './FusionResourceIcon';
import { AssistantMarkdown } from '../states/maxExpand/components/agent/components/AssistantMarkdown';

interface LocalAssistantChatProps {
  provider: FusionAssistantProvider;
  onProviderChange: (provider: FusionAssistantProvider | 'codex' | 'dsh') => void;
}

interface LocalMessage extends FusionAssistantMessage {
  id: string;
}

const providerDefaults: Record<FusionAssistantProvider, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: '' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: '' },
  ollama: { baseUrl: 'http://127.0.0.1:11434/v1', model: '' },
};

function readMessages(provider: FusionAssistantProvider): LocalMessage[] {
  try {
    const stored = JSON.parse(localStorage.getItem(`fusion.assistant.${provider}.messages`) || '[]') as LocalMessage[];
    return Array.isArray(stored) ? stored.slice(-80) : [];
  } catch {
    return [];
  }
}

/**
 * Renders a small local-first assistant with encrypted main-process credentials.
 * @param props - Selected provider and provider navigation callback.
 * @returns Provider settings, conversation feed, and streaming composer.
 */
export function LocalAssistantChat({ provider, onProviderChange }: LocalAssistantChatProps): JSX.Element {
  const { t } = useTranslation();
  const [config, setConfig] = useState<FusionAssistantConfig>({ provider, ...providerDefaults[provider], hasApiKey: false });
  const [messages, setMessages] = useState<LocalMessage[]>(() => readMessages(provider));
  const [draft, setDraft] = useState('');
  const [attachmentCount, setAttachmentCount] = useState(0);
  const [dropActive, setDropActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const muted = useFusionPreferences((state) => state.value.muted);
  const setMuted = (update: (value: boolean) => boolean): void => { void useFusionPreferences.getState().save({ muted: update(muted) }); };
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const mood: FusionPetMood = error ? 'error' : busy ? 'working' : 'idle';
  const completion = usePetCompletion(busy, Boolean(error), muted);
  const petMood: FusionPetMood = completion.finished ? 'finished' : mood;
  const configured = useMemo(() => Boolean(config.model) && (provider === 'ollama' || config.hasApiKey), [config.hasApiKey, config.model, provider]);

  useEffect(() => {
    let active = true;
    setConfig({ provider, ...providerDefaults[provider], hasApiKey: false });

    setMessages(readMessages(provider));
    setError(null);

    void window.api.fusionAssistantConfigGet(provider).then((next) => {
      if (!active) return;
      setConfig(next);

    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : t('fusion.assistant.configError'));
    });
    const reload = (): void => { void window.api.fusionAssistantConfigGet(provider).then((value) => { if (active) setConfig(value); }); };
    window.addEventListener('fusion-assistant-config-updated', reload);
    return () => { active = false; window.removeEventListener('fusion-assistant-config-updated', reload); };
  }, [provider, t]);

  useEffect(() => {
    const unsubscribe = window.api.onFusionAssistantStream((event) => {
      if (event.requestId !== requestIdRef.current) return;
      if (event.chunk) {
        const messageId = assistantMessageIdRef.current;
        if (messageId) setMessages((current) => current.map((message) => message.id === messageId ? { ...message, content: message.content + event.chunk } : message));
      }
      if (event.error) setError(event.error);
      if (event.done) {
        setBusy(false);
        requestIdRef.current = null;
        assistantMessageIdRef.current = null;
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    localStorage.setItem(`fusion.assistant.${provider}.messages`, JSON.stringify(messages.slice(-80)));
  }, [messages, provider]);

  useEffect(() => {
    localStorage.setItem('fusion.pet-muted', String(muted));
  }, [muted]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (): Promise<void> => {
    const text = draft.trim();
    if (!text || busy || !configured) return;
    const content = text;
    const requestId = crypto.randomUUID();
    const userMessage: LocalMessage = { id: `${requestId}:user`, role: 'user', content };
    const assistantMessage: LocalMessage = { id: `${requestId}:assistant`, role: 'assistant', content: '' };
    const nextMessages = [...messages, userMessage];
    requestIdRef.current = requestId;
    assistantMessageIdRef.current = assistantMessage.id;
    setMessages([...nextMessages, assistantMessage]);
    setDraft('');
    setBusy(true);
    setError(null);
    try {
      await window.api.fusionAssistantSend(requestId, provider, nextMessages.map(({ role, content: message }) => ({ role, content: message })));
    } catch (reason) {
      requestIdRef.current = null;
      assistantMessageIdRef.current = null;
      setBusy(false);
      setError(reason instanceof Error ? reason.message : t('fusion.assistant.sendError'));
    }
  }, [busy, configured, draft, messages, provider, t]);

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const attachFiles = useCallback(async (files: FileList | null): Promise<void> => {
    if (!files?.length) return;
    const parts: string[] = [];
    for (const file of Array.from(files).slice(0, 5)) {
      if (file.size > 400_000) {
        setError(t('fusion.assistant.fileTooLarge', { name: file.name }));
        continue;
      }
      const text = await file.text().catch(() => '');
      if (text.includes('\0')) {
        setError(t('fusion.attachments.notText', { name: file.name }));
        continue;
      }
      if (text) parts.push(`\n\n--- ${file.name} ---\n${text.slice(0, 40000)}`);
    }
    if (parts.length) {
      setDraft((current) => `${current}${parts.join('')}`);
      setAttachmentCount((count) => count + parts.length);
    }
  }, [t]);

  const cancel = (): void => {
    completion.suppressNextFinish();
    if (requestIdRef.current) void window.api.fusionAssistantCancel(requestIdRef.current);
  };

  return (
    <section className="fusion-workspace" aria-label={t('fusion.assistant.title')}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        void attachFiles(event.dataTransfer.files);
      }}>
      <header className="fusion-header">
        <div className="fusion-brand">
          <FusionPet mood={petMood} label={t(`fusion.pet.${petMood}`)} muted={muted} dropActive={dropActive} attachmentCount={attachmentCount} />
          <div className="fusion-brand-copy"><strong>{t('fusion.brand')}</strong><span>{busy ? t('fusion.assistant.statusWorking') : error ? t('fusion.assistant.statusError') : completion.finished ? t('fusion.assistant.statusFinished') : t('fusion.assistant.statusIdle')}</span></div>
        </div>
        <div className="fusion-header-actions">
          <button className="fusion-icon-button" type="button" onClick={() => { localStorage.setItem('fusion.settings-model', provider); useIslandStore.getState().setMaxExpandTab('settings'); window.dispatchEvent(new CustomEvent('fusion-open-model-settings', { detail: provider })); }} aria-label={t('fusion.assistant.settings')} title={t('fusion.assistant.settings')}><Settings2 size={16} /></button>
          <button className="fusion-icon-button" type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? t('fusion.sound.on') : t('fusion.sound.off')} title={muted ? t('fusion.sound.on') : t('fusion.sound.off')}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        </div>
      </header>
      <div className="fusion-toolbar">
        <label className="fusion-provider"><FusionProviderIcon provider={provider} /><select aria-label={t('fusion.provider.select')} value={provider} onChange={(event) => onProviderChange(event.target.value as FusionAssistantProvider | 'codex' | 'dsh')}>
          <option value="codex">{t('fusion.provider.codex')}</option><option value="dsh">{t('fusion.provider.dsh')}</option><option value="openai">{t('fusion.provider.custom')}</option><option value="anthropic">{t('fusion.provider.anthropic')}</option><option value="ollama">{t('fusion.provider.ollama')}</option>
        </select><ChevronDown size={14} aria-hidden="true" /></label>
        <span className={`fusion-local-badge${configured ? ' is-ready' : ''}`}>{configured ? t('fusion.assistant.configured') : t('fusion.assistant.notConfigured')}</span>
      </div>
      <div className="fusion-message-feed" ref={feedRef}>
        {messages.length === 0 && <div className="fusion-empty-state"><span className="fusion-empty-orb"><Bot size={22} /></span><strong>{t('fusion.assistant.emptyTitle')}</strong><p>{configured ? t('fusion.assistant.emptyReady') : t('fusion.assistant.emptySetup')}</p></div>}
        {messages.map((message) => <article className={`fusion-message fusion-message--${message.role}`} key={message.id}><div className="fusion-markdown">{message.role === 'assistant' && message.content ? <AssistantMarkdown content={message.content} previewLinks={false} /> : <p>{message.content || (busy ? t('fusion.status.working') : '')}</p>}</div></article>)}
      </div>
      {error && <div className="fusion-inline-error" role="status">{error}</div>}
      <div className="fusion-composer">
        <label className="fusion-attach"><input type="file" multiple onChange={(event) => { void attachFiles(event.target.files); event.target.value = ''; }} aria-label={t('fusion.assistant.attach')} /><Paperclip size={15} /></label>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onInputKeyDown} disabled={!configured || busy} placeholder={configured ? t('fusion.input.placeholder') : t('fusion.assistant.emptySetup')} aria-label={t('fusion.input.label')} rows={1} />
        {busy ? <button className="fusion-stop" type="button" onClick={cancel} aria-label={t('fusion.actions.stop')}><X size={15} /></button> : <button type="button" onClick={() => void send()} disabled={!configured || !draft.trim()} aria-label={t('fusion.input.send')} title={t('fusion.input.send')}><ArrowUp size={16} /></button>}
      </div>
    </section>
  );
}
