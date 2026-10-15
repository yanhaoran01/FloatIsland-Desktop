/* FusionIsland - GPL-3.0. @file ProductRecorder.tsx @description Demonstration recording and finite offline export. @author 鸡哥 */
import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {RecordOptions} from '../../../../preload/types/fusionProduct';
import {useProductStore,openProductTool} from '../productStore';
import {ProductPreview} from './ProductPreview';
import {ToolBody} from './ToolControls';
/** Controls a native-owned recorder which survives page changes. */
export function ProductRecorder(){
 const {t}=useTranslation(),store=useProductStore(),[options,setOptions]=useState<RecordOptions>({mode:'screen',systemAudio:false,microphone:false,camera:false,focus:false,keys:false}),[sources,setSources]=useState<Array<{id:string;name:string}>>([]),[error,setError]=useState(''),[format,setFormat]=useState<'mp4'|'webm'|'gif'>('mp4'),[start,setStart]=useState(0),[end,setEnd]=useState(0),[jobId,setJobId]=useState('');
 const record=store.record,active=record&&['starting','recording','paused','finishing'].includes(record.state),job=store.jobs[jobId];
 useEffect(()=>{void window.api.fusionProductRecordSources().then(setSources).catch(reason=>setError(String(reason)));},[]);
 const command=async(value:'pause'|'resume'|'stop'|'cancel'):Promise<void>=>{try{const state=await window.api.fusionProductRecordControl(value);store.set({record:state});}catch(reason){setError(String(reason));}};
 const run=async():Promise<void>=>{try{setError('');const state=await window.api.fusionProductRecordStart(options);store.set({record:state});}catch(reason){setError(String(reason));}};
 return <ToolBody busy={job?.state==='running'} cancel={()=>{void window.api.fusionProductJob(jobId,'cancel');}} error={error||record?.error||job?.error||''}>
  <div className="fusion-tool-row"><select disabled={Boolean(active)} aria-label={t('fusion.product.record.mode')} value={options.mode} onChange={event=>setOptions({...options,mode:event.target.value as RecordOptions['mode'],sourceId:undefined})}>{(['screen','window','region'] as const).map(mode=><option key={mode} value={mode}>{t('fusion.product.capture.'+mode)}</option>)}</select>
   {options.mode!=='region'&&<select className="fusion-product-source" disabled={Boolean(active)} aria-label={t('fusion.product.record.source')} value={options.sourceId??''} onChange={event=>setOptions({...options,sourceId:event.target.value||undefined})}><option value="">{t('fusion.product.record.selectSource')}</option>{sources.filter(source=>source.id.startsWith(options.mode+':')).map(source=><option key={source.id} value={source.id}>{source.name}</option>)}</select>}
  </div>
  <div className="fusion-product-options">{(['systemAudio','microphone','camera','focus','keys'] as const).map(key=><label key={key}><input type="checkbox" disabled={Boolean(active)} checked={options[key]} onChange={event=>setOptions({...options,[key]:event.target.checked})}/>{t('fusion.product.record.'+key)}</label>)}</div>
  <div className="fusion-tool-actions">{!active?<button onClick={()=>void run()}>{t('fusion.product.record.start')}</button>:<><span className="fusion-product-status">{Math.floor(record.elapsed/60).toString().padStart(2,'0')}:{Math.floor(record.elapsed%60).toString().padStart(2,'0')}</span>{record.state==='recording'&&<button onClick={()=>void command('pause')}>{t('fusion.product.record.pause')}</button>}{record.state==='paused'&&<button onClick={()=>void command('resume')}>{t('fusion.product.record.resume')}</button>}<button disabled={!['recording','paused'].includes(record.state)} onClick={()=>void command('stop')}>{t('fusion.product.record.stop')}</button><button onClick={()=>void command('cancel')}>{t('fusion.toolbox.cancel')}</button></>}</div>
  {record?.artifact&&<><button onClick={()=>{if(record.artifact)void window.api.fusionProductPlay(record.artifact.id).then(()=>openProductTool('video')).catch(reason=>setError(String(reason)));}}>{t('fusion.product.player')}</button>
   <div className="fusion-tool-row"><select aria-label={t('fusion.product.record.format')} value={format} onChange={event=>setFormat(event.target.value as typeof format)}><option>mp4</option><option>webm</option><option>gif</option></select>{[start,end].map((value,index)=><input key={index} type="number" min={0} aria-label={t(index?'fusion.product.record.end':'fusion.product.record.begin')} value={value} onChange={event=>(index?setEnd:setStart)(Number(event.target.value))}/>)}<button disabled={job?.state==='running'} onClick={()=>{if(record.artifact)void window.api.fusionProductRecordExport(record.artifact.id,format,start,end).then(value=>{store.job(value);setJobId(value.id);}).catch(reason=>setError(String(reason)));}}>{t('fusion.product.export')}</button></div>{format==='gif'&&<p className="fusion-product-status">{t('fusion.product.record.gifSilent')}</p>}
  </>}
  {job?.state==='done'&&job.result.map(item=><ProductPreview artifact={item} key={item.id}/>)}
 </ToolBody>;
}
