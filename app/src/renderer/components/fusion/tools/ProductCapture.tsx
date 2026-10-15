/* FusionIsland - GPL-3.0. @file ProductCapture.tsx @description Screenshot input, preview and OCR results in one workspace. @author 鸡哥 */
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Camera,ImagePlus,ScanText,Save,Pin,Image,SquareDashed,Monitor,ScrollText} from 'lucide-react';
import {useProductStore,openProductTool} from '../productStore';
import {ProductPreview} from './ProductPreview';
import {ToolBody} from './ToolControls';
/** Retains the original native capture and artifact services, with explicit result actions. */
export function ProductCapture() {
 const {t}=useTranslation(),store=useProductStore(),[id,setId]=useState(''),[error,setError]=useState(''),[selecting,setSelecting]=useState(false),[cancelled,setCancelled]=useState(false);
 const job=store.jobs[id],busy=selecting||job?.state==='running'||job?.state==='waiting';
 const perform=async(command:'region'|'screen'|'scroll'):Promise<void>=>{try{setError('');setCancelled(false);setId('');setSelecting(true);if(command==='scroll'){const task=await window.api.fusionProductScroll('start');store.job(task);setId(task.id);}else{const item=await window.api.fusionProductCapture({mode:command});store.set({inputs:[item]});}}catch(reason){if(String(reason).includes('capture-cancelled'))setCancelled(true);else setError(String(reason));}finally{setSelecting(false);}};
 const source=(job?.state==='done'?job.result.find(item=>item.kind==='image'):undefined)||store.inputs.find(item=>item.kind==='image');
 const run=(action:()=>Promise<unknown>):void=>{setError('');void action().catch(reason=>setError(String(reason)));};
 const pick=():void=>run(async()=>{const inputs=await window.api.fusionProductPick();if(inputs.length){store.set({inputs});setCancelled(false);setId('');}});
 const recognize=():void=>{if(source)run(async()=>{const value=await window.api.fusionProductRun('ocr',[source.id],{});store.job(value);setId(value.id);});};
 return <ToolBody className="float-capture-workspace" busy={busy} error={error||job?.error||''} cancel={()=>{if(job?.kind==='scroll')run(()=>window.api.fusionProductScroll('cancel'));else if(id)run(()=>window.api.fusionProductJob(id,'cancel'));}}>
  <div className="float-capture-inputs fusion-tool-actions">
   <button className="float-primary-action" disabled={busy} onClick={()=>void perform('region')}><SquareDashed size={16}/>{t('fusion.product.capture.region')}</button>
   <button disabled={busy} onClick={()=>void perform('screen')}><Monitor size={16}/>{t('fusion.product.capture.screen')}</button>
   <button disabled={busy} onClick={pick}><ImagePlus size={16}/>{t('fusion.ui.importImage')}</button>
   <button disabled={busy} onClick={()=>void perform('scroll')}><ScrollText size={16}/>{t('fusion.product.capture.scroll')}</button>
  </div>
  {cancelled&&<p className="float-capture-notice" role="status">{t('fusion.ui.captureCancelled')}</p>}
  {job?.state==='running'&&job.kind==='scroll'&&<div className="fusion-tool-actions"><button onClick={()=>run(()=>window.api.fusionProductScroll('frame'))}>{t('fusion.product.capture.frame')}</button><button onClick={()=>run(()=>window.api.fusionProductScroll('finish').then(store.job))}>{t('fusion.product.capture.finish')}</button></div>}
  <div className="float-capture-content">
   <section className="float-capture-preview">
    <header><strong>{t('fusion.ui.preview')}</strong>{source&&<small title={source.name}>{source.name}</small>}</header>
    {source?<ProductPreview artifact={source} showActions={false}/>:<div className="float-capture-empty"><Camera size={28} strokeWidth={1.3}/><strong>{t('fusion.ui.captureEmpty')}</strong><button onClick={pick}><ImagePlus size={16}/>{t('fusion.ui.importImage')}</button></div>}
    {source&&<div className="float-capture-result-actions fusion-tool-actions"><button disabled={busy} className="float-primary-action" onClick={recognize}><ScanText size={16}/>{t('fusion.product.action.ocr')}</button><button onClick={()=>run(()=>window.api.fusionProductSave(source.id))}><Save size={16}/>{t('fusion.product.save')}</button><button onClick={()=>run(()=>window.api.fusionProductPin(source.id))}><Pin size={16}/>{t('fusion.product.pin')}</button><button onClick={()=>openProductTool('image',[source])}><Image size={16}/>{t('fusion.toolbox.items.image')}</button></div>}
   </section>
   {job?.state==='done'&&job.result.filter(item=>item.kind==='text').map(item=><section className="float-capture-text" key={item.id}><header><strong>{t('fusion.product.action.ocr')}</strong></header><ProductPreview artifact={item} showActions={false}/></section>)}
  </div>
  <details className="float-capture-pin-settings"><summary>{t('fusion.ui.pinControls')}</summary><div className="fusion-tool-actions"><button onClick={()=>run(()=>window.api.fusionProductPins('unlock'))}>{t('fusion.product.pinUnlock')}</button><button onClick={()=>run(()=>window.api.fusionProductPins('close'))}>{t('fusion.product.pinClose')}</button></div></details>
 </ToolBody>;
}
