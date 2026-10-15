/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file FusionChat.tsx @description Shared compact and full conversation views. @author 鸡哥 */
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, BookOpen, Download, FolderOpen, LayoutGrid, MessageCircle, Music2, AppWindow, Mic, Minus, Paperclip, Plus, RefreshCw, Settings, SlidersHorizontal, Square, X } from 'lucide-react';
import type { AssistantConversation, FusionProvider, WorkspaceTarget } from '../../../preload/types/fusionWorkspace';
import type { FusionCodexMessage } from '../../../preload/types/fusion';
import { useFusionActivity } from './fusionActivity';
import { useFusionDraft } from './useFusionDraft';
import { useCompactChatSize } from './useCompactChatSize';
import { getAgentAdapter, type AgentSession } from './agentAdapters';
import { useFusionVoice } from './useFusionVoice';
import {useProductStore} from './productStore';
import { useFusionPreferences } from './fusionPreferences';
import { FusionPet, usePetCompletion } from './FusionPet';
import { usePetFeedback } from './usePetFeedback';
import { FusionShortRequest } from './FusionShortRequest';
import {FusionSettings} from './FusionSettings';
import { MediaBar } from './MediaBar';
import { installRangeFill } from './rangeFill';
import { useMediaState } from './mediaState';
import { useMusicState } from './musicState';
import './responsiveWorkspace.css';
import { TOOL_GROUPS, TOOL_REGISTRY,resolveToolTarget } from './tools/toolRegistry';
import { Search } from 'lucide-react';
import { FusionToolsTab } from './FusionToolsTab';
import { NavigationWheel, isIslandWheelContent } from './navigation';
import { AssistantMarkdown } from '../states/maxExpand/components/agent/components/AssistantMarkdown';
import useIslandStore from '../../store/slices';
import { useSlidingIndicator } from './useSlidingIndicator';
import './fusionIsland.css';
import './fusionTheme.css';
import './fusionLayout.css';
import './floatDesign.css';
import './floatIsland.css';
import './workspaceEnhancement.css';
import './floatStage.css';
import './compactWorkspace.css';
import './sessionReadingLayout.css';
import {ViewportHandles} from './ViewportHandles';
import {WORKSPACE_PAGES,readWorkspaceNavigation,writeWorkspaceNavigation,workspacePageForTool,type WorkspacePage} from './workspaceNavigation';

const providers: FusionProvider[] = ['codex', 'dsh', 'openai', 'anthropic', 'ollama'];
const providerLabels = { codex: 'codex', dsh: 'dsh', openai: 'custom', anthropic: 'anthropic', ollama: 'ollama' };
const remembered = (provider: FusionProvider): string => localStorage.getItem('fusion.session.' + provider) ||
  (provider === 'codex' ? localStorage.getItem('fusion.codex-active-thread') : provider === 'dsh' ? localStorage.getItem('fusion.dsh-active-session') : null) || '';

/** 窄窗口时导航只显示图标，每页一个固定图标。 */
const PAGE_ICONS = { chat: MessageCircle, tools: LayoutGrid, music: Music2, reading: BookOpen, download: Download } as const;

