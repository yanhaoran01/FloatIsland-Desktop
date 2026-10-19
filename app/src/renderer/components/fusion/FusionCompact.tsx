/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/**
 * @file FusionCompact.tsx
 * @description Shared companion status for the capsule and hover overview.
 * @author 鸡哥
 */
import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import {useProductStore} from './productStore';
import { Square,AppWindow,MessageSquare,Grid2X2,Search,Settings } from 'lucide-react';
import {SidebarHeader,SidebarMenu,SidebarMenuButton} from '../../vendor/shadcn/Sidebar';
import {useEffect,useState,useRef} from 'react';
import './floatIsland.css';
import './floatDesign.css';
import useIslandStore from '../../store/slices';
import { FusionPet, usePetCompletion, type FusionPetMood } from './FusionPet';
import { useFusionActivity } from './fusionActivity';
import { useFusionPreferences } from './fusionPreferences';
import {prepareIslandTransition} from './islandTransition';
import {writeWorkspaceNavigation} from './workspaceNavigation';

/** Summarizes current activity without activating or resuming a session. */
export function FusionCompact({ overview = false }: { overview?: boolean }): JSX.Element {
  const { t } = useTranslation();
  useEffect(()=>{const timer=setTimeout(prepareIslandTransition,350);return()=>clearTimeout(timer);},[]);
  const press=useRef<{x:number;y:number}|null>(null);
  const [edge,setEdge]=useState<'top'|'bottom'|'left'|'right'>('top');
  useEffect(()=>{let active=true;void window.api.fusionDockGet().then(value=>{if(active)setEdge(value.config.edge);});const off=window.api.onFusionDock(value=>setEdge(value.config.edge));return()=>{active=false;off();};},[]);
  const { codex, dsh, echo, assistants } = useFusionActivity();
  const record=useProductStore(s=>s.record);
  const recording=record&&["starting","recording","paused","finishing"].includes(record.state);
  const muted = useFusionPreferences((s) => s.value.muted);
  const productJobs=useProductStore(s=>s.jobs);
  const pendingJobs=Object.values(productJobs).filter(job=>job.state==='waiting').length;
  const workingJobs=Object.values(productJobs).filter(job=>job.state==='running').length;
  const pending =pendingJobs+ (codex?.pendingRequests.length ?? 0) + (dsh?.pendingRequests.length ?? 0) + (echo?.pendingRequests?.length ?? 0)+(echo?.sessions.filter(item=>item.status==='WaitingApproval').length??0);
  const running = new Set<string>();
  for (const [id, value] of Object.entries(codex?.sessionStates || {})) if (value.working) running.add('codex:' + id);
  for (const [id, value] of Object.entries(dsh?.sessionStates || {})) if (value.working) running.add('dsh:' + id);
  for (const value of Object.values(assistants)) if (value.working) running.add(value.key);
  if (echo?.state === 'ready') for (const value of echo.sessions) if (['Running', 'Processing'].includes(value.status)) running.add(value.source + ':' + value.sessionId);
  const active = running.size+workingJobs;
  const failed=Boolean(codex?.error||dsh?.error)||echo?.state==='ready'&&echo.sessions.some(item=>item.status==='Error')||Object.values(codex?.sessionStates??{}).some(item=>item.error)||Object.values(dsh?.sessionStates??{}).some(item=>item.error);
  const completion=usePetCompletion(active>0,Boolean(failed)||pending>0,muted,'island-activity');
  const mood: FusionPetMood = pending > 0 ? 'waiting' : active > 0 ? 'working' : failed ? 'error' : completion.finished ? 'finished' : 'idle';
  const latest = echo?.sessions[0];
  const summary = codex?.pendingRequests[0]?.command || dsh?.pendingRequests[0]?.description ||
    echo?.pendingRequests?.[0]?.text || codex?.error || dsh?.error || latest?.currentTool || latest?.lastAssistantMessage || latest?.lastUserPrompt || t('fusion.compact.open');
  const open=(view:'chat'|'tools'|'search'|'settings'):void=>{
    if(view==='chat'||view==='tools')writeWorkspaceNavigation({islandPage:view==='tools'?'tools':'chat'});
    useProductStore.getState().set({target:'',searchOpen:view==='search',dropOpen:false});
    useIslandStore.getState().setMaxExpandTab(view==='settings'?'settings':view==='tools'?'toolbox':'aiChat');
    useIslandStore.getState().setMaxExpand();
    if(view==='chat'||view==='tools')window.dispatchEvent(new CustomEvent('fusion-navigate-peer',{detail:view==='chat'?'chat':'tools'}));
  };
  if(edge!=='top'&&edge!=='bottom')return <div className="fusion-compact float-side-dock" data-side={edge}>
    <SidebarHeader><FusionPet mood={mood} muted={muted} label={t('fusion.pet.'+mood)}/></SidebarHeader>
    <SidebarMenu>{([{id:'chat',icon:MessageSquare,key:'fusion.navigation.aiChat'},{id:'tools',icon:Grid2X2,key:'fusion.navigation.toolbox'},{id:'search',icon:Search,key:'fusion.product.search'},{id:'settings',icon:Settings,key:'fusion.navigation.settings'}] as const).map(item=><li key={item.id}><SidebarMenuButton title={t(item.key)} aria-label={t(item.key)} onClick={event=>{event.stopPropagation();open(item.id);}}><item.icon size={20} strokeWidth={1.6}/></SidebarMenuButton></li>)}</SidebarMenu>
    {recording?<div className="float-side-record"><button type="button" className="fusion-icon-button" aria-label={t('fusion.product.record.stop')} onClick={event=>{event.stopPropagation();void window.api.fusionProductRecordControl('stop').then(value=>useProductStore.getState().set({record:value}));}}><span>{Math.floor(record.elapsed/60).toString().padStart(2,'0')+':'+Math.floor(record.elapsed%60).toString().padStart(2,'0')}</span><Square size={10}/></button></div>:<span className="float-side-state" data-active={pending>0||active>0}/>}
  </div>;
  return <div className={'fusion-compact' + (overview ? ' fusion-compact--overview' : '')} data-mood={recording ? 'working' : mood} role="button" tabIndex={0} aria-label={t('fusion.compact.open')} onPointerDown={event=>{press.current={x:event.clientX,y:event.clientY};}} onPointerCancel={()=>{press.current=null;}} onClick={event=>{const origin=press.current;press.current=null;if((event.target as Element).closest('button')||document.documentElement.dataset.floatGesture||!origin||Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>=6)return;useIslandStore.getState().setMaxExpand();}} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();useIslandStore.getState().setMaxExpand();}}}>
    <FusionPet mood={mood} muted={muted} label={t('fusion.pet.' + mood)} />
    <div className="fusion-compact-copy"><strong>{recording?Math.floor(record.elapsed/60).toString().padStart(2,'0')+':'+Math.floor(record.elapsed%60).toString().padStart(2,'0'):pending ? t('fusion.compact.pending', { count: pending }) : active ? t('fusion.compact.active', { count: active }) : failed ? t('fusion.pet.error') : completion.finished ? t('fusion.pet.finished') : t('fusion.compact.idle')}</strong>
      {overview && <p title={summary}>{summary}</p>}
    </div>
    {recording&&<button type="button" className="fusion-icon-button" aria-label={t("fusion.product.record.stop")} onClick={event=>{event.stopPropagation();void window.api.fusionProductRecordControl("stop").then(value=>useProductStore.getState().set({record:value}));}}><Square size={13}/></button>}
    <button type="button" className="fusion-compact-open" aria-label={t('fusion.ui.expand')} title={t('fusion.ui.expand')}
      onClick={event => { event.stopPropagation(); useIslandStore.getState().setMaxExpand(); }}><AppWindow size={16} strokeWidth={1.8} /></button>
  </div>;
}
