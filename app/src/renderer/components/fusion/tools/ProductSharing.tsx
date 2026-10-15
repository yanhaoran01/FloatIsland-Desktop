/* FusionIsland - GPL-3.0. @file ProductSharing.tsx @description Visible-page LocalSend transfers and explicit receive confirmation. @author 鸡哥 */
import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Radar,FilePlus2,Monitor} from 'lucide-react';
import type {ShareState,SharePeer} from '../../../../preload/types/fusionProduct';
import {useProductStore,openProductTool} from '../productStore';
import {ToolBody} from './ToolControls';
/** Uses a visibility lease; hidden and collapsed pages cannot receive transfers. */
export function ProductSharing(){
 const {t}=useTranslation(),store=useProductStore(),root=useRef<HTMLDivElement>(null),[state,setState]=useState<ShareState>({active:false,port:0,peers:[],requests:[],jobs:[]}),[address,setAddress]=useState(''),[text,setText]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const stopEvent=window.api.onFusionProductShare(setState);let timer:ReturnType<typeof setInterval>|undefined,visible=false;
  const update=(active:boolean):void=>{if(active===visible)return;visible=active;if(timer)clearInterval(timer);if(active){void window.api.fusionProductShare('start').then(setState).catch(reason=>setError(String(reason)));timer=setInterval(()=>{void window.api.fusionProductShare('start').then(setState).catch(reason=>setError(String(reason)));},1000);}else void window.api.fusionProductShare('stop').then(setState).catch(reason=>setError(String(reason)));};
  const observer=new IntersectionObserver(entries=>update(!document.hidden&&entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>0)));if(root.current)observer.observe(root.current);const hide=():void=>{update(!document.hidden&&Boolean(root.current?.getBoundingClientRect().width));};document.addEventListener('visibilitychange',hide);
  return()=>{observer.disconnect();stopEvent();if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',hide);void window.api.fusionProductShare('stop').catch(()=>undefined);};
 },[]);
 const send=async(peer:SharePeer):Promise<void>=>{try{setError('');const inputs=text.trim()?[await window.api.fusionProductText(text)]:store.inputs;if(!inputs.length)throw Error('empty-input');const job=await window.api.fusionProductShareSend(peer,inputs.map(x=>x.id));store.job(job);}catch(reason){setError(String(reason));}};
 const jobs=Object.values(store.jobs).filter(job=>job.kind==='share');
 return <div ref={root} className="float-sharing"><ToolBody error={error||state.error||''}>
  <div className="fusion-tool-row float-sharing-toolbar"><input aria-label={t('fusion.product.share.address')} placeholder={t('fusion.product.share.address')} value={address} onChange={event=>setAddress(event.target.value)}/><button disabled={!state.active} onClick={()=>void window.api.fusionProductShare('discover',address).then(setState).catch(reason=>setError(String(reason)))}><Radar size={15}/>{t('fusion.product.share.discover')}</button><span className="fusion-product-status">{state.active?t('fusion.product.share.active',{port:state.port}):t('fusion.product.share.stopped')}</span></div>
  <div className="fusion-tool-actions"><button onClick={()=>void window.api.fusionProductPick().then(inputs=>store.set({inputs})).catch(reason=>setError(String(reason)))}><FilePlus2 size={15}/>{t('fusion.toolbox.chooseFiles')}</button><span className="fusion-product-status">{store.inputs.length?t('fusion.product.share.files',{count:store.inputs.length}):''}</span></div>
  <textarea aria-label={t('fusion.product.share.text')} placeholder={t('fusion.product.share.text')} value={text} onChange={event=>setText(event.target.value)}/>
  <div className="float-sharing-peers">{state.peers.map(peer=><button disabled={!state.active||!store.inputs.length&&!text.trim()} key={peer.fingerprint} onClick={()=>void send(peer)}><Monitor size={18}/><span>{peer.alias}</span></button>)}</div>
  {state.requests.map(request=><div key={request.id} className="fusion-product-text"><div>{request.alias} · {t('fusion.product.share.files',{count:request.files.length})} · {(request.files.reduce((s,f)=>s+f.size,0)/1048576).toFixed(2)} MB</div>{request.files.map(file=><div key={file.id}>{file.name}</div>)}<div className="fusion-tool-actions"><button onClick={()=>void window.api.fusionProductShareReply(request.id,true).then(setState).catch(reason=>setError(String(reason)))}>{t('fusion.product.share.accept')}</button><button onClick={()=>void window.api.fusionProductShareReply(request.id,false).then(setState).catch(reason=>setError(String(reason)))}>{t('fusion.product.share.reject')}</button></div></div>)}
  {jobs.map(job=><div key={job.id}><progress max={1} value={job.progress}/>{job.state==='running'&&<button onClick={()=>void window.api.fusionProductJob(job.id,'cancel').catch(reason=>setError(String(reason)))}>{t('fusion.toolbox.cancel')}</button>}{job.error&&<p role="alert">{job.error}</p>}{job.result.map(item=><button key={item.id} onClick={()=>openProductTool('preview',[item])}>{t('fusion.toolbox.items.preview')}</button>)}</div>)}
 </ToolBody></div>;
}
