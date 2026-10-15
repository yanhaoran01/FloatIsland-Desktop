/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file avatarConfiguration.ts @description Shared character configuration with validated main-process persistence. @author 鸡哥 */
import { create } from 'zustand';
import { DEFAULT_AVATAR,normalizeAvatar,type AvatarConfig } from '../../../shared/avatarConfig';
interface State { value:AvatarConfig; ready:boolean; save:(value:AvatarConfig)=>Promise<void>; }
let writes=Promise.resolve();
export const useAvatarConfiguration=create<State>(set=>({value:DEFAULT_AVATAR,ready:false,save:value=>{
  const job=writes.then(async()=>{const effective=await window.api.fusionAvatarSave(value);set({value:effective,ready:true});});
  writes=job.catch(()=>{});return job;
}}));
let started=false;
/** Loads once and subscribes before reading, so both native windows stay consistent. */
export function initializeAvatarConfiguration():void {
  if(started)return;started=true;
  window.api.onFusionAvatar(value=>useAvatarConfiguration.setState({value:normalizeAvatar(value),ready:true}));
  void window.api.fusionAvatarGet().then(value=>useAvatarConfiguration.setState({value:normalizeAvatar(value),ready:true})).catch(()=>useAvatarConfiguration.setState({ready:true}));
}
