/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file TextPdfTools.tsx @description 本地文本工作台与可取消的 PDF 导出。 @author 鸡哥 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, X } from 'lucide-react';
import { useToolJob } from './toolHooks';
import {useProductFiles} from '../productStore';
import { ToolBody, ToolResult, ToolTabs, ToolEditors } from './ToolControls';
import { downloadToolFile, transformText } from './toolHelpers';
import type { UtilityJob, DiffPart } from './utilityOperations';

/** 普通文本处理和双栏差异比较。
 * @returns 可编辑、可导出的文本工具。
 */
export function TextTool({mode:controlledMode,onModeChange,showModeTabs=true}:{mode?:'process'|'compare';onModeChange?:(mode:'process'|'compare')=>void;showModeTabs?:boolean}={}) {
 const {t}=useTranslation(),[text,setText]=useState(''),[comparison,setComparison]=useState('');
 const [localMode,setLocalMode]=useState<'process'|'compare'>('process'),[find,setFind]=useState(''),[replacement,setReplacement]=useState(''),[inputError,setInputError]=useState(''),[ignoreWhitespace,setIgnoreWhitespace]=useState(false);
 const mode=controlledMode??localMode,setMode=onModeChange??setLocalMode;
 const job=useToolJob();
 useProductFiles('text',files=>{if(files[0]){setInputError('');void files[0].text().then(setText).catch(reason=>setInputError(String(reason)));}});
 const parts=Array.isArray(job.result)?job.result as DiffPart[]:[];
 const input=<><div className={mode==='compare'?'fusion-tool-columns':'fusion-tool-single'}>
 <label>{t('fusion.toolbox.original')}<textarea value={text} onChange={event=>setText(event.target.value)}/></label>
 {mode==='compare'&&<label>{t('fusion.toolbox.comparison')}<textarea value={comparison} onChange={event=>setComparison(event.target.value)}/></label>}</div>
 {mode==='compare'&&<label><input type="checkbox" checked={ignoreWhitespace} onChange={event=>setIgnoreWhitespace(event.target.checked)}/>{t('fusion.enhance.data.ignoreWhitespace')}</label>}<small className="fusion-tool-stats">{t('fusion.toolbox.textStats',{characters:[...text].length,lines:text?text.split(/\r?\n/).length:0,words:[...new Intl.Segmenter(undefined,{granularity:'word'}).segment(text)].filter(part=>part.isWordLike).length})}</small>
 {mode==='process'&&<details className="fusion-inline-options"><summary>{t('fusion.toolbox.replace')}</summary><div className="fusion-tool-row"><input aria-label={t('fusion.toolbox.find')} placeholder={t('fusion.toolbox.find')} value={find} onChange={event=>setFind(event.target.value)}/><input aria-label={t('fusion.toolbox.replacement')} placeholder={t('fusion.toolbox.replacement')} value={replacement} onChange={event=>setReplacement(event.target.value)}/><button disabled={!find} onClick={()=>setText(transformText(text,'replace',find,replacement))}>{t('fusion.toolbox.replace')}</button></div></details>}</>;
 const result=mode==='compare'?(parts.length?<div className="fusion-tool-columns fusion-diff" aria-label={t('fusion.toolbox.diffResult')}><pre>{parts.filter(part=>!part.added).map((part,index)=><span key={index} data-change={part.removed?'removed':undefined}>{part.value}</span>)}</pre><pre>{parts.filter(part=>!part.removed).map((part,index)=><span key={index} data-change={part.added?'added':undefined}>{part.value}</span>)}</pre></div>:undefined):text?<ToolResult text={text} filename="text.txt"/>:undefined;
 return <ToolBody busy={job.busy} error={inputError||job.error} cancel={job.cancel} actions={mode==='compare'?<button disabled={job.busy} onClick={()=>job.run({kind:'diff',before:text,after:comparison,ignoreWhitespace})}>{t('fusion.toolbox.compare')}</button>:<select aria-label={t('fusion.toolbox.operation')} value="" onChange={event=>{if(event.target.value)setText(transformText(text,event.target.value));}}><option value="">{t('fusion.toolbox.operation')}</option>{['trim','dedupe','sort','reverse','empty','upper','lower'].map(id=><option key={id} value={id}>{t('fusion.toolbox.textActions.'+id)}</option>)}</select>}>
 {showModeTabs&&<ToolTabs>{(['process','compare'] as const).map(id=><button key={id} aria-pressed={mode===id} onClick={()=>setMode(id)}>{t(id==='compare'?'fusion.toolbox.compare':'fusion.toolbox.workspace.process')}</button>)}</ToolTabs>}
 <ToolEditors resultRevision={mode==='compare'?job.result:undefined} input={input} result={result}/></ToolBody>;
}

