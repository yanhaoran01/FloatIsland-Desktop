/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/**
 * @file MaxExpandContentShell.tsx
 * @description Persistent workspace pages with explicit, bounded navigation.
 * @author 鸡哥
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, Minus, ArrowLeft, Layers, Maximize2, X } from 'lucide-react';
import { FusionPet } from '../../fusion/FusionPet';
import { TOOL_GROUPS } from '../../fusion/tools/toolRegistry';
import {FusionToolsTab} from '../../fusion/FusionToolsTab';
import {useProductStore} from '../../fusion/productStore';
import useIslandStore from '../../../store/slices';
import type { MaxExpandTab } from '../../../store/types';
import { NavigationWheel, PRIMARY_TABS } from '../../fusion/navigation';
import { initializeFusionPreferences, useFusionPreferences } from '../../fusion/fusionPreferences';
import '../../fusion/fusionIsland.css';
import '../../fusion/fusionTheme.css';
import '../../fusion/fusionLayout.css';
import { MediaBar } from '../../fusion/MediaBar';
import { useAdaptiveView } from '../../fusion/useCompactChatSize';
import { FusionRequestQueue } from '../../fusion/FusionRequestQueue';
import {WORKSPACE_PAGES,readWorkspaceNavigation,writeWorkspaceNavigation,workspacePageForTool,type WorkspacePage} from '../../fusion/workspaceNavigation';
import { useSlidingIndicator } from '../../fusion/useSlidingIndicator';

export interface MaxExpandContentShellProps {
  renderActiveTab: (activeTab: MaxExpandTab, fallback: React.ReactElement, ready: boolean) => React.ReactElement | null;
  deferContent?: boolean;
}

/** Keeps visited pages alive while exposing a fixed navigation bar and explicit collapse. */
export function MaxExpandContentShell({ renderActiveTab }: MaxExpandContentShellProps): React.ReactElement {
  const { t } = useTranslation();
  const standalone = location.pathname.endsWith('DynamicIslandStandalone.html');
  const active = useIslandStore((s) => s.maxExpandTab);
  const navigate = useIslandStore((s) => s.setMaxExpandTab);
  const collapse = useIslandStore((s) => s.setIdle);
  const root = useRef<HTMLElement>(null);
  useAdaptiveView(root, true, active);
  useEffect(() => { const open = (): void => {const route=useProductStore.getState(),page=workspacePageForTool(route.target,route.tab);setWorkspacePage(page);writeWorkspaceNavigation({islandPage:page});navigate('toolbox');}; window.addEventListener('fusion-open-tool', open); return () => window.removeEventListener('fusion-open-tool', open); }, [navigate]);
  const [visited, setVisited] = useState<MaxExpandTab[]>([active]);
  const lastMain = useRef<MaxExpandTab>(readWorkspaceNavigation().page);
  const navRef = useRef<HTMLElement>(null);
  const wheel = useRef(new NavigationWheel());
  const preferences = useFusionPreferences((s) => s.value);
  const [workspacePage,setWorkspacePage]=useState<WorkspacePage>(()=>readWorkspaceNavigation().islandPage);
  useSlidingIndicator(navRef, 'button[aria-current=page]', active + ':' + workspacePage);
  const peers = WORKSPACE_PAGES;
  const selectPeer = (id: typeof peers[number]): void => {
    setWorkspacePage(id);writeWorkspaceNavigation({islandPage:id});
    if (id === 'chat') navigate('aiChat');
    else {const route=useProductStore.getState(),target=id==='tools'?'':id==='reading'?'collections':id,tab=id==='reading'?route.target===target&&['books','sources','search','reading','files','preview'].includes(route.tab)?route.tab:'books':route.target===target?route.tab:'';route.set({target,tab,nonce:Date.now(),navigationOrigin:'category'});navigate('toolbox');if(id==='tools')window.dispatchEvent(new CustomEvent('fusion-select-tool-group',{detail:'common'}));}
  };
  useEffect(()=>{const change=(event:Event):void=>{const id=(event as CustomEvent<string>).detail;if(WORKSPACE_PAGES.includes(id as WorkspacePage))selectPeer(id as WorkspacePage);else if(TOOL_GROUPS.some(group=>group===id)){selectPeer('tools');requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('fusion-select-tool-group',{detail:id})));}};window.addEventListener('fusion-navigate-peer',change);return()=>window.removeEventListener('fusion-navigate-peer',change);},[active,workspacePage]);
  const primary = active === 'settings' ? lastMain.current : PRIMARY_TABS.includes(active as typeof PRIMARY_TABS[number]) ? active : 'toolbox';
  if (active !== 'settings') lastMain.current = primary;
  const pages = visited.includes(active) ? visited : [...visited, active];

  useEffect(() => { void initializeFusionPreferences(); }, []);
  useEffect(()=>{if(active==='aiChat'&&readWorkspaceNavigation().islandPage!=='chat')navigate('toolbox');},[]);
  useEffect(() => { setVisited((old) => old.includes(active) ? old : [...old, active]); }, [active]);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !preferences.wheelNavigation) return;
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || active === 'settings' || document.documentElement.dataset.floatGesture) return;
      event.preventDefault();
      const index = active === 'toolbox' ? peers.indexOf(workspacePage) : 0;
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? nav.clientHeight : 1);
      const next = wheel.current.move(index, peers.length, delta, performance.now());
      if (next !== index) selectPeer(peers[next]);
    };
    nav.addEventListener('wheel', onWheel, { passive: false });
    return () => nav.removeEventListener('wheel', onWheel);
  }, [active, workspacePage, preferences.wheelNavigation, navigate]);

  const fallback = <div className="fusion-empty-state" role="status">{t('maxExpand.loading')}</div>;
  return <section ref={root} className="fusion-shell" data-active-page={active} onClick={(event) => event.stopPropagation()}>
    <header className="fusion-shell-header">
      <FusionPet mood="idle" label={t('fusion.pet.idle')} muted={preferences.muted} />
      <nav ref={navRef} className="fusion-navigation" aria-label={t('fusion.navigation.label')}>
        {peers.map((id, index) => <button key={id} type="button"
          aria-current={(id === 'chat' ? active === 'aiChat' : active === 'toolbox' && workspacePage === id) ? 'page' : undefined}
          onClick={() => selectPeer(id)} onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const next = Math.max(0, Math.min(peers.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
            selectPeer(peers[next]);
            navRef.current?.querySelectorAll('button')[next]?.focus();
          }}>{t('fusion.workspace.pages.'+id)}</button>)}
      </nav>
      {standalone&&<div className="fusion-window-drag" aria-hidden="true"/>}
      <button type="button" className="fusion-icon-button" aria-label={t('fusion.navigation.fusionSessions')} title={t('fusion.navigation.fusionSessions')} aria-pressed={active === 'fusionSessions'} onClick={() => navigate('fusionSessions')}><Layers size={16} /></button>
      <button type="button" className="fusion-icon-button" aria-label={t('fusion.navigation.settings')}
        title={t('fusion.navigation.settings')} aria-pressed={active === 'settings'}
        onClick={() => navigate(active === 'settings' ? lastMain.current : 'settings')}><Settings2 size={16} /></button>
      {standalone?<div className="fusion-window-controls">
        <button type="button" aria-label={t('standalone.controls.minimize')} title={t('standalone.controls.minimize')} onClick={()=>window.api.windowMinimize()}><Minus size={16}/></button>
        <button type="button" aria-label={t('standalone.controls.maximize')} title={t('standalone.controls.maximize')} onClick={()=>window.api.windowMaximize()}><Maximize2 size={14}/></button>
        <button type="button" aria-label={t('standalone.controls.close')} title={t('standalone.controls.close')} onClick={()=>window.api.windowClose()}><X size={16}/></button>
      </div>:<button type="button" className="fusion-icon-button" aria-label={t('fusion.navigation.collapse')}
        title={t('fusion.navigation.collapse')} onClick={() => collapse(true)}><Minus size={17} /></button>}
    </header>
    {!PRIMARY_TABS.includes(active as typeof PRIMARY_TABS[number]) && active !== 'settings' &&
      <button className="fusion-tool-back" onClick={() => navigate('toolbox')}><ArrowLeft size={14} />{t('fusion.tools.back')}</button>}
    <FusionRequestQueue />
    {active !== 'aiChat' && <MediaBar />}
    <div className="fusion-pages">
      {pages.map((id) => <div key={id} className="fusion-page" hidden={id !== active}
        aria-hidden={id !== active}>{id==='toolbox'?<FusionToolsTab workspace={workspacePage==='chat'?'tools':workspacePage} onHome={()=>selectPeer('tools')}/>:renderActiveTab(id, fallback, true)}</div>)}
    </div>
  </section>;
}

