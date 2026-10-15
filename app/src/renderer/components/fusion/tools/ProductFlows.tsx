/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file ProductFlows.tsx @description Editable linear offline workflows with real confirmation and cancellation. @author 鸡哥 */
import { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp,ArrowDown,Plus,X } from 'lucide-react';
import { PRODUCT_ACTIONS,PRODUCT_PRESETS,PRODUCT_OPTION_DEFAULTS,validateProductFlow } from '../../../../shared/productActions';
import type { ProductAction,ProductFlow } from '../../../../preload/types/fusionProduct';
import { useProductStore } from '../productStore';
import { ProductPreview } from './ProductPreview';
import { ToolBody } from './ToolControls';
/** Provides templates, editing and finite task execution. @returns Workflow panel. */
export function ProductFlows() {
 const {t}=useTranslation(),store=useProductStore(),[flow,setFlow]=useState<ProductFlow|null>(null),[id,setId]=useState(''),[error,setError]=useState('');
 const job=store.jobs[id],busy=job?.state==='running'||job?.state==='waiting';
 useEffect(()=>{void window.api.fusionProductData().then(data=>{store.set({data});const selected=data.flows.find(item=>item.id===store.tab)??data.flows[0];if(selected)setFlow(structuredClone(selected));}).catch(reason=>setError(String(reason)));},[store.nonce]);
 const name=(item:ProductFlow):string=>item.name.startsWith('@')?t('fusion.product.preset.'+item.name.slice(1)):item.name;
 const edit=(index:number,patch:Partial<ProductFlow['steps'][number]>):void=>setFlow(old=>old?{...old,steps:old.steps.map((step,i)=>i===index?{...step,...patch}:step)}:old);
 const save=async():Promise<void>=>{if(!flow)return;validateProductFlow(flow);const data=await window.api.fusionProductData();const next=data.flows.some(x=>x.id===flow.id)?data.flows.map(x=>x.id===flow.id?flow:x):[...data.flows,flow];const written=await window.api.fusionProductWrite({...data,flows:next});store.set({data:written});};
 const run=async():Promise<void>=>{try{setError('');await save();if(!flow)return;const task=await window.api.fusionProductFlow(flow.id,store.inputs.map(x=>x.id));store.job(task);setId(task.id);}catch(reason){setError(String(reason));}};
 return <ToolBody busy={busy} error={error||job?.error||''} cancel={()=>{if(id)void window.api.fusionProductJob(id,'cancel').catch(reason=>setError(String(reason)));}}>
  <div className="fusion-tool-row"><select aria-label={t('fusion.product.flows')} value={flow?.id??''} onChange={event=>setFlow(structuredClone(store.data?.flows.find(x=>x.id===event.target.value)??null))}>{store.data?.flows.map(item=><option key={item.id} value={item.id}>{name(item)}</option>)}</select><button aria-label={t('fusion.product.new')} onClick={()=>setFlow({id:crypto.randomUUID(),name:t('fusion.product.newFlow'),steps:[{id:crypto.randomUUID(),action:'text-clean',options:{empty:true}}]})}><Plus size={16}/></button></div>
  {flow&&<><input aria-label={t('fusion.product.name')} value={name(flow)} onChange={event=>setFlow({...flow,name:event.target.value})}/>
   <div className="fusion-product-steps">{flow.steps.map((step,index)=><div key={step.id} className="fusion-product-step" data-active={job?.step===index&&busy}>
    <span>{index+1}</span><select aria-label={t('fusion.product.stepLabel')} value={step.action} onChange={event=>{const action=event.target.value as ProductAction;edit(index,{action,options:{...PRODUCT_OPTION_DEFAULTS[action]}});}}>{Object.keys(PRODUCT_ACTIONS).map(action=><option key={action} value={action}>{t('fusion.product.action.'+action)}</option>)}</select>
    <div className="fusion-product-options">{Object.entries({...PRODUCT_OPTION_DEFAULTS[step.action],...step.options}).map(([key,value])=><label key={key}>{t('fusion.product.options.'+key)}<input aria-label={t('fusion.product.options.'+key)} type={typeof value==='boolean'?'checkbox':typeof value==='number'?'number':'text'} checked={typeof value==='boolean'?value:undefined} value={typeof value==='boolean'?undefined:String(value)} onChange={event=>edit(index,{options:{...step.options,[key]:typeof value==='boolean'?event.target.checked:typeof value==='number'?Number(event.target.value):event.target.value}})}/></label>)}</div>
    {[[-1,ArrowUp],[1,ArrowDown]].map(([delta,Icon])=>{const direction=Number(delta),Element=Icon as typeof ArrowUp;return <button key={direction} disabled={index+direction<0||index+direction>=flow.steps.length} aria-label={t(direction<0?'fusion.toolbox.moveUp':'fusion.toolbox.moveDown')} onClick={()=>{const steps=[...flow.steps];[steps[index],steps[index+direction]]=[steps[index+direction],steps[index]];setFlow({...flow,steps});}}><Element size={14}/></button>;})}
    <button disabled={flow.steps.length===1} aria-label={t('fusion.toolbox.remove')} onClick={()=>setFlow({...flow,steps:flow.steps.filter(x=>x.id!==step.id)})}><X size={14}/></button>
   </div>)}</div>
   <div className="fusion-tool-actions"><button onClick={()=>setFlow({...flow,steps:[...flow.steps,{id:crypto.randomUUID(),action:'export',options:{}}]})}>{t('fusion.product.addStep')}</button><button onClick={()=>void save().catch(reason=>setError(String(reason)))}>{t('fusion.product.save')}</button><button onClick={()=>void window.api.fusionProductPick().then(inputs=>store.set({inputs}))}>{t('fusion.toolbox.chooseFiles')}</button><button onClick={()=>void window.api.fusionProductCapture({mode:'region'}).then(item=>store.set({inputs:[item]})).catch(reason=>setError(String(reason)))}>{t('fusion.toolbox.items.screenshot')}</button><button disabled={busy||!store.inputs.length} onClick={()=>void run()}>{t('fusion.toolbox.run')}</button></div>
  </>}
  <div className="fusion-tool-actions"><button disabled={busy} onClick={()=>{void window.api.fusionProductData().then(data=>window.api.fusionProductWrite({...data,flows:structuredClone(PRODUCT_PRESETS)})).then(data=>{store.set({data});setFlow(structuredClone(data.flows[0]));}).catch(reason=>setError(String(reason)));}}>{t('fusion.product.restore')}</button><button disabled={busy||!flow} onClick={()=>{void window.api.fusionProductData().then(data=>window.api.fusionProductWrite({...data,flows:data.flows.filter(item=>item.id!==flow?.id)})).then(data=>{store.set({data});setFlow(data.flows[0]??null);}).catch(reason=>setError(String(reason)));}}>{t('fusion.product.delete')}</button>{flow?.steps.some(step=>step.action==='rename')&&<button onClick={()=>void window.api.fusionRenameUndo().catch(reason=>setError(String(reason)))}>{t('fusion.utilities.undo')}</button>}</div>
  {job&&<progress value={job.progress} max={1}/>}
  {job?.preview&&<><div className="fusion-product-text">{job.preview.map(row=><div key={row.before}>{row.before} → {row.after}{row.error&&<span>{row.error}</span>}</div>)}</div><button disabled={job.preview.some(x=>x.error)||job.state!=='waiting'} onClick={()=>void window.api.fusionProductJob(job.id,'confirm').catch(reason=>setError(String(reason)))}>{t('fusion.product.execute')}</button></>}
  {job?.state==='done'&&job.result.map(item=><ProductPreview key={item.id} artifact={item}/>)}
 </ToolBody>;
}