/** Renders the same live conversation in either a small island or the full workbench. */
export function FusionChat({ compact = false, visible = true }: { compact?: boolean; visible?: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<FusionProvider>(() => {
    const saved = localStorage.getItem('fusion.provider') as FusionProvider;
    return providers.includes(saved) ? saved : 'codex';
  });
  const [sessionId, setSessionId] = useState(() => remembered(provider));
  const adapter = useMemo(() => getAgentAdapter(provider), [provider]);
  const [localSessions, setLocalSessions] = useState<AgentSession[]>([]);
  const key = provider + ':' + (sessionId || 'new');
  const draft = useFusionDraft(key);
  const { codex, dsh, echo } = useFusionActivity();
  const [assistant, setAssistant] = useState<AssistantConversation | null>(null);
  const [error, setError] = useState('');
  const [shortcutWarning, setShortcutWarning] = useState(() => localStorage.getItem('fusion.onboarding-shortcut-warning') === '1');
  useEffect(() => {const update = (): void => setShortcutWarning(localStorage.getItem('fusion.onboarding-shortcut-warning') === '1');window.addEventListener('fusion-onboarding-shortcuts', update);return () => window.removeEventListener('fusion-onboarding-shortcuts', update);}, []);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<import('../../../preload/types/fusionWorkspace').FusionModel[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const modelGeneration = useRef(0);
  useEffect(() => { modelGeneration.current++; setModels([]); setModelsBusy(false); }, [provider]);
  const loadModels = async (): Promise<void> => {
    const generation = ++modelGeneration.current;
    setModelsBusy(true); setError('');
    try { const available = await window.api.fusionModels(provider); if (generation === modelGeneration.current) setModels(available); }
    catch (reason) { if (generation === modelGeneration.current) setError(String(reason)); }
    finally { if (generation === modelGeneration.current) setModelsBusy(false); }
  };
  const modelKey = (model?: import('../../../preload/types/fusionWorkspace').FusionModel): string => model ? JSON.stringify([model.provider || '', model.id]) : '';
  const modelOptions = draft.value.model && !models.some(m => modelKey(m) === modelKey(draft.value.model)) ? [draft.value.model, ...models] : models;
  const [dragging, setDragging] = useState(false);
  const [islandView, setIslandView] = useState<WorkspacePage>(() => readWorkspaceNavigation().islandPage);
  const [toolRequest, setToolRequest] = useState<{id:string;nonce:number}|null>(null);
  const [toolsOpened, setToolsOpened] = useState(islandView !== 'chat');
  const [setupOpen, setSetupOpen] = useState(false);
  const setup = useRef<HTMLDivElement>(null),setupTrigger=useRef<HTMLButtonElement>(null);
  const media = useMediaState().find(item => item.active);
  const music = useMusicState();
  const wheel = useRef(new NavigationWheel());
  const tabs = useRef<HTMLElement>(null);
  const pageTabs=useRef<Partial<Record<WorkspacePage,string>>>({[readWorkspaceNavigation().islandPage]:readWorkspaceNavigation().tab});
  useEffect(() => installRangeFill(), []);
  useEffect(()=>useProductStore.subscribe(state=>{const page=workspacePageForTool(state.target,state.tab);if(['music','reading','download'].includes(page))pageTabs.current[page]=state.tab;}),[]);
  useSlidingIndicator(tabs, 'button[aria-pressed=true]', islandView);
  const selectView = (view: WorkspacePage, reset = true): void => {
    const previous=useProductStore.getState();
    if(['music','reading','download'].includes(islandView)&&previous.target===(islandView==='reading'?'collections':islandView))pageTabs.current[islandView]=previous.tab;
    if(compact)useIslandStore.getState().setMaxExpandTab('aiChat');
    setSetupOpen(false);
    if(reset&&view!=='chat'){
      const current=useProductStore.getState(),id=view==='tools'?'home':view==='reading'?'collections':view;
      const tab=current.target===id&&islandView===view?current.tab:pageTabs.current[view]??(view==='reading'?'books':'');
      current.set({target:id==='home'?'':id,tab,nonce:Date.now(),navigationOrigin:'category'});
      setToolRequest({id,nonce:Date.now()});
    }
    if (view !== 'chat') voice.cancel();
    if (view === 'chat') void window.api.fusionMediaCommand('pause').catch(reason => setError(String(reason)));
    setIslandView(view); writeWorkspaceNavigation({islandPage:view});
    if (view !== 'chat') setToolsOpened(true);
  };
  const productNonce=useProductStore(s=>s.nonce);
  useEffect(()=>{const product=useProductStore.getState();if(!compact||!product.target||!product.nonce)return;const tool=TOOL_REGISTRY.find(item=>item.id===product.target);if(tool){const page=tool.id==='collections'&&product.tab==='files'&&islandView==='reading'?'reading':workspacePageForTool(tool.id,product.tab);selectView(page,false);setToolRequest({id:tool.id,nonce:product.nonce});}},[compact,productNonce]);
  useEffect(() => { if (!compact) return; const open = (event: Event): void => { const id=(event as CustomEvent<string>).detail,route=resolveToolTarget(id); const tool=TOOL_REGISTRY.find(item=>item.id===route.id); if(tool){const product=useProductStore.getState();product.set({target:route.id,tab:route.tab||(product.target===route.id?product.tab:''),nonce:Date.now()});selectView(workspacePageForTool(route.id,route.tab||product.tab),false);setToolRequest({id,nonce:product.nonce+1});} }; window.addEventListener('fusion-open-tool', open); return () => window.removeEventListener('fusion-open-tool', open); }, [compact, islandView]);
  useEffect(()=>{if(!compact)return;const navigate=(event:Event):void=>{const id=(event as CustomEvent<string>).detail;if(WORKSPACE_PAGES.includes(id as WorkspacePage))selectView(id as WorkspacePage);else if(TOOL_GROUPS.some(group=>group===id)){selectView('tools');requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('fusion-select-tool-group',{detail:id})));}};window.addEventListener('fusion-navigate-peer',navigate);return()=>window.removeEventListener('fusion-navigate-peer',navigate);},[compact,islandView]);
  const preferences = useFusionPreferences(s => s.value);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  useCompactChatSize(root, compact && visible);
  const scroll = useRef(new Map<string, number>());
  const workspaceTab = useIslandStore(s => s.maxExpandTab);
  const islandSettings=compact&&workspaceTab==='settings';
  const voice = useFusionVoice(provider, key, visible && (compact ? islandView === 'chat'&&!islandSettings : workspaceTab === 'aiChat'), draft.value.text, draft.version, text => draft.update({ text }));
  const voiceFocused = voice.phase !== 'idle';
  const voicePage = compact && islandView === 'chat' && !islandSettings;
  useEffect(() => { if (visible && (voicePage || !compact && workspaceTab === 'aiChat')) void window.api.fusionMediaCommand('pause').catch(reason => setError(String(reason))); }, [visible, voicePage, compact, workspaceTab]);
  useEffect(() => { if (!setupOpen) return; const outside = (event: PointerEvent): void => { if (!setup.current?.contains(event.target as Node)) setSetupOpen(false); }; document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside); }, [setupOpen]);
  const voiceTime = Math.floor(voice.elapsed / 60).toString().padStart(2, '0') + ':' + (voice.elapsed % 60).toString().padStart(2, '0');
  const voiceStateKey = !voice.status ? 'checking' : voice.status.ready ? 'ready' :
    ({ 'dsh-disconnected': 'disconnected', 'dsh-voice-not-enabled': 'notEnabled', unprepared: 'modelMissing', preparing: 'preparing', failed: 'failed', cancelled: 'modelMissing' } as Record<string, string>)[voice.status.reason || ''] || 'unavailable';
  const agent = provider === 'codex' ? codex : provider === 'dsh' ? dsh : null;
  const state = agent?.sessionStates?.[sessionId];
  const messages: FusionCodexMessage[] = state?.messages || (assistant?.key === key ? assistant.messages : []);
  const working = state?.working || (assistant?.key === key && assistant.working) || false;
  const currentError = state?.error || agent?.error || (assistant?.key === key ? assistant.error : null);
  const hasSession = Boolean(sessionId);
  const sessions = provider === 'codex' ? codex?.threads.map(s => ({ id: s.id, title: s.name || s.preview || s.id })) :
    provider === 'dsh' ? dsh?.sessions.map(s => ({ id: s.id, title: s.title || s.cwd || s.id })) : localSessions;
  const pending = (codex?.pendingRequests.length || 0) + (dsh?.pendingRequests.length || 0);
  const completion = usePetCompletion(working, Boolean(currentError), preferences.muted || !visible, key, visible && (compact ? islandView === 'chat' : workspaceTab === 'aiChat'));
  const productJobs=useProductStore(s=>s.jobs);
  const productWaiting=Object.values(productJobs).some(job=>job.state==='waiting');
  const productWorking=Object.values(productJobs).some(job=>job.state==='running');
  const observed=echo?.state==='ready' ? echo.sessions.filter(item=>item.source==='workbuddy'||item.source==='codex') : [];
  const observedWorking=observed.some(item=>['Running','Processing'].includes(item.status));
  const observedWaiting=observed.some(item=>item.status==='WaitingApproval');
  const observedError=observed.some(item=>item.status==='Error');
  const observedCompletion=usePetCompletion(observedWorking,observedError||observedWaiting||observed[0]?.status!=='Completed',preferences.muted||!visible,'workbuddy:'+observed[0]?.sessionId,visible&&voicePage);
  const mood = currentError||observedError ? 'error' : pending||productWaiting||observedWaiting ? 'waiting' : working||productWorking||observedWorking ? 'working' : completion.finished||observedCompletion.finished ? 'finished' : 'idle';
  const companionMood = voice.phase === 'recording' ? 'listening' : voice.phase === 'permission' || voice.phase === 'transcribing' ? 'thinking' : voice.error || error || currentError ? 'error' : working ? 'thinking' : mood;
  const latest = messages.filter(item => item.role !== 'tool').at(-1);
  const feedback = usePetFeedback({ session: key, message: messages.filter(item => item.role === 'assistant').at(-1), working, priority: companionMood, active: visible && (compact ? islandView === 'chat' : workspaceTab === 'aiChat') });
  const heroMood = ['idle', 'finished'].includes(companionMood) && feedback.reaction !== 'idle' ? feedback.reaction : companionMood;
  const displayed = messages;
  /** 对话页的主角舞台：无消息时居中放大，有消息后收为左上角陪伴并显示状态气泡。 */
  const stageVisible = !voiceFocused && (!compact || islandView === 'chat' && !islandSettings);
  const stageDocked = displayed.length > 0;
  const stageLine = messages.filter(m => m.role === 'tool').at(-1)?.text || t('fusion.status.working');
  const setSelection = (next: FusionProvider, id = remembered(next)): void => {
    voice.cancel(); setProvider(next); setSessionId(id); setError('');
    localStorage.setItem('fusion.provider', next);
    localStorage.setItem('fusion.session.' + next, id);
  };
  const route = (target: WorkspaceTarget): void => {
    if (!target.sessionKey) return;
    const colon = target.sessionKey.indexOf(':');
    const next = target.sessionKey.slice(0, colon) as FusionProvider;
    if (providers.includes(next)) setSelection(next, target.sessionKey.slice(colon + 1).replace(/^new$/, ''));
  };
  useEffect(() => {
    if (provider === 'codex' || provider === 'dsh') return;
    let active = true;
    void adapter.list().then(value => { if (active) setLocalSessions(value); }).catch(reason => { if (active) setError(String(reason)); });
    const stop = window.api.onFusionAssistantConversation(value => {
      if (!active || !value.key.startsWith(provider + ':')) return;
      const id = value.key.slice(provider.length + 1);
      const session: AgentSession = { id, key: value.key, project: '',
        title: value.messages.find(message => message.role === 'user')?.text.slice(0, 80) || id,
        messages: [], working: value.working };
      setLocalSessions(previous => [session, ...previous.filter(item => item.id !== id)]);
    });
    return () => { active = false; stop(); };
  }, [adapter, provider]);
  useEffect(() => {
    const stop = window.api.onWorkspaceTarget(route);
    const select = (event: Event): void => {
      const next = (event as CustomEvent).detail as FusionProvider;
      if (providers.includes(next)) setSelection(next);
    };
    window.addEventListener('fusion-select-provider', select);
    if (!compact) void window.api.workspaceTarget().then(route);
    return () => { stop(); window.removeEventListener('fusion-select-provider', select); };
  }, [compact]);
  useEffect(() => {
    if (provider === 'codex' || provider === 'dsh' || !sessionId) { setAssistant(null); return; }
    let active = true;
    const stop = window.api.onFusionAssistantConversation(value => { if (active && value.key === key) setAssistant(value); });
    void window.api.fusionAssistantConversation(key).then(value => { if (active) setAssistant(value); }).catch(reason => setError(String(reason)));
    return () => { active = false; stop(); };
  }, [key, provider, sessionId]);
  useEffect(() => {
    const element = feed.current; if (!element) return;
    element.scrollTop = scroll.current.get(key) || 0;
  }, [key]);
  useEffect(() => {
    const element = feed.current;
    if (visible && element && element.scrollHeight - element.scrollTop - element.clientHeight < 180) element.scrollTop = element.scrollHeight;
  }, [messages.at(-1)?.text, visible]);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true); setError('');
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const createSession = (): Promise<void> => run(async () => {
    let cwd = draft.value.project;
    if (provider === 'codex' || provider === 'dsh') {
      if (!cwd) cwd = await window.api.fusionSelectProject() || '';
      if (!cwd) return;
    }
    const result = await adapter.create(cwd);
    const nextKey = provider + ':' + result.id;
    const initial = await window.api.fusionDraftGet(nextKey);
    await window.api.fusionDraftWrite(nextKey, initial.revision, { text: hasSession ? '' : draft.value.text, attachments: hasSession ? [] : draft.value.attachments, project: cwd, ...(draft.value.model ? { model: draft.value.model } : {}) });
    setSelection(provider, result.id);
  });
  const selectSession = (id: string): Promise<void> => run(async () => {
    if (!id) return;
    await adapter.resume(id);
    setSelection(provider, id);
  });
  const attach = async (files: FileList | File[]): Promise<void> => {
    const additions: import('../../../preload/types/fusionWorkspace').FusionAttachment[] = [];
    for (const file of Array.from(files).slice(0, 5 - draft.value.attachments.length)) {
      if (file.size > 400_000) { setError(t('fusion.attachments.fileTooLarge', { name: file.name })); continue; }
      const text = await file.text();
      if (text.includes('\0')) { setError(t('fusion.attachments.notText', { name: file.name })); continue; }
      additions.push({ id: crypto.randomUUID(), name: file.name, size: file.size, text });
    }
    draft.update({ attachments: [...draft.value.attachments, ...additions] });
  };
  const send = (): Promise<void> => run(async () => {
    if (!hasSession || working) return;
    // A remembered selection survives app restarts, but the backend connection does not.
    await adapter.resume(sessionId);
    const submission = await draft.consume();
    if (!submission) return;
    const sent = submission.value;
    const text = [...sent.attachments.map(a => '<attachment name="' + a.name.replace(/[<>"]/g, '_') + '">\n' + a.text + '\n</attachment>'), sent.text.trim()].filter(Boolean).join('\n\n');
    if (!text) return;
    try {
      await adapter.send(sessionId, text, sent.model);
    } catch (reason) {
      await submission.restore();
      throw reason;
    }
  });
  const stopTask = (): Promise<void> => run(async () => {
    window.dispatchEvent(new Event('float-avatar-cancel'));
    feedback.cancel();
    completion.suppressNextFinish();
    await adapter.cancel(sessionId);
  });
  const openFull = (): Promise<void> => run(async () => {
    if (await draft.flush()) { voice.cancel(); await window.api.openWorkspace({ tab: islandView==='chat'?'aiChat':'toolbox', sessionKey: key });if(compact)useIslandStore.getState().setIdle(true); }
  });

  return <section ref={root} className={'fusion-chat' + (compact ? ' fusion-chat--compact' : '') + (dragging ? ' is-file-drop-active' : '') + (voiceFocused ? ' is-voice-focused' : '')} data-voice-focused={voicePage} data-island-page={compact ? islandView : undefined}
    onWheel={event => {
      if (document.documentElement.dataset.floatGesture || !compact || !preferences.wheelNavigation || event.ctrlKey || isIslandWheelContent(event.target)) return;
      event.stopPropagation();
      const tabs = WORKSPACE_PAGES;
      const index = tabs.indexOf(islandView);
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.current?.clientHeight || 400 : 1);
      const next = wheel.current.move(index, tabs.length, delta, performance.now());
      if (next !== index) selectView(tabs[next]);
    }}
    onClick={event => event.stopPropagation()} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => { setDragging(false); if ((event.target as Element).closest('.fusion-tool-content')) return;
      // Shared product drop handling owns files outside a specific tool.
      return; }}>
    {compact&&<ViewportHandles/>}
    <header className="fusion-chat-header" hidden={!compact}>
      <span className="fusion-chat-avatar-slot">{!stageVisible && <FusionPet actionToken={key} mood={mood} label={t('fusion.pet.' + mood)} muted={preferences.muted} dropActive={dragging} attachmentCount={draft.value.attachments.length} />}</span>
      {compact ? <>
        <nav ref={tabs} className="fusion-island-tabs" aria-label={t('fusion.island.navigation')}>
          {WORKSPACE_PAGES.map((view, index) => <button type="button" key={view} aria-pressed={islandView === view} title={t('fusion.workspace.pages.'+view)}
            onClick={() => selectView(view)} onKeyDown={event => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault(); const tabs = WORKSPACE_PAGES;
              const next = Math.max(0, Math.min(tabs.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1))); selectView(tabs[next]);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
            }}>{(() => { const Icon = PAGE_ICONS[view]; return <Icon size={16} strokeWidth={1.8} aria-hidden="true" />; })()}<span>{t('fusion.workspace.pages.'+view)}</span></button>)}
        </nav>
        <div className="fusion-session-menu" ref={setup}>
          <button ref={setupTrigger} type="button" className="fusion-icon-button" aria-label={t('fusion.focus.sessionMenu')} title={t('fusion.focus.sessionMenu')} aria-expanded={setupOpen} onClick={() => setSetupOpen(!setupOpen)}><SlidersHorizontal size={20} strokeWidth={1.6}/></button>
          {setupOpen && <div className="fusion-session-popover" role="dialog" aria-label={t('fusion.focus.sessionMenu')} onKeyDown={event => { event.stopPropagation();if (event.key === 'Escape'){event.preventDefault();setSetupOpen(false);setupTrigger.current?.focus();} }}>
            <label>{t('fusion.focus.agent')}<select autoFocus disabled={voiceFocused} value={provider} onChange={event => setSelection(event.target.value as FusionProvider)}>{providers.map(id => <option key={id} value={id}>{t('fusion.provider.' + providerLabels[id])}</option>)}</select></label>
            <label>{t('fusion.sessions.label')}<select value={sessionId} disabled={busy} onChange={event => void selectSession(event.target.value)}><option value="">{t('fusion.sessions.chooseProvider', { provider: t('fusion.provider.' + providerLabels[provider]) })}</option>{sessionId && !sessions?.some(item => item.id === sessionId) && <option value={sessionId}>{sessionId}</option>}{sessions?.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label>{t('fusion.models.label')}<select value={modelKey(draft.value.model)} disabled={working || busy} onFocus={() => { if (!models.length && !modelsBusy) void loadModels(); }} onChange={event => draft.update({ model: modelOptions.find(model => modelKey(model) === event.target.value) })}><option value="">{t('fusion.models.inherit')}</option>{modelOptions.map(model => <option key={modelKey(model)} value={modelKey(model)}>{model.name}</option>)}</select></label>
            <div className="fusion-tool-actions"><button title={t('fusion.sessions.new')} aria-label={t('fusion.sessions.new')} disabled={busy} onClick={() => void createSession()}><Plus size={20} strokeWidth={1.6}/></button><button title={draft.value.project||t('fusion.project.choose')} aria-label={t('fusion.project.choose')} onClick={() => void run(async () => { const project = await window.api.fusionSelectProject(); if (project) draft.update({ project }); })}><FolderOpen size={20} strokeWidth={1.6}/></button><button disabled={modelsBusy||working} title={t('fusion.models.refresh')} aria-label={t('fusion.models.refresh')} onClick={()=>void loadModels()}><RefreshCw size={20} strokeWidth={1.6}/></button><button title={t('fusion.navigation.settings')} aria-label={t('fusion.navigation.settings')} onClick={() => {setSetupOpen(false);if(compact)useIslandStore.getState().setMaxExpandTab('settings');else void window.api.openWorkspace({ tab: 'settings', settingsSection: 'navigation' });}}><Settings size={20} strokeWidth={1.6}/></button></div>
          </div>}
        </div>
        <button type="button" className="fusion-icon-button" aria-label={t("fusion.product.search")} title={t("fusion.product.search")} onClick={()=>window.dispatchEvent(new Event("fusion-product-search"))}><Search size={15}/></button>
        <button type="button" className="fusion-icon-button" title={t('fusion.entry.openFull')} aria-label={t('fusion.entry.openFull')} onClick={() => void openFull()}><AppWindow size={15} strokeWidth={1.8} /></button>
        <button type="button" className="fusion-icon-button" title={t('fusion.navigation.collapse')} aria-label={t('fusion.navigation.collapse')} onClick={() => { voice.cancel(); useIslandStore.getState().setIdle(true); }}><Minus size={15} /></button>
      </> : <select aria-label={t('fusion.provider.select')} value={provider} onChange={event => setSelection(event.target.value as FusionProvider)}>{providers.map(id => <option key={id} value={id}>{t('fusion.provider.' + providerLabels[id])}</option>)}</select>}
    </header>
    {islandSettings&&<div className="fusion-island-settings"><FusionSettings/></div>}
    {voiceFocused && <div className="fusion-voice-focus" role="region" aria-label={t('fusion.voice.start')} data-phase={voice.phase}>
      <div className="fusion-focus-companion" data-mood={heroMood} data-recording={voice.phase === 'recording'}>
        <FusionPet actionToken={key} mood={heroMood} label={t('fusion.pet.' + heroMood)} muted={preferences.muted} disabled={voiceFocused} />
        <div className="fusion-companion-listening" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} style={{ height: `${5 + voice.level * (index % 2 ? 28 : 42)}px` }} />)}</div>
      </div>
      {latest && <div className="fusion-focus-reply" aria-live="off">{latest.role === 'assistant' ? <AssistantMarkdown content={latest.text} previewLinks={false} /> : <p>{latest.text}</p>}</div>}
      {voiceFocused && <span className="fusion-voice-time" aria-label={t('fusion.voice.elapsed')}>{voiceTime}</span>}
      {(error || currentError || draft.error || voice.error) && <p className="fusion-focus-error" role="alert">{error || currentError || draft.error || voice.error}</p>}
      {draft.conflict && <div className="fusion-tool-actions"><button onClick={() => draft.resolve(true)}>{t('fusion.entry.keepMine')}</button><button onClick={() => draft.resolve(false)}>{t('fusion.entry.useLatest')}</button></div>}
      {voice.pending && <div className="fusion-inline-notice"><p>{voice.pending}</p><div className="fusion-tool-actions"><button onClick={voice.insertPending}>{t('fusion.voice.insert')}</button><button onClick={voice.discardPending}>{t('fusion.voice.discard')}</button></div></div>}
      <div className="fusion-focus-input">
      <textarea className="fusion-voice-draft" rows={2} placeholder={t('fusion.composer.placeholder')} aria-label={t('fusion.composer.placeholder')} value={draft.value.text} onChange={event => draft.update({ text: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!voiceFocused && !voice.pending) void send(); } }} />
      <div className="fusion-voice-controls">
        {voiceFocused && <button type="button" className="fusion-icon-button" aria-label={t('fusion.voice.cancel')} title={t('fusion.voice.cancel')} onClick={voice.cancel}><X size={16} /></button>}
        <button type="button" className="fusion-focus-mic" disabled={voice.phase === 'permission' || voice.phase === 'transcribing'} aria-label={t(voice.phase === 'recording' ? 'fusion.voice.stop' : 'fusion.voice.start')} title={t(voice.phase === 'recording' ? 'fusion.voice.stop' : 'fusion.voice.start')} onClick={() => void (voice.phase === 'recording' ? voice.stop() : voice.start())}>{voice.phase === 'recording' ? <Square size={17} /> : <Mic size={19} />}</button>
        <span className="fusion-focus-control-space" />
        {working ? <button type="button" className="fusion-icon-button" aria-label={t('fusion.actions.stop')} title={t('fusion.actions.stop')} onClick={() => void stopTask()}><Square size={15} /></button> : <button type="button" className="fusion-icon-button" disabled={busy || voiceFocused || !draft.ready || draft.conflict || !hasSession || !draft.value.text.trim()} aria-label={t('fusion.actions.send')} title={t('fusion.actions.send')} onClick={() => void send()}><ArrowUp size={17} /></button>}
      </div>
      </div>
      <span className="fusion-screenreader" role="status">{voiceFocused ? t('fusion.voice.' + voice.phase) : ''}</span>
    </div>}
    <div className="fusion-chat-body" hidden={voiceFocused || compact&&(islandView!=='chat'||islandSettings)}>

    {compact && shortcutWarning && <div className="fusion-inline-notice" role="status"><p>{t('fusion.onboarding.shortcutDeferred')}</p><div className="fusion-tool-actions"><button onClick={() => {setSetupOpen(false);useIslandStore.getState().setMaxExpandTab('settings');}}>{t('fusion.navigation.settings')}</button><button aria-label={t('fusion.product.close')} onClick={() => {localStorage.removeItem('fusion.onboarding-shortcut-warning');setShortcutWarning(false);}}>{t('fusion.product.close')}</button></div></div>}

    <div className="fusion-chat-context">
      {!compact && <select className="fusion-chat-provider" aria-label={t('fusion.provider.select')} value={provider} onChange={event => setSelection(event.target.value as FusionProvider)}>{providers.map(id => <option key={id} value={id}>{t('fusion.provider.' + providerLabels[id])}</option>)}</select>}
      <select aria-label={t('fusion.sessions.label')} value={sessionId} disabled={busy}
        onChange={event => void selectSession(event.target.value)}>
        <option value="">{t('fusion.sessions.chooseProvider', { provider: t('fusion.provider.' + providerLabels[provider]) })}</option>
        {sessionId && !sessions?.some(s => s.id === sessionId) && <option value={sessionId}>{sessionId}</option>}
        {sessions?.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      <button type="button" className="fusion-icon-button" aria-label={t('fusion.project.choose')} title={draft.value.project || t('fusion.project.choose')}
        onClick={() => void run(async () => { const project = await window.api.fusionSelectProject(); if (project) draft.update({ project }); })}><FolderOpen size={15} /></button>
      <button type="button" className="fusion-small-action" disabled={busy} onClick={() => void createSession()}><Plus size={14} />{t('fusion.sessions.new')}</button>
    </div>
    {compact && <FusionShortRequest />}
    <div className="fusion-chat-model">
      <label htmlFor="fusion-chat-model">{t('fusion.models.label')}</label>
      <select id="fusion-chat-model" value={modelKey(draft.value.model)} disabled={working || busy || !draft.ready}
        onFocus={() => { if (!models.length && !modelsBusy) void loadModels(); }}
        onChange={event => draft.update({ model: modelOptions.find(m => modelKey(m) === event.target.value) })}>
        <option value="">{t('fusion.models.inherit')}</option>
        {modelOptions.map(model => <option key={modelKey(model)} value={modelKey(model)}>{model.name}</option>)}
      </select>
      <button type="button" className="fusion-icon-button" disabled={modelsBusy || working} onClick={() => void loadModels()}
        aria-label={t('fusion.models.refresh')} title={t('fusion.models.refresh')}><RefreshCw size={14} /></button>
      {modelsBusy && <span role="status">{t('fusion.models.loading')}</span>}
    </div>
    {stageVisible && <div className="float-stage" data-docked={stageDocked} data-mood={heroMood} data-drop={dragging}>
      <div className="float-stage-actor">
        <span className="float-stage-halo" aria-hidden="true" />
        <FusionPet actionToken={key} mood={heroMood} label={t('fusion.pet.' + heroMood)} muted={preferences.muted} dropActive={dragging} attachmentCount={draft.value.attachments.length} />
        <span className="float-stage-floor" aria-hidden="true" />
      </div>
      <div className="float-stage-bubble" role="status">
        <strong>{t('fusion.stage.mood.' + heroMood)}</strong>
        {working && <span title={stageLine}>{stageLine}</span>}
        {!hasSession && !stageDocked && <button type="button" className="float-stage-start" disabled={busy} onClick={() => void createSession()}><Plus size={15} />{t('fusion.sessions.new')}</button>}
      </div>
    </div>}
    <div className="fusion-chat-feed" ref={feed} hidden={stageVisible && !displayed.length} onScroll={event => scroll.current.set(key, event.currentTarget.scrollTop)}>
      <div className="fusion-chat-feed-content">
      {!displayed.length && !stageVisible && <div className="fusion-chat-empty">{t(hasSession ? 'fusion.entry.ready' : 'fusion.entry.createHint')}</div>}
      {displayed.map(message => <article key={message.id} className={'fusion-message fusion-message--' + message.role}>
        {message.role === 'assistant' ? <AssistantMarkdown content={message.text} previewLinks={false} /> : <p>{message.text}</p>}
      </article>)}
      {working && !stageVisible && <p className="fusion-chat-progress" role="status">{messages.filter(m => m.role === 'tool').at(-1)?.text || t('fusion.status.working')}</p>}
      </div>
    </div>
    {(error || currentError || draft.error || voice.error) && <p className="fusion-chat-error" role="alert">{error || currentError || draft.error || voice.error}</p>}
    {draft.conflict && <div className="fusion-inline-notice">{t('fusion.entry.draftConflict')}
      <button onClick={() => draft.resolve(true)}>{t('fusion.entry.keepMine')}</button><button onClick={() => draft.resolve(false)}>{t('fusion.entry.useLatest')}</button></div>}
    {voice.pending && <div className="fusion-inline-notice"><p>{voice.pending}</p>
      <button onClick={voice.insertPending}>{t('fusion.voice.insert')}</button><button onClick={voice.discardPending}>{t('fusion.voice.discard')}</button></div>}
    <div className="fusion-chat-attachments">{draft.value.attachments.map(file => <button key={file.id} onClick={() => draft.update({ attachments: draft.value.attachments.filter(a => a.id !== file.id) })}>{file.name}<X size={12} /></button>)}</div>
    <div className="fusion-chat-composer">
      <textarea aria-label={t('fusion.composer.placeholder')} placeholder={t('fusion.composer.placeholder')} value={draft.value.text} rows={compact ? 2 : 3}
        onChange={event => draft.update({ text: event.target.value })} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && !working && hasSession) void send(); }
        }} />
      <div className="fusion-chat-actions">
        <input hidden type="file" multiple ref={input} onChange={event => { if (event.target.files) void run(() => attach(event.target.files!)); event.target.value = ''; }} />
        <button type="button" className="fusion-icon-button" aria-label={t('fusion.attachments.add')} title={t('fusion.attachments.add')} onClick={() => input.current?.click()}><Paperclip size={16} /></button>
        <button type="button" className={'fusion-icon-button' + (voice.phase !== 'idle' ? ' is-recording' : '')}
          disabled={voice.phase === 'permission' || voice.phase === 'transcribing' || !voice.status?.ready}
          title={t(voice.phase === 'recording' ? 'fusion.voice.stop' : voice.status?.ready ? 'fusion.voice.start' : 'fusion.voice.unavailable')} aria-label={t(voice.phase === 'recording' ? 'fusion.voice.stop' : 'fusion.voice.start')}
          onClick={() => void (voice.phase === 'recording' ? voice.stop() : voice.start())}>
          {voice.phase === 'recording' ? <Square size={16} /> : <Mic size={16} />}
        </button>
        {voice.phase !== 'idle' ? <><span role="status">{t('fusion.voice.' + voice.phase)}</span><button onClick={voice.cancel}>{t('fusion.voice.cancel')}</button></> :
          <span className="fusion-voice-state" role="status">{t('fusion.voice.' + voiceStateKey)}
            {!voice.status?.ready && <button className="fusion-voice-hint" title={voice.status?.reason}
              onClick={() => void run(() => window.api.fusionIntegrationOpen('dsh'))}>{t('fusion.voice.dshSetup')}</button>}</span>}
        <div className="fusion-chat-spacer" />
        {!compact && provider !== 'codex' && provider !== 'dsh' && <button onClick={() => {
          localStorage.setItem('fusion.settings-model', provider); useIslandStore.getState().setMaxExpandTab('settings');
          window.dispatchEvent(new CustomEvent('fusion-open-model-settings', { detail: provider }));
        }}>{t('fusion.navigation.settings')}</button>}
        {working ? <button className="fusion-send" onClick={() => void stopTask()} aria-label={t('fusion.actions.stop')}><Square size={16} /></button> :
          <button className="fusion-send" disabled={busy || !draft.ready || draft.conflict || !hasSession || (!draft.value.text.trim() && !draft.value.attachments.length)}
            onClick={() => void send()} aria-label={t('fusion.actions.send')}><ArrowUp size={17} /></button>}
      </div>
    </div>
    </div>
    {compact && !islandSettings && !voiceFocused && ((!voicePage && media) || music?.active) && <MediaBar />}
    {compact && toolsOpened && <div className="fusion-island-tools" hidden={islandSettings || voiceFocused || islandView === 'chat'}><FusionToolsTab workspace={islandView==='chat'?'tools':islandView} compact request={toolRequest} onHome={()=>selectView('tools')} /></div>}
  </section>;
}
