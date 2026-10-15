/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file AvatarSettings.tsx @description Complete offline shape, expression and action catalogue. @author 鸡哥 */
import { useState,type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw,Square } from 'lucide-react';
import { AVATAR_SHAPES,AVATAR_EXPRESSIONS,AVATAR_COLORS,DEFAULT_AVATAR } from '../../../shared/avatarConfig';
import { COLORS } from '../../vendor/bloub/skins';
import { STATES,type StateId } from '../../vendor/bloub/states';
import { BloubAvatar } from './BloubAvatar';
import { useAvatarConfiguration } from './avatarConfiguration';
/** Saves choices through validated IPC; only the selected preview animates. */
export function AvatarSettings():JSX.Element {
  const {t}=useTranslation(),config=useAvatarConfiguration(s=>s.value),save=useAvatarConfiguration(s=>s.save);
  const [tab,setTab]=useState<'shape'|'expression'|'color'|'action'>('shape'),[preview,setPreview]=useState<StateId>(),[nonce,setNonce]=useState(0),[error,setError]=useState('');
  const update=(value:typeof config):void=>{setError('');setPreview(undefined);void save(value).catch(()=>setError(t('fusion.settings.saveError')));};
  // The catalogue is an explicit preview, independent of the live conversation actor.
  // Unrelated background sessions must not turn its controls into silent no-ops.
  const ids=tab==='shape'?AVATAR_SHAPES:tab==='expression'?AVATAR_EXPRESSIONS:tab==='color'?AVATAR_COLORS:STATES.map(item=>item.id);
  return <section className="fusion-avatar-settings">
    <div className="fusion-avatar-preview"><BloubAvatar mood="idle" label={t('fusion.avatar.preview')} state={preview} actionToken={nonce}/>
      <div><button className="fusion-icon-button" title={t('fusion.avatar.stop')} aria-label={t('fusion.avatar.stop')} onClick={()=>{setPreview(undefined);setNonce(n=>n+1);}}><Square size={15}/></button>
      <button className="fusion-icon-button" title={t('fusion.avatar.reset')} aria-label={t('fusion.avatar.reset')} onClick={()=>update(DEFAULT_AVATAR)}><RotateCcw size={15}/></button></div>
    </div>
    <div className="fusion-avatar-tabs" role="tablist">{(['shape','expression','color','action'] as const).map(id=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{t('fusion.avatar.'+id)}</button>)}</div>
    <div className="fusion-avatar-options">{ids.map(id=>{
      const selected=tab==='shape'?config.shape===id:tab==='expression'?config.expression===id:tab==='color'?config.color===id:preview===id;
      const choose=():void=>{if(tab==='shape'&&AVATAR_SHAPES.some(shape=>shape===id))update({...config,shape:id as typeof config.shape});else if(tab==='expression'&&AVATAR_EXPRESSIONS.some(expression=>expression===id))update({...config,expression:id as typeof config.expression});else if(tab==='color'){const color=AVATAR_COLORS.find(value=>value===id);if(color)update({...config,color});}else if(tab==='action'){setPreview(id as StateId);setNonce(n=>n+1);}};
      return <div className="fusion-avatar-option" key={tab+id} role="button" tabIndex={0} aria-pressed={selected} aria-label={t('fusion.avatar.'+tab+'s.'+id)} onClick={choose} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}}}>
        <div className="fusion-avatar-thumb" aria-hidden="true" style={tab==='color'?{background:COLORS.find(color=>color.id===id)?.hex}:undefined}><BloubAvatar color={tab==='color'?AVATAR_COLORS.find(color=>color===id):undefined} frozen disabled mood="idle" label="" shape={tab==='shape'?id as typeof config.shape:undefined} expression={tab==='expression'?id as typeof config.expression:undefined} state={tab==='action'?id as StateId:'idle'}/></div>
        <span>{t('fusion.avatar.'+tab+'s.'+id)}</span></div>;
    })}</div>
    {error&&<p role="alert">{error}</p>}
  </section>;
}
