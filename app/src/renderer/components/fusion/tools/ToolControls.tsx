/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file ToolControls.tsx @description 统一工具反馈、结果复制和导出控件。 @author 鸡哥 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Check, Download, FilePlus2, X } from 'lucide-react';
import {MusicMenu} from './MusicMenu';
import {useProductStore} from '../productStore';
import {openProductTool} from '../productStore';
import { downloadToolFile } from './toolHelpers';
import {TOOL_REGISTRY} from './toolRegistry';
import { useSlidingIndicator } from '../useSlidingIndicator';
const ToolSlots=createContext<{modes:HTMLElement|null;actions:HTMLElement|null;visible?:boolean;toolId?:string}>({modes:null,actions:null});
/** Allows retained tools to ignore navigation requests addressed to another workspace. */
export function useToolVisible():boolean{return useContext(ToolSlots).visible!==false;}
/** Owns the sole detail toolbar and each tool's content scrolling region. */
export function ToolFrame({children,onBack,presentation,toolId,visible=true,standalone=false}:{children:ReactNode;onBack:()=>void;presentation:string;toolId?:string;visible?:boolean;standalone?:boolean}) {
  const {t}=useTranslation(),[modes,setModes]=useState<HTMLElement|null>(null),[actions,setActions]=useState<HTMLElement|null>(null),[inputError,setInputError]=useState(''),[importing,setImporting]=useState(false);
  useEffect(()=>{const inputFailed=(event:Event)=>{const value=(event as CustomEvent<{target:string;error:string}>).detail;if(value?.target===toolId)setInputError(value.error);};window.addEventListener('float-tool-input-error',inputFailed);return()=>window.removeEventListener('float-tool-input-error',inputFailed);},[toolId]);
  const definition=TOOL_REGISTRY.find(tool=>tool.id===toolId),accepted=definition?.accepts||[];
  const frame=useRef<HTMLDivElement>(null),focus=useRef<HTMLElement|null>(null);
  useEffect(()=>{if(!visible)return;const restore=requestAnimationFrame(()=>{if(focus.current?.isConnected&&frame.current?.contains(focus.current)&&focus.current.getBoundingClientRect().height)focus.current.focus({preventScroll:true});});return()=>cancelAnimationFrame(restore);},[visible]);
  const importFiles=async(files?:File[])=>{if(!toolId||importing)return;setImporting(true);setInputError('');try{const result=await window.api.fusionLocalImport({domain:'files',mode:files?'drop':'files',requestId:crypto.randomUUID()},files);if(!result.cancelled&&result.artifacts.length)useProductStore.getState().set({target:toolId,inputs:result.artifacts,nonce:Date.now()});if(result.errors.length)setInputError(result.errors.map(item=>item.name+': '+item.error).join('\n'));}catch(reason){setInputError(String(reason));}finally{setImporting(false);}};
  return <ToolSlots.Provider value={{modes,actions,visible,toolId}}><div ref={frame} className="fusion-tool-frame" data-tool-id={toolId} data-standalone={standalone} data-presentation={presentation} onFocusCapture={event=>{if(visible)focus.current=event.target as HTMLElement;}} onDragOver={event=>{if(accepted.length&&event.dataTransfer.types.includes('Files'))event.preventDefault();}} onDrop={event=>{if(event.defaultPrevented||!accepted.length||!event.dataTransfer.files.length)return;event.preventDefault();event.stopPropagation();void importFiles(Array.from(event.dataTransfer.files));}}>
    <div className="fusion-tool-toolbar">{!standalone&&<>{<button type="button" className="fusion-icon-button" title={t('fusion.tools.back')} aria-label={t('fusion.tools.back')} onClick={onBack}><X size={17} strokeWidth={1.7}/></button>}<strong className="float-tool-title">{definition?t(definition.label):''}</strong></>}
      {standalone&&<div className="fusion-tool-modes" ref={setModes}/>}</div>
    {!standalone&&<div className="fusion-tool-modes float-tool-function-row" ref={setModes}/>}
    <div className="fusion-tool-commands" ref={setActions}>{['text','encoding','translation','random','calculator'].includes(toolId||'')&&<div className="fusion-tool-input-actions"><button disabled={importing} onClick={()=>void importFiles()}><FilePlus2 size={16}/>{t('fusion.toolbox.chooseFiles')}</button></div>}</div>
    <div className="fusion-tool-scroll"><ToolError error={inputError}/>{children}</div>
  </div></ToolSlots.Provider>;
}
/** Places mode selectors beside the return control; standalone tools remain usable. */
export function ToolTabs({children,alwaysVisible=false}:{children:ReactNode;alwaysVisible?:boolean}) {
  const slots=useContext(ToolSlots),{t}=useTranslation();
  const tabs=useRef<HTMLDivElement>(null);
  useSlidingIndicator(tabs, 'button[aria-pressed=true]', slots.visible===false?null:slots.modes);
  if(slots.visible===false)return null;
  const content=<div ref={tabs} className="fusion-product-tabs" data-page-navigation={alwaysVisible} role="group" aria-label={t('fusion.tools.functions')} onKeyDown={event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!(event.target instanceof HTMLButtonElement)||event.target.parentElement!==tabs.current)return;
    const container=tabs.current;if(!container)return;
    const buttons=Array.from(container.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)'));
    const index=buttons.indexOf(event.target);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(event.key==='ArrowRight'?1:-1)));
    event.preventDefault();buttons[next]?.click();buttons[next]?.focus({preventScroll:true});
    const button=buttons[next];
    if(button&&container&&(button.offsetLeft<container.scrollLeft||button.offsetLeft+button.offsetWidth>container.scrollLeft+container.clientWidth))container.scrollTo({left:button.offsetLeft-(container.clientWidth-button.offsetWidth)/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }}>{children}</div>;
  return slots.modes?createPortal(content,slots.modes):content;
}
/** Hosts current commands in the shared toolbar without moving or duplicating inputs. */
export function ToolCommands({children}:{children:ReactNode}) {
  const slots=useContext(ToolSlots),bar=useRef<HTMLDivElement>(null);
  // 窄窗口只显示图标时，按钮文字仍作为悬停提示和无障碍名称。
  useEffect(()=>{bar.current?.querySelectorAll<HTMLElement>(':scope > button, :scope > label').forEach(button=>{const text=button.textContent?.trim();if(!text||(button.title&&!button.dataset.autoTitle))return;button.dataset.autoTitle='1';button.title=text;button.setAttribute('aria-label',text);});});
  const content=<div ref={bar} className="fusion-tool-actions">{children}</div>;
  if(slots.visible===false)return null;
  return slots.actions?createPortal(content,slots.actions):content;
}
/** Keeps visited subtools and their inputs mounted in one workspace. */
export function ToolModes({value,children}:{value:string;children:Record<string,ReactNode>}) {
  const [visited,setVisited]=useState<string[]>([value]);
  const slots=useContext(ToolSlots);
  const first=useRef(true);
  useEffect(()=>{setVisited(old=>old.includes(value)?old:[...old,value]);if(first.current){first.current=false;return;}const store=useProductStore.getState();if(slots.visible!==false&&store.target===slots.toolId&&store.tab!==value)store.set({tab:value});},[value,slots.visible,slots.toolId]);
  return <>{[...new Set([...visited,value])].filter(id=>id in children).map(id=><ToolSlots.Provider key={id} value={{...slots,visible:slots.visible!==false&&id===value}}><div className="fusion-tool-submode" hidden={id!==value}>{children[id]}</div></ToolSlots.Provider>)}</>;
}
/** Keeps input and result mounted while switching panes on narrow windows. */
export function ToolEditors({input,result,resultRevision}:{input:ReactNode;result?:ReactNode;resultRevision?:unknown}) {
  const {t}=useTranslation(),element=useRef<HTMLDivElement>(null),[narrow,setNarrow]=useState(false),[pane,setPane]=useState('input');
  useEffect(()=>{const node=element.current;if(!node)return;const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width>0)setNarrow(entry.contentRect.width<640);});observer.observe(node);return()=>observer.disconnect();},[]);
  useEffect(()=>{if(!result)setPane('input');},[Boolean(result)]);
  useEffect(()=>{if(resultRevision!==undefined&&resultRevision!==null&&element.current?.offsetHeight)setPane('result');},[resultRevision]);
  return <div ref={element} className="fusion-tool-editors" data-narrow={narrow}>
    {narrow&&result&&<div className="fusion-product-tabs fusion-editor-panes">{['input','result'].map(id=><button key={id} aria-pressed={pane===id} onClick={()=>setPane(id)}>{t('fusion.toolbox.workspace.'+id)}</button>)}</div>}
    <div className="fusion-editor-pane" hidden={narrow&&pane!=='input'}>{input}</div>
    {result&&<div className="fusion-editor-pane" hidden={narrow&&pane!=='result'}>{result}</div>}
  </div>;
}
/** 为可复制结果提供明确反馈。
 * @param props - 结果文本及可选下载文件名。
 * @returns 结果与操作按钮。
 */
