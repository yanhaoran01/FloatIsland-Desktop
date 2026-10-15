/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file workspaceNavigation.ts @description Versioned persistent page and tool routes. @author 鸡哥 */
import {TOOL_GROUPS, TOOL_REGISTRY, resolveToolTarget,validToolFunction} from './tools/toolRegistry';
export const WORKSPACE_PAGES=['chat','tools','music','reading','download'] as const;
export type WorkspacePage=typeof WORKSPACE_PAGES[number];
export interface WorkspaceNavigation {version:3;page:'aiChat'|'toolbox'|'fusionSessions';islandPage:WorkspacePage;group:typeof TOOL_GROUPS[number];target:string;tab:string;query:string;searchSelection:string;}
const defaults:WorkspaceNavigation={version:3,page:'aiChat',islandPage:'chat',group:'common',target:'',tab:'',query:'',searchSelection:''};
const key='float.workspace-navigation.v3';
/** Chooses the visible main page for a canonical tool route.
 * @param id - Canonical module.
 * @param tab - Optional subfunction.
 * @returns Main workspace page.
 */
export function workspacePageForTool(id:string,tab=''):WorkspacePage {
  return id==='music'?'music':id==='download'?'download':id==='collections'&&(['books','sources','search','reading'].includes(tab)||tab.startsWith('article:'))?'reading':'tools';
}
/** Validates persisted routes and migrates canonical legacy entries. @param input - Stored value. @returns Safe route. */
export function normalizeWorkspaceNavigation(input:unknown):WorkspaceNavigation {
  const row=input&&typeof input==='object'?input as Record<string,unknown>:{};
  const route=resolveToolTarget(typeof row.target==='string'?row.target:'');
  const tool=TOOL_REGISTRY.find(item=>item.id===route.id);
  const tab=typeof row.tab==='string'&&row.tab?row.tab.slice(0,500):route.tab;
  const invalid=Boolean(route.id&&(!tool||!validToolFunction(route.id,tab)));
  if(invalid)return {...defaults};
  const islandPage=WORKSPACE_PAGES.includes(row.islandPage as WorkspacePage)?row.islandPage as WorkspacePage:tool?workspacePageForTool(tool.id,tab):row.page==='toolbox'?'tools':'chat';
  return {...defaults,page:row.page==='toolbox'||row.page==='fusionSessions'?row.page:'aiChat',islandPage,group:tool?.group??(TOOL_GROUPS.includes(row.group as WorkspaceNavigation['group'])?row.group as WorkspaceNavigation['group']:'common'),target:tool?.id||'',tab:tool?tab:'',query:typeof row.query==='string'?row.query.slice(0,1000):'',searchSelection:typeof row.searchSelection==='string'?row.searchSelection.slice(0,1000):''};
}
/** Reads a valid route without opening transient UI or acquiring devices. @returns Restored page. */
export function readWorkspaceNavigation():WorkspaceNavigation {
  try {const saved=localStorage.getItem(key);if(saved)return normalizeWorkspaceNavigation(JSON.parse(saved));
    const previous=localStorage.getItem('float.workspace-navigation.v2');
    const legacy=JSON.parse(previous||localStorage.getItem('float.navigation.v1')||'{}');
    const view=localStorage.getItem('fusion.island-view');
    const islandPage=WORKSPACE_PAGES.includes(view as WorkspacePage)?view:legacy.target?workspacePageForTool(resolveToolTarget(legacy.target).id,legacy.tab||''):TOOL_GROUPS.includes(view as WorkspaceNavigation['group'])?'tools':undefined;
    return normalizeWorkspaceNavigation({...legacy,islandPage,page:legacy.page||(legacy.target||islandPage==='tools'?'toolbox':'aiChat'),group:legacy.group||localStorage.getItem('fusion.workbench-group')});
  } catch {return {...defaults};}
}
/** Stores page changes and tool routes atomically; temporary menus are excluded. @param patch - Durable changes. */
export function writeWorkspaceNavigation(patch:Partial<WorkspaceNavigation>):void {
  try {localStorage.setItem(key,JSON.stringify(normalizeWorkspaceNavigation({...readWorkspaceNavigation(),...patch})));} catch {/* Navigation remains usable when storage is full. */}
}
