/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file DailyTools.tsx @description Offline stopwatch, unbiased random selection and URL tools. @author 鸡哥 */
import { useEffect,useState,type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { StopwatchState } from '../../../../preload/types/fusionFileTools';
import { ToolBody,ToolResult,ToolCommands,ToolEditors,useToolVisible } from './ToolControls';
import {MusicMenu} from './MusicMenu';
import './musicSources.css';
import {useProductFiles} from '../productStore';
import {useToolPreference} from './toolPreferences';
/** Uniform bounded integer using rejection sampling. */
export function randomBelow(bound:number):number {
 if(!Number.isSafeInteger(bound)||bound<1||bound>0x100000000)throw Error('invalid-number');
 const ceiling=Math.floor(0x100000000/bound)*bound;let value:number;
 do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=ceiling);
 return value%bound;
}
/** Samples distinct nonempty names without persisting results. */
export function drawNames(text:string,count:number):string[] {
 const names=[...new Set(text.split(/\r?\n/).map(name=>name.trim()).filter(Boolean))];
 if(!Number.isInteger(count)||count<1||count>names.length||names.length>10000)throw Error('invalid-number');
 for(let index=0;index<count;index++){const other=index+randomBelow(names.length-index);[names[index],names[other]]=[names[other],names[index]];}
 return names.slice(0,count);
}
/** Shares the main-owned stopwatch across pages and native windows. */
export function StopwatchTool():JSX.Element {
 const {t}=useTranslation(),[value,setValue]=useState<StopwatchState>({version:1,elapsedMs:0,startedAt:null,laps:[]}),[now,setNow]=useState(Date.now()),[error,setError]=useState('');
 const visible=useToolVisible();
 useEffect(()=>{let mounted=true;const update=(state:StopwatchState):void=>{if(mounted){setValue(state);setNow(Date.now());}};const off=window.api.onFusionStopwatch(update);void window.api.fusionStopwatchGet().then(update).catch(reason=>setError(String(reason)));return()=>{mounted=false;off();};},[]);
 useEffect(()=>{if(!visible||value.startedAt===null)return;setNow(Date.now());const tick=setInterval(()=>{if(!document.hidden)setNow(Date.now());},100);return()=>clearInterval(tick);},[visible,value.startedAt]);
 const format=(ms:number):string=>{const total=Math.floor(ms/10);return [Math.floor(total/360000),Math.floor(total/6000)%60,Math.floor(total/100)%60].map(n=>String(n).padStart(2,'0')).join(':')+'.'+String(total%100).padStart(2,'0');};
 const elapsed=value.elapsedMs+(value.startedAt===null?0:Math.max(0,now-value.startedAt));
 const command=(action:'start'|'pause'|'lap'|'reset'):void=>{setError('');void window.api.fusionStopwatchControl(action).then(setValue).catch(reason=>setError(String(reason)));};
 return <ToolBody error={error}><output className="fusion-stopwatch">{format(elapsed)}</output><ToolCommands>
 <button onClick={()=>command(value.startedAt===null?'start':'pause')}>{t('fusion.utilities.'+(value.startedAt===null?'start':'pause'))}</button>
 <button disabled={value.startedAt===null} onClick={()=>command('lap')}>{t('fusion.utilities.lap')}</button><button onClick={()=>command('reset')}>{t('fusion.utilities.reset')}</button></ToolCommands>
 {!!value.laps.length&&<ToolResult text={value.laps.map((lap,index)=>String(index+1)+'. '+format(lap)).join('\n')}/>}</ToolBody>;
}
/** Draws names or inclusive integers from local input only. */
export function RandomTool():JSX.Element {
 const {t}=useTranslation(),[mode,setMode]=useState('names'),[text,setText]=useState(''),[count,setCount]=useState(1),[minimum,setMinimum]=useState(1),[maximum,setMaximum]=useState(100),[result,setResult]=useState(''),[error,setError]=useState('');
 const [noRepeat,setNoRepeat]=useState(true),[drawn,setDrawn]=useState<string[]>([]),[history,setHistory]=useToolPreference<Array<{time:number;result:string}>>('random.history',[],(value):value is Array<{time:number;result:string}>=>Array.isArray(value)&&value.length<=30&&value.every(row=>row&&Number.isFinite(row.time)&&typeof row.result==='string'&&row.result.length<=50000));
 useProductFiles('random',files=>{if(files[0])void files[0].text().then(value=>{setText(value.slice(0,100000));setDrawn([]);}).catch(reason=>setError(String(reason)));});
 const run=():void=>{setError('');try{let selected:string[];if(!Number.isInteger(count)||count<1||count>10000)throw Error('invalid-number');if(mode==='names'){const available=noRepeat?text.split(/\r?\n/).filter(name=>!drawn.includes(name.trim())).join('\n'):text;selected=drawNames(available,count);}else{const width=maximum-minimum+1;if(!Number.isSafeInteger(minimum)||!Number.isSafeInteger(maximum)||width<1||width>0x100000000||noRepeat&&count>width)throw Error('invalid-number');selected=[];const used=new Set<string>();while(selected.length<count){const value=String(minimum+randomBelow(width));if(noRepeat&&used.has(value))continue;used.add(value);selected.push(value);}}const value=selected.join('\n');setResult(value);if(mode==='names'&&noRepeat)setDrawn([...drawn,...selected]);setHistory([{time:Date.now(),result:value},...history].slice(0,30));}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}};
 return <ToolBody error={error}><select aria-label={t('fusion.utilities.mode')} value={mode} onChange={e=>{setMode(e.target.value);setResult('');setDrawn([]);}}><option value="names">{t('fusion.utilities.names')}</option><option value="integer">{t('fusion.utilities.integer')}</option></select>
 {mode==='names'?<><textarea aria-label={t('fusion.utilities.names')} value={text} onChange={e=>{setText(e.target.value);setDrawn([]);}}/><label>{t('fusion.utilities.quantity')}<input type="number" min={1} max={10000} value={count} onChange={e=>setCount(Number(e.target.value))}/></label></>:<div className="fusion-tool-columns"><label>{t('fusion.utilities.minimum')}<input type="number" value={minimum} onChange={e=>setMinimum(Number(e.target.value))}/></label><label>{t('fusion.utilities.maximum')}<input type="number" value={maximum} onChange={e=>setMaximum(Number(e.target.value))}/></label></div>}
 {mode==='integer'&&<label>{t('fusion.utilities.quantity')}<input type="number" min={1} max={10000} value={count} onChange={event=>setCount(Number(event.target.value))}/></label>}<div className="fusion-tool-actions"><label><input type="checkbox" checked={noRepeat} onChange={event=>{setNoRepeat(event.target.checked);setDrawn([]);}}/>{t('fusion.enhance.utility.noRepeat')}</label>{mode==='names'&&drawn.length>0&&<button onClick={()=>setDrawn([])}>{t('fusion.enhance.utility.resetDraw')}</button>}</div><ToolCommands><button onClick={run}>{t('fusion.utilities.draw')}</button></ToolCommands>{result&&<ToolResult text={result}/>}<details><summary>{t('fusion.enhance.utility.history')}</summary>{history.map(row=><div key={row.time}><small>{new Date(row.time).toLocaleString()}</small><pre>{row.result}</pre></div>)}{history.length>0&&<button onClick={()=>setHistory([])}>{t('fusion.toolbox.clear')}</button>}</details></ToolBody>;
}
/** Parses and edits query parameters without navigating to the address. */
export function UrlTool():JSX.Element {
 const {t}=useTranslation(),[text,setText]=useState(''),[component,setComponent]=useState(true),[result,setResult]=useState(''),[base,setBase]=useState(''),[params,setParams]=useState<Array<[string,string]>>([]),[error,setError]=useState('');
 useProductFiles('url-codec',files=>{if(files[0])void files[0].text().then(setText).catch(reason=>setError(String(reason)));});
 const run=(action:'encode'|'decode'|'parse'):void=>{setError('');try{if(action==='parse'){const url=new URL(text);if(!['http:','https:'].includes(url.protocol))throw Error('invalid-url');setParams([...url.searchParams.entries()]);url.search='';setBase(url.href);setResult(text);}else setResult(action==='encode'?(component?encodeURIComponent:encodeURI)(text):(component?decodeURIComponent:decodeURI)(text));}catch(reason){setError(reason instanceof URIError?'invalid-url-encoding':reason instanceof Error?reason.message:String(reason));}};
 const change=(next:Array<[string,string]>):void=>{setParams(next);const url=new URL(base);for(const [key,value] of next)url.searchParams.append(key,value);setResult(url.href);};
 return <ToolBody error={error}>
 <ToolCommands>{(['encode','decode'] as const).map(action=><button key={action} disabled={!text} onClick={()=>run(action)}>{t('fusion.utilities.'+action)}</button>)}<MusicMenu label={t('fusion.music.more')}><button disabled={!text} onClick={()=>run('parse')}>{t('fusion.utilities.parse')}</button><button aria-pressed={component} onClick={()=>setComponent(value=>!value)}>{t('fusion.utilities.urlComponent')}{component?' ✓':''}</button></MusicMenu></ToolCommands>
 <ToolEditors input={<textarea aria-label={t('fusion.utilities.urlInput')} placeholder={t('fusion.utilities.urlInput')} value={text} onChange={e=>setText(e.target.value)}/>}
 result={result?<><ToolResult text={result}/>{base&&<details className="fusion-inline-options"><summary>{t('fusion.utilities.parse')}</summary><div className="fusion-url-params">{params.map((pair,index)=><div key={index}><input aria-label={t('fusion.utilities.parameter')} value={pair[0]} onChange={e=>change(params.map((p,i)=>i===index?[e.target.value,p[1]]:p))}/><input aria-label={t('fusion.utilities.value')} value={pair[1]} onChange={e=>change(params.map((p,i)=>i===index?[p[0],e.target.value]:p))}/><button aria-label={t('fusion.utilities.remove')} onClick={()=>change(params.filter((_,i)=>i!==index))}>×</button></div>)}<button onClick={()=>change([...params,['','']])}>{t('fusion.utilities.addParameter')}</button></div></details>}</>:undefined}/>
 </ToolBody>;
}
