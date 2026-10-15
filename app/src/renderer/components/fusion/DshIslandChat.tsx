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
 * @file DshIslandChat.tsx
 * @description dsh session picker, streaming chat, interruption, and permission UI.
 * @author 鸡哥
 */

import { useFusionPreferences } from './fusionPreferences';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type JSX, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Bot, ChevronDown, FolderOpen, Paperclip, Plus, Volume2, VolumeX, X } from 'lucide-react';
import type { FusionAssistantProvider, FusionDshSnapshot, FusionDshSession } from '../../../preload/types/fusion';
import { FusionPet, usePetCompletion, type FusionPetMood } from './FusionPet';

import { FusionProviderIcon, FusionFileIcon } from './FusionResourceIcon';
import { AssistantMarkdown } from '../states/maxExpand/components/agent/components/AssistantMarkdown';

interface DshIslandChatProps {
  onOpenCodex: () => void;
  onOpenAssistant: (provider: FusionAssistantProvider) => void;
}

const EMPTY_SNAPSHOT: FusionDshSnapshot = {
  state: 'stopped', error: null, activeSessionId: null, activeCwd: null,
  working: false, sessions: [], messages: [], pendingRequests: [],
};

/**
 * Maps a DSH ACP snapshot to a companion mood.
 * @param snapshot - Current DSH session snapshot.
 * @returns Pet state for the current agent activity.
 */
function getDshMood(snapshot: FusionDshSnapshot): FusionPetMood {
  if (snapshot.pendingRequests.length > 0) return 'waiting';
  if (snapshot.error) return 'error';
  if (snapshot.working) return 'working';
  return 'idle';
}

/**
 * Hosts DeepSeek Harness sessions through its installed automation-only ACP profile.
 * @param props - Provider switch actions.
 * @returns The dsh conversation workspace.
 */
