/* FloatIsland contributors. GPL-3.0. */
/** @file EncodingWorkbench.tsx @description Worker-backed JSON and binary Base64 processing with shared artifacts. @author 鸡哥 */
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useProductFiles,openProductTool} from '../productStore';
import {useToolJob} from './toolHooks';
import {ToolBody,ToolCommands,ToolEditors,ToolResult} from './ToolControls';
import type {DataResult} from './dataOperations';
import {downloadToolFile} from './toolHelpers';

export function JsonWorkbench(){
 const {t}=useTranslation(),[text,setText]=useState(''),[path,setPath]=useState('$.items[*].name'),[error,setError]=useState(''),job=useToolJob();
 useProductFiles('encodingService-json',files=>{if(files[0])void files[0].text().then(setText).catch(reason=>setError(String(reason)));});
 const result=job.result&&typeof job.result==='object'&&'text'in job.result?job.result as DataResult:undefined;
 return <ToolBody busy={job.busy} cancel={job.cancel} error={error||job.error}><ToolCommands>{(['format','minify','stringify'] as const).map(mode=><button key={mode} disabled={job.busy||!text} onClick={()=>job.run({kind:'json',mode,text,path})}>{t('fusion.enhance.data.'+mode)}</button>)}</ToolCommands><ToolEditors resultRevision={job.result} input={<><textarea aria-label="JSON" placeholder={'{ "items": [{ "name": "FloatIsland" }] }'} value={text} onChange={event=>setText(event.target.value)}/><label>{t('fusion.enhance.data.path')}<input value={path} onChange={event=>setPath(event.target.value)}/></label><button disabled={job.busy||!text} onClick={()=>job.run({kind:'json',mode:'query',text,path})}>{t('fusion.enhance.data.query')}</button><small>{t('fusion.enhance.data.pathHint')}</small></>} result={result?<ToolResult text={result.text} filename="result.json"/>:undefined}/></ToolBody>;
}
export function Base64Workbench(){
 const {t}=useTranslation(),[text,setText]=useState(''),[file,setFile]=useState<File|null>(null),[error,setError]=useState(''),job=useToolJob();
 useProductFiles('encodingService-base64',files=>{setFile(files[0]||null);setError('');});
 const bytes=job.result instanceof Uint8Array?job.result:undefined;let decoded='';if(bytes)try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{}
 const run=async(action:'encode'|'decode')=>{setError('');try{if(file&&file.size>10_000_000)throw Error('file-too-large');job.run({kind:'base64',action,text,bytes:action==='encode'&&file?new Uint8Array(await file.arrayBuffer()):undefined});}catch(reason){setError(String(reason));}};
 return <ToolBody busy={job.busy} error={error||job.error} cancel={job.cancel}><ToolCommands><button disabled={job.busy||!file&&!text} onClick={()=>void run('encode')}>{t('fusion.utilities.encode')}</button><button disabled={job.busy||!text} onClick={()=>void run('decode')}>{t('fusion.utilities.decode')}</button></ToolCommands><ToolEditors resultRevision={job.result} input={<>{file&&<div className="fusion-tool-row"><span>{file.name} · {file.size.toLocaleString()} B</span><button onClick={()=>setFile(null)}>{t('fusion.toolbox.remove')}</button></div>}<textarea aria-label="Base64" placeholder={t('fusion.enhance.data.base64Hint')} value={text} onChange={event=>{setText(event.target.value);setFile(null);}}/></>} result={typeof job.result==='string'?<ToolResult text={job.result} filename="encoded.txt"/>:bytes?<><p>{t('fusion.enhance.data.decodedBytes',{count:bytes.length})}</p><button onClick={()=>downloadToolFile('decoded.bin',bytes.slice().buffer,'application/octet-stream')}>{t('fusion.toolbox.export')}</button><button onClick={()=>void window.api.fusionProductCreate(bytes,'decoded.bin').then(artifact=>openProductTool('preview',[artifact])).catch(reason=>setError(String(reason)))}>{t('fusion.product.tabs.preview')}</button>{decoded&&<ToolResult text={decoded} filename="decoded.txt"/>}</>:undefined}/></ToolBody>;
}
