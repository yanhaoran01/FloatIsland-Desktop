/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file DataTools.tsx @description Cancellable local CSV conversion and regular expression testing. @author 鸡哥 */
import { useState,type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import {useProductFiles} from '../productStore';
import { ToolBody,ToolResult,ToolCommands,ToolEditors } from './ToolControls';
import { useToolJob } from './toolHooks';
import type { DataResult } from './dataOperations';
/** Displays a bounded text-only preview; cells never become HTML. */
export function DataPreview({rows}:{rows:string[][]}):JSX.Element {
 return <div className="fusion-data-preview"><table><tbody>{rows.slice(0,101).map((row,index)=><tr key={index}>{row.map((cell,column)=><td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
/** Converts quoted CSV while keeping identifier columns as strings. */
export function CsvTool():JSX.Element {
 const {t}=useTranslation(),[text,setText]=useState(''),[mode,setMode]=useState<'csv-json'|'json-csv'>('csv-json'),[delimiter,setDelimiter]=useState(''),[encoding,setEncoding]=useState('utf-8'),[error,setError]=useState('');
 useProductFiles('csv',files=>{if(files[0])void files[0].arrayBuffer().then(bytes=>setText(new TextDecoder(encoding,{fatal:true}).decode(bytes))).catch(()=>setError('invalid-encoding'));});
 const job=useToolJob(),result=job.result&&typeof job.result==='object'&&'rows' in job.result?job.result as DataResult:null;
 return <ToolBody error={error||job.error} busy={job.busy} cancel={job.cancel}><div className="fusion-tool-columns"><select aria-label={t('fusion.utilities.mode')} value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="csv-json">CSV → JSON</option><option value="json-csv">JSON → CSV</option></select>
 <select aria-label={t('fusion.utilities.delimiter')} value={delimiter} onChange={e=>setDelimiter(e.target.value)}><option value="">{t('fusion.utilities.automatic')}</option><option value=",">{t('fusion.utilities.comma')}</option><option value=";">{t('fusion.utilities.semicolon')}</option><option value="\t">Tab</option></select></div>
 <div className="fusion-tool-actions"><select aria-label={t('fusion.utilities.encoding')} value={encoding} onChange={e=>setEncoding(e.target.value)}><option value="utf-8">UTF-8</option><option value="gb18030">GB18030</option></select><label className="fusion-file-button">{t('fusion.utilities.import')}<input type="file" accept=".csv,.json,.txt,.tsv" onChange={e=>{const file=e.target.files?.[0];if(!file)return;setError('');if(file.size>10_000_000){setError('text-too-large');return;}void file.arrayBuffer().then(bytes=>setText(new TextDecoder(encoding,{fatal:true}).decode(bytes))).catch(()=>setError('invalid-encoding'));e.target.value='';}}/></label></div>
 <ToolEditors resultRevision={job.result} input={<textarea aria-label={t('fusion.utilities.source')} value={text} onChange={e=>setText(e.target.value)}/>} result={result?<><DataPreview rows={result.rows}/><ToolResult text={result.text} filename={mode==='csv-json'?'table.json':'table.csv'}/></>:undefined}/>
 <ToolCommands><button disabled={job.busy} onClick={()=>job.run({kind:'csv',mode,text,delimiter})}>{t('fusion.utilities.convert')}</button></ToolCommands>
</ToolBody>;
}
/** Performs expression evaluation and replacement only in a disposable worker. */
export function RegexTool():JSX.Element {
 const {t}=useTranslation(),[pattern,setPattern]=useState(''),[flags,setFlags]=useState('g'),[text,setText]=useState(''),[replacement,setReplacement]=useState(''),[inputError,setInputError]=useState('');
 useProductFiles('text',files=>{if(files[0])void files[0].text().then(setText).catch(reason=>setInputError(String(reason)));},'regex');
 const job=useToolJob(),result=job.result&&typeof job.result==='object'&&'rows' in job.result?job.result as DataResult:null;
 const [tested,setTested]=useState('');
 const highlights:React.ReactNode[]=[];let offset=0;if(result){for(const row of result.rows){const start=Number(row[0]),match=row[1]||'';if(!Number.isSafeInteger(start)||start<offset||start+match.length>tested.length)continue;highlights.push(tested.slice(offset,start),<mark key={start+'-'+highlights.length}>{match||'▏'}</mark>);offset=start+match.length;}highlights.push(tested.slice(offset));}
 return <ToolBody busy={job.busy} error={inputError||job.error} cancel={job.cancel}><div className="fusion-tool-columns"><label>{t('fusion.utilities.pattern')}<input value={pattern} onChange={e=>setPattern(e.target.value)}/></label><label>{t('fusion.utilities.flags')}<input value={flags} onChange={e=>setFlags(e.target.value)}/></label></div><ToolEditors resultRevision={job.result} input={<textarea aria-label={t('fusion.utilities.testText')} value={text} onChange={e=>setText(e.target.value)}/>} result={result?<><pre className="float-regex-highlight">{highlights}</pre><output>{t('fusion.utilities.matchCount',{count:result.rows.length})}</output><details className="fusion-inline-options"><summary>{t('fusion.utilities.preview')}</summary><DataPreview rows={[[t('fusion.utilities.position'),t('fusion.utilities.match'),t('fusion.utilities.groups')],...result.rows]}/></details><ToolResult text={result.text}/></>:undefined}/><label>{t('fusion.utilities.replacement')}<input value={replacement} onChange={e=>setReplacement(e.target.value)}/></label>
 <ToolCommands><button disabled={job.busy} onClick={()=>{setTested(text);job.run({kind:'regex',pattern,flags,text,replacement});}}>{t('fusion.utilities.test')}</button></ToolCommands>
</ToolBody>;
}