export function DshIslandChat({ onOpenCodex, onOpenAssistant }: DshIslandChatProps): JSX.Element {
  const { t } = useTranslation();
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string; text: string; size: number }>>([]);
  const [fileDropActive, setFileDropActive] = useState(false);
  const [snapshot, setSnapshot] = useState<FusionDshSnapshot>(EMPTY_SNAPSHOT);
  const [project, setProject] = useState<string | null>(() => localStorage.getItem('fusion.dsh-project'));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(true);
  const muted = useFusionPreferences((state) => state.value.muted);
  const setMuted = (update: (value: boolean) => boolean): void => { void useFusionPreferences.getState().save({ muted: update(muted) }); };
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const mood = useMemo(() => getDshMood(snapshot), [snapshot]);
  const completion = usePetCompletion(snapshot.working, Boolean(snapshot.error), muted);
  const petMood: FusionPetMood = completion.finished ? 'finished' : mood;

  const refresh = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const current = await window.api.fusionDshSnapshot();
      setSnapshot(current);
      const sessions = current.state === 'ready' ? await window.api.fusionDshSessionsList() : current.sessions;
      setSnapshot((previous) => ({ ...previous, sessions }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('fusion.dsh.connectionError'));
      setSnapshot(await window.api.fusionDshSnapshot());
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.api.onFusionDshUpdated((next) => {
      if (active) setSnapshot(next);
    });
    void refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [snapshot.messages.length, snapshot.messages.at(-1)?.text]);

  useEffect(() => {
    localStorage.setItem('fusion.pet-muted', String(muted));
  }, [muted]);

  const selectProject = useCallback(async (): Promise<void> => {
    const path = await window.api.fusionSelectProject();
    if (path) {
      setProject(path);
      localStorage.setItem('fusion.dsh-project', path);
    }
  }, []);

  const createSession = useCallback(async (): Promise<void> => {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const session = await window.api.fusionDshCreateSession(project);
      localStorage.setItem('fusion.dsh-active-session', session.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('fusion.dsh.createError'));
    } finally {
      setBusy(false);
    }
  }, [project, t]);

  const resumeSession = useCallback(async (session: FusionDshSession): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await window.api.fusionDshResumeSession(session.id);
      setProject(session.cwd);
      localStorage.setItem('fusion.dsh-project', session.cwd);
      localStorage.setItem('fusion.dsh-active-session', session.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('fusion.dsh.resumeError'));
    } finally {
      setBusy(false);
    }
  }, [t]);

  const send = useCallback(async (): Promise<void> => {
    const text = draft.trim();
    const includedAttachments = attachments;
    const attachmentContent = includedAttachments.map((attachment) => {
      const safeName = attachment.name.replace(/[<>"\r\n]/g, '_');
      return `<attachment name="${safeName}">\n${attachment.text}\n</attachment>`;
    }).join('\n\n');
    const message = [attachmentContent, text].filter(Boolean).join('\n\n');
    if (!message || !snapshot.activeSessionId || snapshot.working) return;
    setDraft('');
    setAttachments([]);
    setError(null);
    try {
      await window.api.fusionDshPrompt(snapshot.activeSessionId, message);
    } catch (reason) {
      setDraft(text);
      setAttachments(includedAttachments);
      setError(reason instanceof Error ? reason.message : t('fusion.dsh.sendError'));
    }
  }, [attachments, draft, snapshot.activeSessionId, snapshot.working, t]);

  const attachFiles = useCallback(async (files: FileList | File[]): Promise<void> => {
    const incoming = Array.from(files);
    if (!incoming.length) return;
    const remaining = Math.max(0, 5 - attachments.length);
    if (incoming.length > remaining) setError(t('fusion.attachments.limit', { count: 5 }));
    const additions: Array<{ id: string; name: string; text: string; size: number }> = [];
    for (const file of incoming.slice(0, remaining)) {
      if (file.size > 400_000) {
        setError(t('fusion.attachments.fileTooLarge', { name: file.name }));
        continue;
      }
      try {
        const text = await file.text();
        if (text.includes('\0')) {
          setError(t('fusion.attachments.notText', { name: file.name }));
          continue;
        }
        additions.push({ id: crypto.randomUUID(), name: file.name, text, size: file.size });
      } catch {
        setError(t('fusion.attachments.readError', { name: file.name }));
      }
    }
    if (additions.length) setAttachments((current) => [...current, ...additions].slice(0, 5));
  }, [attachments.length, t]);

  const onDragEnter = (event: DragEvent<HTMLElement>): void => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setFileDropActive(true);
  };

  const onDragOver = (event: DragEvent<HTMLElement>): void => {
    if (event.dataTransfer.types.includes('Files')) event.preventDefault();
  };

  const onDragLeave = (event: DragEvent<HTMLElement>): void => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setFileDropActive(false);
  };

  const onDrop = (event: DragEvent<HTMLElement>): void => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setFileDropActive(false);
    void attachFiles(event.dataTransfer.files);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <section className={`fusion-workspace${fileDropActive ? ' is-file-drop-active' : ''}`} aria-label={t('fusion.dsh.title')} onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {fileDropActive && <div className="fusion-drop-overlay" role="status"><Paperclip size={19} />{t('fusion.attachments.dropHint')}</div>}
      <header className="fusion-header">
        <div className="fusion-brand">
          <FusionPet mood={petMood} label={t(`fusion.pet.${petMood}`)} muted={muted} dropActive={fileDropActive} attachmentCount={attachments.length} />
          <div className="fusion-brand-copy"><strong>{t('fusion.brand')}</strong><span>{t(`fusion.status.${petMood}`)}</span></div>
        </div>
        <div className="fusion-header-actions">
          <button className="fusion-icon-button" type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? t('fusion.sound.on') : t('fusion.sound.off')} title={muted ? t('fusion.sound.on') : t('fusion.sound.off')}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </header>
      <div className="fusion-toolbar">
        <label className="fusion-provider">
          <FusionProviderIcon provider="dsh" />
          <select aria-label={t('fusion.provider.select')} value="dsh" onChange={(event) => {
            if (event.target.value === 'codex') onOpenCodex();
            if (event.target.value === 'openai' || event.target.value === 'anthropic' || event.target.value === 'ollama') onOpenAssistant(event.target.value);
          }}>
            <option value="codex">{t('fusion.provider.codex')}</option>
            <option value="dsh">{t('fusion.provider.dsh')}</option>
            <option value="openai">{t('fusion.provider.custom')}</option>
            <option value="anthropic">{t('fusion.provider.anthropic')}</option>
            <option value="ollama">{t('fusion.provider.ollama')}</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
        <button className={`fusion-project${project ? ' is-selected' : ''}`} type="button" onClick={() => void selectProject()} title={project || t('fusion.project.choose')}>
          <FolderOpen size={15} aria-hidden="true" /><span>{project || t('fusion.project.choose')}</span>
        </button>
      </div>
      <div className="fusion-session-row">
        <label className="fusion-session-select">
          <span>{t('fusion.sessions.label')}</span>
          <select value={snapshot.activeSessionId || ''} onChange={(event) => {
            const session = snapshot.sessions.find((item) => item.id === event.target.value);
            if (session) void resumeSession(session);
          }}>
            <option value="">{t('fusion.dsh.sessions.choose')}</option>
            {snapshot.sessions.map((session) => <option key={session.id} value={session.id}>{session.title || `${session.cwd} · ${session.id.slice(0, 8)}`}</option>)}
          </select>
        </label>
        <button className="fusion-new-session" type="button" onClick={() => void createSession()} disabled={!project || busy}>
          <Plus size={15} aria-hidden="true" />{t('fusion.sessions.new')}
        </button>
      </div>
      <div className="fusion-conversation-heading">
        <span className="fusion-session-title">{snapshot.activeSessionId || t('fusion.dsh.sessions.startHint')}</span>
        {snapshot.working && <button className="fusion-stop" type="button" onClick={() => { completion.suppressNextFinish(); void window.api.fusionDshCancel(); }}><X size={14} />{t('fusion.actions.stop')}</button>}
      </div>
      <div className="fusion-message-feed" ref={feedRef}>
        {snapshot.messages.length === 0 && (
          <div className="fusion-empty-state">
            <span className="fusion-empty-orb"><Bot size={22} /></span>
            <strong>{t('fusion.empty.title')}</strong>
            <p>{project ? t('fusion.dsh.empty.projectReady') : t('fusion.empty.chooseProject')}</p>
          </div>
        )}
        {snapshot.messages.map((message) => (
          <article className={`fusion-message fusion-message--${message.role}`} key={message.id}>
            {message.role === 'tool' && <span className="fusion-tool-status">{message.status === 'mode' ? t('fusion.dsh.mode') : ['pending', 'in_progress'].includes(message.status || '') ? t('fusion.tool.running') : ['failed', 'cancelled'].includes(message.status || '') ? t('fusion.tool.failed') : t('fusion.tool.done')}</span>}
            <div className="fusion-markdown">{message.role === 'assistant' ? <AssistantMarkdown content={message.text} previewLinks={false} /> : <p>{message.text}</p>}</div>
          </article>
        ))}
        {snapshot.pendingRequests.map((request) => (
          <article className="fusion-request" key={request.requestId}>
            <p className="fusion-request-context">{t('fusion.dsh.permissionContext', { sessionId: request.sessionId, project: snapshot.sessions.find((session) => session.id === request.sessionId)?.cwd || '' })}</p>
            <strong>{request.title}</strong>
            {request.description && <p>{request.description}</p>}
            {request.toolTitle && <code>{request.toolTitle}</code>}
            <div className="fusion-request-actions">
              {request.options.map((option) => (
                <button
                  className={option.kind.includes('reject') ? 'is-muted' : ''}
                  key={option.optionId}
                  type="button"
                  onClick={() => void window.api.fusionDshAnswerPermission(request.requestId, option.optionId)}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </article>
        ))}
        {snapshot.working && <div className="fusion-thinking"><span />{t('fusion.status.working')}</div>}
      </div>
      {(error || snapshot.error) && <div className="fusion-inline-error" role="status">{error || snapshot.error}</div>}
      {!snapshot.activeSessionId && (
        <div className="fusion-connect-row">
          <span>{busy ? t('fusion.dsh.connecting') : t('fusion.dsh.readyHint')}</span>
          <button type="button" onClick={() => void refresh()} disabled={busy}>{t('fusion.actions.refresh')}</button>
        </div>
      )}
      {attachments.length > 0 && <div className="fusion-attachment-strip" aria-label={t('fusion.attachments.pending')}>
        {attachments.map((attachment) => <span className="fusion-attachment-chip" key={attachment.id} title={`${attachment.name} · ${Math.ceil(attachment.size / 1024)} KB`}>
          <FusionFileIcon name={attachment.name} /><span>{attachment.name}</span>
          <button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))} aria-label={t('fusion.attachments.remove', { name: attachment.name })}><X size={12} /></button>
        </span>)}
      </div>}
      <div className="fusion-composer">
        <label className="fusion-attach"><input ref={attachmentInputRef} type="file" multiple accept="text/*,.md,.txt,.json,.xml,.yaml,.yml,.ts,.tsx,.js,.jsx,.py,.rs,.go,.cs,.html,.css,.sql,.log,.toml,.ini,.sh,.ps1" onChange={(event) => { if (event.target.files) void attachFiles(event.target.files); event.target.value = ''; }} aria-label={t('fusion.attachments.add')} /><Paperclip size={15} /></label>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onInputKeyDown} disabled={!snapshot.activeSessionId || snapshot.working} placeholder={t('fusion.input.placeholder')} aria-label={t('fusion.input.label')} rows={1} />
        <button type="button" onClick={() => void send()} disabled={!snapshot.activeSessionId || snapshot.working || (!draft.trim() && attachments.length === 0)} aria-label={t('fusion.input.send')} title={t('fusion.input.send')}><ArrowUp size={16} /></button>
      </div>
    </section>
  );
}
