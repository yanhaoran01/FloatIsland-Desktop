/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file productStore.ts @description Shared drop inputs, navigation and monotonic task snapshots. @author 鸡哥 */
import { create } from 'zustand';
import { useEffect } from 'react';
import type { ProductArtifact,ProductJob,ProductData,RecordState } from '../../../preload/types/fusionProduct';
import {resolveToolTarget,TOOL_FUNCTIONS} from './tools/toolRegistry';
import useIslandStore from '../../store/slices';
import {readWorkspaceNavigation,writeWorkspaceNavigation} from './workspaceNavigation';
interface ProductState {query:string;searchSelection:string;navigationOrigin:'category'|'search';inputs:ProductArtifact[];target:string;tab:string;nonce:number;dropOpen:boolean;searchOpen:boolean;jobs:Record<string,ProductJob>;data:ProductData|null;record:RecordState|null;set:(patch:Partial<ProductState>)=>void;job:(job:ProductJob)=>void;}
const restored=readWorkspaceNavigation();
export const useProductStore=create<ProductState>(set=>({query:restored.query,searchSelection:restored.searchSelection,navigationOrigin:'category',inputs:[],target:restored.target,tab:restored.tab,nonce:0,dropOpen:false,searchOpen:false,jobs:{},data:null,record:null,
 set:patch=>set(old=>({...patch,...(patch.nonce===undefined?{}:{nonce:Math.max(old.nonce+1,patch.nonce)})})),job:job=>set(old=>{const previous=old.jobs[job.id];if(previous&&['done','error','cancelled'].includes(previous.state)&&['running','waiting'].includes(job.state))return old;return {jobs:{...old.jobs,[job.id]:job}};}),
}));
useProductStore.subscribe(state=>writeWorkspaceNavigation({target:state.target,tab:state.tab,query:state.query,searchSelection:state.searchSelection}));
/** Opens an existing canonical tool with shared inputs. @param id - Canonical or legacy id. @param inputs - Input artifacts. @param tab - Subfunction. @returns No value. */
export function openProductTool(id:string,inputs:ProductArtifact[]=useProductStore.getState().inputs,tab=''):void {
 if(id==='preview'&&inputs[0]){const kind=inputs[0].kind;if(kind==='image'){id='image';tab='preview';}else if(kind==='pdf'){id='pdf';tab='preview';}else if(kind==='media'){id='video';tab='play';}}
 const route=resolveToolTarget(id);id=route.id;tab=tab||route.tab;
 useProductStore.getState().set({inputs,target:id,tab,nonce:Date.now(),navigationOrigin:useProductStore.getState().searchOpen?'search':'category',dropOpen:false,searchOpen:false});
 useIslandStore.getState().setMaxExpand();if(document.querySelector('.fusion-workbench'))useIslandStore.getState().setMaxExpandTab('toolbox');
 window.dispatchEvent(new CustomEvent('fusion-open-tool',{detail:id}));
}
/** Delivers artifact bytes to existing canvas/worker tools. @param target - Canonical tool. @param apply - Existing input handler. @returns No value. */
export function useProductFiles(target:string,apply:(files:File[])=>void,tab?:string):void {
 const nonce=useProductStore(s=>s.nonce);
 useEffect(()=>{let alive=true;const state=useProductStore.getState(),route=resolveToolTarget(target);if(state.target!==route.id||(tab||route.tab)&&(tab||route.tab)!==(state.tab||TOOL_FUNCTIONS[state.target]?.[0]?.id)||!state.inputs.length)return;
  void Promise.all(state.inputs.map(async item=>{const result=await window.api.fusionProductRead(item.id);return new File([new Uint8Array(result.bytes).buffer],item.name,{type:item.mime});})).then(files=>{if(alive)apply(files);}).catch(error=>{if(alive)window.dispatchEvent(new CustomEvent('float-tool-input-error',{detail:{target:route.id,error:String(error)}}));});
  return ()=>{alive=false;};
 },[nonce,target,tab]);
}
