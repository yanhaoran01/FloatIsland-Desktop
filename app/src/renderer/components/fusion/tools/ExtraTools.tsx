/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file ExtraTools.tsx @description 离线便签、日期、配色和随机凭据工具。 @author 鸡哥 */
import { useEffect, useRef, useState,type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Eye, Download, Trash2, PanelLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {useToolPreference} from './toolPreferences';
import { useToolData } from './toolHooks';
import { ToolBody, ToolError, ToolResult, ToolCommands, ToolTabs, useToolVisible } from './ToolControls';
import { colorFormats, dateMilliseconds, downloadToolFile, generatePassword } from './toolHelpers';
import type { ToolNote } from '../../../../preload/types/fusionTools';
import {useProductStore,useProductFiles} from '../productStore';

/** 自动保存的 Markdown 便签，不修改既有设置。 */
export function NoteTool({attachment}:{attachment?:(note:ToolNote)=>ReactNode}={}) {
  const { t } = useTranslation();
  const { data, error, write } = useToolData();
  const [query, setQuery] = useState('');
  const [searchOpen,setSearchOpen]=useState(false),[listOpen,setListOpen]=useState(true);
  const [draft, setDraft] = useState<ToolNote | null>(null);
  const [preview, setPreview] = useState(false);
  const pending = useRef<ToolNote | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const product=useProductStore();
  const persist = (note: ToolNote): void => { void write('note', note).catch(() => {}); };
  const flush = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) { persist(pending.current); pending.current = null; }
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (pending.current) void window.api.fusionToolWrite('note', pending.current).catch(() => {}); }, []);
  useEffect(()=>{if(product.target==='notes'&&product.tab.startsWith('notes:')){const note=data.notes.find(x=>x.id===product.tab.slice(6));if(note){flush();setDraft(note);setListOpen(true);}}},[product.nonce,data.notes.length]);
  const change = (patch: Partial<ToolNote>): void => {
    if (!draft) return;
    const next = { ...draft, ...patch, updated: Date.now() };
    setDraft(next); pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 350);
  };
  const create = (): void => {
    flush();
    setPreview(false);
    const note = { id: crypto.randomUUID(), title: t('fusion.toolbox.notes.untitled'), text: '', updated: Date.now() };
    setDraft(note); persist(note);
  };
  return <ToolBody error={error}>
    <ToolCommands><button title={t('fusion.toolbox.notes.list')} aria-label={t('fusion.toolbox.notes.list')} onClick={()=>setListOpen(!listOpen)}><PanelLeft size={20} strokeWidth={1.6}/></button><button title={t('fusion.toolbox.search')} aria-label={t('fusion.toolbox.search')} onClick={()=>setSearchOpen(!searchOpen)}><Search size={20} strokeWidth={1.6}/></button><button title={t('fusion.toolbox.notes.new')} aria-label={t('fusion.toolbox.notes.new')} onClick={create}><Plus size={20} strokeWidth={1.6}/>{t('fusion.toolbox.notes.new')}</button></ToolCommands>{searchOpen&&<input autoFocus aria-label={t('fusion.toolbox.search')} placeholder={t('fusion.toolbox.search')} value={query} onChange={event=>setQuery(event.target.value)}/>}
    <div className="fusion-note-layout" data-list-open={listOpen}><nav hidden={!listOpen} aria-label={t('fusion.toolbox.notes.list')}>
      {data.notes.filter(note => `${note.title} ${note.text} ${(note.tags||[]).join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.updated - a.updated).map(note => <button key={note.id} aria-pressed={draft?.id === note.id} onClick={() => { flush(); setDraft(note); }}>{note.title || t('fusion.toolbox.notes.untitled')}</button>)}
    </nav><div className="fusion-note-editor">{draft ? <>
      <input maxLength={200} aria-label={t('fusion.toolbox.notes.title')} value={draft.title} onChange={event => change({ title: event.target.value })} />
      <ToolCommands><button title={t('fusion.toolbox.notes.preview')} aria-label={t('fusion.toolbox.notes.preview')} aria-pressed={preview} onClick={() => setPreview(!preview)}><Eye size={20} strokeWidth={1.6}/></button>{(['md', 'txt'] as const).map(format => <button key={format} onClick={() => { flush(); downloadToolFile(`note.${format}`, draft.text); }}><Download size={16} strokeWidth={1.6}/> {format.toUpperCase()}</button>)}<button title={t('fusion.toolbox.delete')} aria-label={t('fusion.toolbox.delete')} onClick={() => { if (!confirm(t('fusion.toolbox.notes.deleteConfirm'))) return; if (timer.current) clearTimeout(timer.current); pending.current = null; void write('deleteNote', draft.id).then(() => setDraft(null)).catch(() => {}); }}><Trash2 size={20} strokeWidth={1.6}/></button></ToolCommands>
      <label>{t('fusion.library.tags')}<input value={(draft.tags||[]).join(', ')} onChange={event=>change({tags:event.target.value.split(',').map(value=>value.trim()).filter(Boolean).slice(0,20)})}/></label>
      {attachment?.(draft)}
      {preview ? <div className="fusion-markdown-preview"><ReactMarkdown>{draft.text}</ReactMarkdown></div> : <textarea aria-label={t('fusion.toolbox.notes.content')} value={draft.text} onChange={event => change({ text: event.target.value })} />}
    </> : <p>{t('fusion.enhance.notes.empty')}</p>}</div></div>
  </ToolBody>;
}

/** 公历天数计算、明确单位的时间戳和实时城市时钟。 */
export function DateTool({mode:externalMode,showModeTabs=true}:{mode?:'dates'|'timestamp'|'clock';showModeTabs?:boolean}={}) {
  const { t, i18n } = useTranslation();
  const [localMode,setMode]=useState<'dates'|'timestamp'|'clock'>('dates'),mode=externalMode||localMode;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [days, setDays] = useState(1);
  const [stamp, setStamp] = useState(String(Math.floor(Date.now() / 1000)));
  const [dateTime, setDateTime] = useState(new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T'));
  const [unit, setUnit] = useState('seconds');
  const [city, setCity] = useState('America/New_York');
  const [zones,setZones]=useToolPreference<string[]>('dates.zones',['Asia/Shanghai','UTC','America/New_York'],(value):value is string[]=>Array.isArray(value)&&value.length<=20&&value.every(zone=>{if(typeof zone!=='string'||zone.length>100)return false;try{new Intl.DateTimeFormat('en',{timeZone:zone});return true;}catch{return false;}}));
  const zoneOptions=Intl.supportedValuesOf('timeZone');
  const addZone=()=>{try{new Intl.DateTimeFormat('en',{timeZone:city});setZones([...new Set([...zones,city])].slice(0,20));setError('');}catch{setError('invalid-timezone');}};
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const visible=useToolVisible();
  useEffect(() => { if(!visible||mode==='dates')return;setNow(Date.now());const clock = setInterval(() => {if(!document.hidden)setNow(Date.now());}, 1000); return () => clearInterval(clock); }, [visible,mode]);
  const calculate = (operation: string): void => {
    try {
      setError('');
      if (operation === 'difference') setResult(`${(dateMilliseconds(end) - dateMilliseconds(start)) / 86400000} ${t('fusion.toolbox.dates.days')}`);
      else if (operation === 'add') { if (!Number.isInteger(days) || Math.abs(days) > 100000) throw new Error('invalid-date'); setResult(new Date(dateMilliseconds(start) + days * 86400000).toISOString().slice(0, 10)); }
      else if (operation === 'fromDate') { const value = Date.parse(dateTime + '+08:00'); if (!Number.isFinite(value)) throw new Error('invalid-date'); setResult(String(unit === 'seconds' ? Math.floor(value / 1000) : value)); }
      else { const value = Number(stamp) * (unit === 'seconds' ? 1000 : 1); if (!stamp.trim() || !Number.isFinite(value)) throw new Error('invalid-date'); setResult(`${new Date(value).toISOString()}\n${new Date(value).toLocaleString(i18n.language, { timeZone: 'Asia/Shanghai' })}`); }
    } catch { setError('invalid-date'); }
  };
  return <ToolBody error={error}>
    {showModeTabs&&<ToolTabs>{(['dates','timestamp','clock'] as const).map(id=><button key={id} aria-pressed={mode===id} onClick={()=>setMode(id)}>{t('fusion.toolbox.workspace.'+id)}</button>)}</ToolTabs>}
    {mode==='clock'&&<><div className="fusion-clock-grid">{zones.map((zone, index) => <div key={`${zone}-${index}`}><small>{zone}</small><strong>{new Date(now).toLocaleString(i18n.language, { timeZone: zone, hour12: false })}</strong><button onClick={()=>setZones(zones.filter(item=>item!==zone))}>{t('fusion.toolbox.remove')}</button></div>)}</div>
    <div className="fusion-tool-row"><label>{t('fusion.toolbox.dates.city')}<input list="float-timezones" value={city} onChange={event=>setCity(event.target.value)}/></label><datalist id="float-timezones">{zoneOptions.map(zone=><option key={zone} value={zone}/>)}</datalist><button disabled={zones.length>=20} onClick={addZone}>{t('fusion.enhance.utility.addZone')}</button></div>
    </>}
    {mode==='dates'&&<><div className="fusion-tool-columns"><label>{t('fusion.toolbox.dates.start')}<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label><label>{t('fusion.toolbox.dates.end')}<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label></div>
    <div className="float-date-actions"><button onClick={() => calculate('difference')}>{t('fusion.toolbox.dates.difference')}</button><label>{t('fusion.toolbox.dates.days')}<input type="number" value={days} onChange={event => setDays(Number(event.target.value))} /></label><button onClick={() => calculate('add')}>{t('fusion.toolbox.dates.add')}</button></div>
    </>}
    {mode==='timestamp'&&<><div className="fusion-tool-actions"><input aria-label={t('fusion.toolbox.dates.timestamp')} value={stamp} onChange={event => setStamp(event.target.value)} /><select aria-label={t('fusion.toolbox.dates.unit')} value={unit} onChange={event => setUnit(event.target.value)}>{['seconds', 'milliseconds'].map(id => <option key={id} value={id}>{t(`fusion.toolbox.dates.${id}`)}</option>)}</select><button onClick={() => calculate('timestamp')}>{t('fusion.toolbox.convert')}</button><button onClick={() => setResult(`${Math.floor(now / 1000)}\n${now}`)}>{t('fusion.toolbox.dates.now')}</button></div>
    <label>{t('fusion.toolbox.dates.dateTime')}<input type="datetime-local" value={dateTime} onChange={event => setDateTime(event.target.value)} /></label><button onClick={() => calculate('fromDate')}>{t('fusion.toolbox.dates.toTimestamp')}</button></>}
    {result && <ToolResult text={result} />}
  </ToolBody>;
}

/** 原生屏幕取色，取消不报错；色板保存到应用数据目录。 */
export function ColorTool() {
  const { t } = useTranslation();
  const { data, write, error: storeError } = useToolData();
  const [color, setColor] = useState('#87a6ff');
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const imageCanvas=useRef<HTMLCanvasElement>(null),imageRevision=useRef(0);const [hasImage,setHasImage]=useState(false);
  const loadImage=async(file:File)=>{const revision=++imageRevision.current;setError('');try{if(!file.type.startsWith('image/')||file.size>20000000)throw Error('invalid-image');const bitmap=await createImageBitmap(file);try{if(revision!==imageRevision.current)return;if(bitmap.width*bitmap.height>16000000)throw Error('image-too-large');const canvas=imageCanvas.current!;canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d')!.drawImage(bitmap,0,0);setHasImage(true);}finally{bitmap.close();}}catch(reason){setError(String(reason));}};
  useProductFiles('colors',files=>{if(files[0])void loadImage(files[0]);});
  useEffect(()=>()=>{imageRevision.current++;},[]);
  const pickActive = useRef(false), pickGeneration = useRef(0);
  useEffect(() => () => { pickGeneration.current++; if (pickActive.current) void window.api.fusionColorPick('cancel').catch(() => {}); }, []);
  let formats: ReturnType<typeof colorFormats> | null = null;
  try { formats = colorFormats(color); } catch { /* Allow incomplete manual input. */ }
  const pick = async (): Promise<void> => {
    if (pickActive.current) return;
    const generation = ++pickGeneration.current;
    pickActive.current = true; setPicking(true);
    setError('');
    try { const hex = await window.api.fusionColorPick('start'); if (generation === pickGeneration.current && hex) setColor(hex); }
    catch (reason) { if (generation === pickGeneration.current) setError(String(reason)); }
    finally { if (generation === pickGeneration.current) { pickActive.current = false; setPicking(false); } }
  };
  return <ToolBody error={error || storeError}>
    <div className="fusion-tool-actions"><input type="color" aria-label={t('fusion.toolbox.colors.choose')} value={formats?.hex || '#000000'} onChange={event => setColor(event.target.value)} /><input aria-label="HEX / RGB / HSL" placeholder="HEX / RGB / HSL" value={color} onChange={event => setColor(event.target.value)} /><button disabled={picking} onClick={() => void pick()}>{t(picking ? 'fusion.toolbox.colors.picking' : 'fusion.toolbox.colors.pick')}</button><button disabled={!formats} onClick={() => { if (formats) void write('colors', [...data.colors, formats.hex]).catch(() => {}); }}>{t('fusion.toolbox.colors.save')}</button></div>
    <label className="fusion-file-button">{t('fusion.enhance.utility.imageColor')}<input type="file" accept="image/*" onChange={event=>{if(event.target.files?.[0])void loadImage(event.target.files[0]);event.target.value='';}}/></label><canvas ref={imageCanvas} hidden={!hasImage} style={{maxWidth:'100%',maxHeight:240,objectFit:'contain',cursor:'crosshair'}} aria-label={t('fusion.enhance.utility.imageColorHint')} onClick={event=>{const canvas=event.currentTarget,rect=canvas.getBoundingClientRect(),x=Math.min(canvas.width-1,Math.max(0,Math.floor((event.clientX-rect.left)*canvas.width/rect.width))),y=Math.min(canvas.height-1,Math.max(0,Math.floor((event.clientY-rect.top)*canvas.height/rect.height))),pixel=canvas.getContext('2d')!.getImageData(x,y,1,1).data;setColor('#'+Array.from(pixel.slice(0,3),byte=>byte.toString(16).padStart(2,'0')).join(''));}}/>
    {hasImage&&<small>{t('fusion.enhance.utility.imageColorHint')}</small>}
    {!formats && <ToolError error="invalid-color" />}
    {formats && <><div className="fusion-color-preview" style={{ backgroundColor: formats.hex }} />{Object.values(formats).map(value => <ToolResult key={value} text={value} />)}</>}
    <div className="fusion-tool-actions"><h3>{t('fusion.toolbox.colors.palette')}</h3><button disabled={!data.colors.length} onClick={()=>downloadToolFile('palette.gpl','GIMP Palette\nName: FloatIsland\nColumns: 8\n#\n'+data.colors.map(hex=>{const rgb=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16));return rgb.join(' ')+' '+hex;}).join('\n'))}>{t('fusion.enhance.utility.paletteExport')}</button></div><div className="fusion-palette">{data.colors.map(value => <div key={value}><button style={{ backgroundColor: value }} aria-label={value} onClick={() => setColor(value)} /><small>{value}</small><button aria-label={`${t('fusion.toolbox.delete')} ${value}`} onClick={() => void write('colors', data.colors.filter(item => item !== value)).catch(() => {})}>×</button></div>)}</div>
  </ToolBody>;
}

/** 密码和 UUID 由系统随机源生成，不写入历史。 */
export function PasswordTool() {
  const { t } = useTranslation();
  const [length, setLength] = useState(20);
  const [enabled, setEnabled] = useState([true, true, true, true]);
  const [password, setPassword] = useState('');
  const [uuid, setUuid] = useState('');
  const [quantity,setQuantity]=useState(1);
  const [error, setError] = useState('');
  const groups = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789', '!@#$%^&*()-_=+[]{}:,.?'];
  return <ToolBody error={error}>
    <label>{t('fusion.enhance.utility.quantity')}<input type="number" min={1} max={200} value={quantity} onChange={event=>setQuantity(Number(event.target.value))}/></label>
    <label>{t('fusion.toolbox.password.length')}<input type="number" min="4" max="128" value={length} onChange={event => setLength(Number(event.target.value))} /></label>
    <div className="fusion-tool-actions">{['upper', 'lower', 'numbers', 'symbols'].map((id, index) => <label key={id}><input type="checkbox" checked={enabled[index]} onChange={event => setEnabled(old => old.map((value, offset) => offset === index ? event.target.checked : value))} />{t(`fusion.toolbox.password.${id}`)}</label>)}</div>
    <ToolCommands><button onClick={() => { try { setError(''); if(!Number.isInteger(quantity)||quantity<1||quantity>200)throw Error('invalid-password-options');setPassword(Array.from({length:quantity},()=>generatePassword(length, groups.filter((_, index) => enabled[index]))).join('\n')); } catch { setError('invalid-password-options'); } }}>{t('fusion.toolbox.password.generate')}</button></ToolCommands>{password && <><small>{t('fusion.enhance.utility.entropy',{bits:Math.round(length*Math.log2(Math.max(1,groups.filter((_,index)=>enabled[index]).join('').length)))})}</small><ToolResult text={password} filename="passwords.txt"/></>}
    <ToolCommands><button onClick={() => {if(!Number.isInteger(quantity)||quantity<1||quantity>200){setError('invalid-password-options');return;}setError('');setUuid(Array.from({length:quantity},()=>crypto.randomUUID()).join('\n'));}}>{t('fusion.toolbox.password.uuid')}</button></ToolCommands>{uuid && <ToolResult text={uuid} />}
  </ToolBody>;
}
