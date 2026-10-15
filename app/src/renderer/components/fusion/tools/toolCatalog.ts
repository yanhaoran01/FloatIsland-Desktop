/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file toolCatalog.ts @description Named tool entries share canonical workspaces and histories. @author 鸡哥 */
import {AppWindow,Archive,BellRing,Binary,Bookmark,Braces,Calculator,CalendarClock,CalendarDays,CalendarHeart,Clapperboard,CircleDot,ClipboardList,ClipboardPen,CopyCheck,Crop,Dices,Diff,Earth,FileSearch,FileStack,FileText,FileVideo,FingerprintPattern,Focus,FolderHeart,FolderPen,Globe,History,Hourglass,Image,Images,KeyRound,Languages,LayoutDashboard,Link,ListChecks,Network,NotebookPen,Palette,Pin,QrCode,Regex,Rocket,Rss,Ruler,ScanText,ScrollText,Send,Sheet,Shrink,SquareDashed,Timer,Type,Workflow} from 'lucide-react';
import {TOOL_FUNCTIONS, TOOL_REGISTRY, type ToolDefinition} from './toolRegistry';

/** 每个目录入口独立图标，同一工具的子功能也能一眼区分。 */
const ENTRY_ICONS:Record<string,ToolDefinition['icon']>={
  'screenshot-region':SquareDashed,'screenshot-ocr':ScanText,'screenshot-scroll':ScrollText,'screenshot-pin':Pin,
  'clipboard-history':ClipboardList,'clipboard-templates':ClipboardPen,
  'collections-files':FolderHeart,'collections-all':Bookmark,'collections-workspaces':LayoutDashboard,'collections-feeds':Rss,'collections-scopes':FileSearch,
  'calculator-calculate':Calculator,'calculator-units':Ruler,qr:QrCode,random:Dices,
  'notes-notes':NotebookPen,'notes-todo':ListChecks,'notes-reminders':BellRing,
  browser:Globe,'video-play':Clapperboard,'video-record':CircleDot,'video-convert':FileVideo,
  'timer-countdown':Hourglass,'timer-stopwatch':Timer,'timer-focus':Focus,
  'dates-dates':CalendarDays,'dates-timestamp':CalendarClock,'dates-clock':Earth,'dates-anniversary':CalendarHeart,
  translation:Languages,'launcher-favorites':Rocket,'launcher-catalog':AppWindow,workflows:Workflow,
  'pdf-preview':FileText,'pdf-organize':FileStack,
  'image-edit':Crop,'image-convert':Images,'image-compress':Shrink,'image-history':History,'image-preview':Image,
  rename:FolderPen,zip:Archive,sharing:Send,'fileService-hash-hash':FingerprintPattern,'fileService-hash-duplicates':CopyCheck,
  'text-process':Type,'text-compare':Diff,'text-regex':Regex,colors:Palette,password:KeyRound,
  'encoding-json':Braces,'encoding-csv':Sheet,'encoding-base64':Binary,'encoding-url':Link,networkService:Network,
};

export interface ToolCatalogEntry {
  id:string;
  target:string;
  tab:string;
  group:ToolDefinition['group'];
  label:string;
  description:string;
  icon:ToolDefinition['icon'];
  keywords:string;
  functions:Array<{id:string;label:string}>;
  aliases:string[];
}

/** One directory card per canonical workspace; subfunctions stay visible inside and searchable. */
export const TOOL_CATALOG:ToolCatalogEntry[] = TOOL_REGISTRY
  .filter(tool=>!['music','download'].includes(tool.id))
  .map(tool=>{
    const functions=tool.id==='collections'
      ? TOOL_FUNCTIONS.collections.filter(entry=>['files','all','workspaces','feeds','scopes'].includes(entry.id))
      : TOOL_FUNCTIONS[tool.id]||[];
    const first=functions[0]?.id||'',firstId=tool.id+(first?'-'+first:'');
    return {id:tool.id,target:tool.id,tab:tool.id==='collections'?'all':first,group:tool.group,icon:ENTRY_ICONS[firstId]??tool.icon,keywords:tool.keywords,
      label:tool.label,description:tool.description||'fusion.toolbox.catalog.'+firstId+'.description',functions,
      aliases:(functions.length?functions:[{id:''}]).map(entry=>tool.id+(entry.id?'-'+entry.id:''))};
  });