export function ToolResult({ text, filename }: { text: string; filename?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  useEffect(()=>{setCopied(false);},[text]);
  if(!text)return null;
  return (
    <div className="fusion-tool-result">
      <pre>{text}</pre>
      <div className="fusion-tool-actions">
        <button type="button" title={t(copied ? 'fusion.toolbox.copied' : 'fusion.toolbox.copy')} aria-label={t(copied ? 'fusion.toolbox.copied' : 'fusion.toolbox.copy')} onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(() => setCopied(false), 1500); }).catch(reason => setError(String(reason))); }}>
          {copied ? <Check size={16} strokeWidth={1.6}/> : <Copy size={16} strokeWidth={1.6}/>}<span>{t(copied?'fusion.toolbox.copied':'fusion.toolbox.copy')}</span>
        </button>
        <button type="button" onClick={() => downloadToolFile(filename||'result.txt', text)}><Download size={16} strokeWidth={1.6}/>{t('fusion.toolbox.export')}</button>
        <MusicMenu showLabel label={t('fusion.enhance.result.useWith')}>{['translation','text','qr','encoding'].map(id=><button key={id} onClick={()=>{void window.api.fusionProductText(text).then(artifact=>openProductTool(id,[artifact],id==='encoding'?'base64':'')).catch(reason=>setError(String(reason)));}}>{t('fusion.toolbox.items.'+id)}</button>)}</MusicMenu>
      </div>
      {error && <ToolError error={error} />}
    </div>
  );
}
/** 显示可翻译的已知错误，其余错误保留诊断。
 * @param props - 错误信息。
 * @returns 错误提示。
 */
export function ToolError({ error }: { error: string }) {
  const { t, i18n } = useTranslation();
  const code=error.split('Error:').at(-1)?.trim()||error;
  const key = `fusion.toolbox.errors.${code}`;
  return error ? <p className="fusion-inline-error" role="alert">{i18n.exists(key) ? t(key) : code}</p> : null;
}
/** 为所有工具提供统一的可取消状态。
 * @param props - 内容及可取消任务。
 * @returns 工具主体。
 */
export function ToolBody({ children, actions, busy = false, error = '', cancel, className='' }: { children: ReactNode; actions?:ReactNode; busy?: boolean; error?: string; cancel?: () => void; className?:string }) {
  const { t } = useTranslation();
  return <div className={'fusion-utility '+className} aria-busy={busy}>{actions&&<ToolCommands>{actions}</ToolCommands>}{busy&&<ToolCommands><span role="status" className="fusion-tool-busy"/>{cancel&&<button type="button" onClick={cancel}>{t('fusion.toolbox.cancel')}</button>}</ToolCommands>}{children}<ToolError error={error} /></div>;
}
