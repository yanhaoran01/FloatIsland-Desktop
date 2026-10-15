/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file FusionToolsTab.tsx @description Grouped, directly named tools with retained workspaces. @author 鸡哥 */
import {Suspense,useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ChevronRight,Search,X} from 'lucide-react';
import {useShallow} from 'zustand/react/shallow';
import {TOOL_GROUPS,TOOL_REGISTRY,resolveToolTarget} from './tools/toolRegistry';
import {TOOL_CATALOG} from './tools/toolCatalog';
import {useProductStore} from './productStore';
import {ToolFrame} from './tools/ToolControls';
import {useSlidingIndicator} from './useSlidingIndicator';
import type {WorkspacePage} from './workspaceNavigation';
import './product.css';
import './toolWorkspace.css';
import './toolCatalog.css';
type Group=typeof TOOL_GROUPS[number];
type Props={group?:Group;compact?:boolean;request?:{id:string;nonce:number}|null;workspace?:Exclude<WorkspacePage,'chat'>;onHome?:()=>void};
/** Lists concrete entries while related operations retain shared processing and history.
 * @param props - Legacy category, direct route and main page.
 * @returns Directory or selected workspace.
 */
export function FusionToolsTab({group:externalGroup,compact=false,request,workspace='tools',onHome}:Props={}) {
  const {t}=useTranslation(),product=useProductStore(useShallow(state=>({target:state.target,tab:state.tab,nonce:state.nonce,navigationOrigin:state.navigationOrigin,set:state.set})));
  const [view,setView]=useState(()=>product.target&&TOOL_REGISTRY.some(tool=>tool.id===product.target)?product.target:'home');
  const [visited,setVisited]=useState<string[]>([]),[query,setQuery]=useState('');
  const [selectedGroup,setSelectedGroup]=useState<Group>(externalGroup??TOOL_GROUPS[0]);
  const categories=useRef<HTMLElement>(null);
  useSlidingIndicator(categories,'button[aria-pressed=true]',selectedGroup+':'+view);
  const [collapsed,setCollapsed]=useState<Record<string,boolean>>(()=>{try{return JSON.parse(localStorage.getItem('float.tool-categories.v1')||'{}');}catch{return {};}});
  const directory=useRef<HTMLDivElement>(null),lastWorkspace=useRef(workspace),pageContexts=useRef<Record<string,typeof workspace>>({});
  const collectionContexts=useRef<Array<typeof workspace>>([]);
  useEffect(()=>{if(view!=='home')setVisited(old=>old.includes(view)?old:[...old,view]);},[view]);
  useEffect(()=>{if(!product.target)return;const route=resolveToolTarget(product.target);if(TOOL_REGISTRY.some(tool=>tool.id===route.id))setView(route.id);},[product.nonce]);
  useEffect(()=>{const target=workspace==='music'?'music':workspace==='reading'?'collections':workspace==='download'?'download':null;if(target)setView(target);else if(lastWorkspace.current!==workspace)setView('home');lastWorkspace.current=workspace;},[workspace]);
  useEffect(()=>{if(!request)return;const route=resolveToolTarget(request.id);if(route.id==='home'||TOOL_REGISTRY.some(tool=>tool.id===route.id))setView(route.id);if(route.tab&&product.tab!==route.tab)product.set({target:route.id,tab:route.tab,nonce:Date.now()});},[request?.id,request?.nonce]);
  useEffect(()=>{if(compact)return;const open=(event:Event):void=>{const id=(event as CustomEvent<string>).detail;if(typeof id!=='string')return;const route=resolveToolTarget(id);if(TOOL_REGISTRY.some(tool=>tool.id===route.id))setView(route.id);};window.addEventListener('fusion-open-tool',open);return()=>window.removeEventListener('fusion-open-tool',open);},[compact]);
  useEffect(()=>{if(!externalGroup)return;setSelectedGroup(externalGroup);setCollapsed(old=>({...old,[externalGroup]:false}));directory.current?.querySelector('[data-category="'+externalGroup+'"]')?.scrollIntoView({block:'start'});},[externalGroup]);
  useEffect(()=>{const selectGroup=(event:Event):void=>{const group=(event as CustomEvent<Group>).detail;if(!TOOL_GROUPS.includes(group))return;setView('home');setQuery('');setSelectedGroup(group);setCollapsed(old=>({...old,[group]:false}));requestAnimationFrame(()=>directory.current?.querySelector('[data-category="'+group+'"]')?.scrollIntoView({block:'start'}));};window.addEventListener('fusion-select-tool-group',selectGroup);return()=>window.removeEventListener('fusion-select-tool-group',selectGroup);},[]);
  useEffect(()=>{try{localStorage.setItem('float.tool-categories.v1',JSON.stringify(collapsed));}catch{/* Browsing remains usable when storage is unavailable. */}},[collapsed]);
  const select=(target:string,tab:string):void=>{setView(target);product.set({target,tab,navigationOrigin:'category',nonce:Date.now()});};
  const back=():void=>{setView('home');product.set({target:'',tab:'',...(product.navigationOrigin==='search'?{searchOpen:true}:{})});if(workspace!=='tools')onHome?.();};
  const term=query.trim().toLocaleLowerCase();
  const matches=TOOL_CATALOG.filter(item=>!term||[t(item.label),t(item.description),item.functions.map(entry=>t(entry.label)).join(' '),item.aliases.join(' '),item.id,item.keywords].join(' ').toLocaleLowerCase().includes(term));
  const workspaceTarget=workspace==='music'?'music':workspace==='reading'?'collections':workspace==='download'?'download':null;
  if(view!=='home'&&(workspaceTarget===view||(workspace==='tools'&&lastWorkspace.current===workspace)))pageContexts.current[view]=workspace;
  const tool=TOOL_REGISTRY.find(item=>item.id===view),pages=view!=='home'&&!visited.includes(view)?[...visited,view]:visited;
  const collectionContext=pageContexts.current.collections||workspace;
  if(pages.includes('collections')&&!collectionContexts.current.includes(collectionContext))collectionContexts.current.push(collectionContext);
  const mountedPages=pages.flatMap(id=>id==='collections'?collectionContexts.current.map(context=>({id,context,key:id+':'+context})): [{id,context:pageContexts.current[id]||workspace,key:id}]);
  return <section className={'fusion-tools-panel fusion-tool-directory-panel'+(compact?' is-minimal':'')} data-tool-id={view} data-layout={tool?.layout||'adaptive'} data-tool-width={tool?.width||560} aria-label={t('fusion.tools.title')}>
    <div className="fusion-tools-home fusion-natural-content fusion-tool-directory" ref={directory} hidden={view!=='home'} onWheel={event=>event.stopPropagation()}>
      <div className="fusion-tool-directory-top">
        <label className="fusion-tool-directory-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label={t('fusion.toolbox.directory.search')} placeholder={t('fusion.toolbox.directory.search')} value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button type="button" aria-label={t('fusion.toolbox.clear')} onClick={()=>setQuery('')}><X size={14}/></button>}</label>
        <nav ref={categories} className="fusion-tool-directory-categories" aria-label={t('fusion.tools.title')}>{TOOL_GROUPS.map(group=><button type="button" key={group} aria-pressed={selectedGroup===group} onClick={()=>{setSelectedGroup(group);setCollapsed(old=>({...old,[group]:false}));requestAnimationFrame(()=>directory.current?.querySelector('[data-category="'+group+'"]')?.scrollIntoView({block:'start'}));}}>{t('fusion.toolbox.groups.'+group)}</button>)}</nav>
      </div>
      {TOOL_GROUPS.map(group=>{const entries=matches.filter(item=>item.group===group);if(!entries.length)return null;const closed=!term&&collapsed[group]===true;
        return <section className="fusion-tool-category" data-category={group} key={group} aria-labelledby={'tool-category-'+group}>
          <button type="button" className="fusion-tool-category-heading" id={'tool-category-'+group} aria-expanded={!closed} aria-controls={'tool-category-grid-'+group} onClick={()=>setCollapsed(old=>({...old,[group]:!closed}))}>
            <strong>{t('fusion.toolbox.groups.'+group)}</strong><span>{t('fusion.toolbox.directory.count',{count:entries.length})}</span>
          </button>
          <div className="fusion-tool-catalog-grid" id={'tool-category-grid-'+group} hidden={closed}>{entries.map(item=><button type="button" className="fusion-tool-entry" key={item.id} data-tool={item.target} data-entry={item.id} data-function={item.tab} onClick={()=>select(item.target,item.tab)}>
            <span className="fusion-tool-entry-icon"><item.icon size={20} strokeWidth={1.6}/></span><span className="fusion-tool-entry-text"><strong>{t(item.label)}</strong><small title={item.functions.map(entry=>t(entry.label)).join(' / ')}>{item.functions.length?item.functions.map(entry=>t(entry.label)).join(' / '):t(item.description)}</small></span><ChevronRight className="fusion-tool-entry-arrow" size={16} aria-hidden="true"/>
          </button>)}</div>
        </section>;
      })}
      {!matches.length&&<p className="fusion-tool-directory-empty" role="status">{t('fusion.toolbox.noResults')}</p>}
    </div>
    {mountedPages.map(({id,context,key})=>{const definition=TOOL_REGISTRY.find(item=>item.id===id),Component=definition?.component,visible=id===view&&(id!=='collections'||context===collectionContext);return <div key={key} className="fusion-tool-content fusion-page" hidden={!visible}><ToolFrame toolId={id} visible={visible} standalone={context!=='tools'} onBack={back} presentation={definition?.presentation??'form'}><Suspense fallback={<div className="fusion-tool-loading" role="status" aria-label={t('maxExpand.loading')}/>}>{Component&&<Component workspace={context}/>}</Suspense></ToolFrame></div>;})}
  </section>;
}