/** 文件顺序和一开始页码直接决定导出的新 PDF。
 * @returns PDF 整理面板。
 */
export function PdfTool() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<'merge' | 'extract' | 'rotate' | 'images'>('merge');
  const [pages, setPages] = useState('');
  const [rotation, setRotation] = useState(90);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const job = useToolJob();
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const add = (incoming: FileList | File[]): void => {
    const items = Array.from(incoming);
    if (items.some(file => file.size > 100 * 1024 * 1024) || [...files, ...items].reduce((sum, file) => sum + file.size, 0) > 250 * 1024 * 1024) { setError('file-too-large'); return; }
    setError(''); setFiles(old => [...old, ...items]);
  };
  useProductFiles('pdf',incoming=>setFiles(incoming));
  const move = (index: number, delta: number): void => { setFiles(old => { const next = [...old]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; }); };
  const run = async (): Promise<void> => {
    const current = ++generation.current; setError(''); setReading(true);
    try {
      const inputs = await Promise.all(files.map(async file => ({ name: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) })));
      if (current === generation.current) job.run({ kind: 'pdf', mode, files: inputs, pages, rotation } as UtilityJob);
    } catch (reason) { if (current === generation.current) setError(String(reason)); }
    finally { if (current === generation.current) setReading(false); }
  };
  return (
    <ToolBody busy={reading || job.busy} error={error || job.error} cancel={() => { generation.current++; setReading(false); job.cancel(); }}>
      <div className="fusion-tool-row"><label>{t('fusion.toolbox.operation')}<select value={mode} onChange={event => { generation.current++; setReading(false); setMode(event.target.value as typeof mode); setFiles([]); job.cancel(); }}>{['merge', 'extract', 'rotate', 'images'].map(key => <option key={key} value={key}>{t(`fusion.toolbox.pdfModes.${key}`)}</option>)}</select></label>
        <label>{t('fusion.toolbox.chooseFiles')}<input type="file" multiple accept={mode === 'images' ? 'image/png,image/jpeg' : 'application/pdf'} onChange={event => { if (event.target.files) add(event.target.files); event.target.value = ''; }} /></label>
      </div>
      <div className="fusion-tool-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); event.stopPropagation(); add(event.dataTransfer.files); }}>{t('fusion.toolbox.pdfDrop')}</div>
      <div className="fusion-file-list">{files.map((file, index) => <div className="fusion-tool-row" key={`${file.name}-${file.lastModified}-${index}`}><span className="grow">{index + 1}. {file.name}</span>
        <button type="button" disabled={index === 0} aria-label={t('fusion.toolbox.moveUp')} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
        <button type="button" disabled={index === files.length - 1} aria-label={t('fusion.toolbox.moveDown')} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
        <button type="button" aria-label={t('fusion.toolbox.remove')} onClick={() => setFiles(old => old.filter((_, at) => at !== index))}><X size={14} /></button>
      </div>)}</div>
      {(mode === 'extract' || mode === 'rotate') && <><label>{t('fusion.product.options.pages')}<input value={pages} placeholder="3,1-2" onChange={event => setPages(event.target.value)} /></label><p className="fusion-tool-hint">{t('fusion.toolbox.pagesHint')}</p></>}
      {mode === 'rotate' && <label>{t('fusion.toolbox.rotation')}<select value={rotation} onChange={event => setRotation(Number(event.target.value))}>{[90, 180, 270].map(degrees => <option key={degrees} value={degrees}>{degrees}°</option>)}</select></label>}
      <button type="button" disabled={!files.length || reading || job.busy} onClick={() => void run()}>{t('fusion.toolbox.createPdf')}</button>
      {job.result instanceof Uint8Array && <button type="button" onClick={() => downloadToolFile('FusionIsland.pdf', (job.result as Uint8Array).slice().buffer as ArrayBuffer, 'application/pdf')}>{t('fusion.toolbox.downloadPdf')}</button>}
    </ToolBody>
  );
}
