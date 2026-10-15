/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file fusionTools.ts @description 只向本地应用视图暴露有限工具命令。 @author 鸡哥 */
import { ipcRenderer, webUtils } from 'electron';
import type { FusionToolsApi } from './types/fusionTools';
import { fusionProductApi } from './fusionProduct';
import {fusionLibraryApi} from './fusionLibrary';
const listen = <T>(channel: string, callback: (value: T) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, value: T): void => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
export const fusionToolsApi: FusionToolsApi = {
  fusionTranslateText:(text,source,target,id)=>ipcRenderer.invoke('fusion:translation:text',text,source,target,id),
  fusionTranslateCancel:id=>ipcRenderer.invoke('fusion:translation:cancel',id),
  fusionMusicDownload:(ids,options)=>ipcRenderer.invoke('fusion:music:download',ids,options),
  fusionMusicQuality:(playback,download)=>ipcRenderer.invoke('fusion:music:quality',playback,download),
  fusionMusicArtwork:id=>ipcRenderer.invoke('fusion:music:artwork',id),
  fusionMusicRelocate:id=>ipcRenderer.invoke('fusion:music:relocate',id),
  fusionMusicState:()=>ipcRenderer.invoke('fusion:music:state'),
  fusionMusicSearch:(provider,query,page,requestId)=>ipcRenderer.invoke('fusion:music:search',provider,query,page,requestId),
  fusionMusicCancelSearch:()=>ipcRenderer.invoke('fusion:music:cancel-search'),
  fusionMusicControl:(command,value)=>ipcRenderer.invoke('fusion:music:control',command,value),
  fusionMusicImport:()=>ipcRenderer.invoke('fusion:music:import'),
  fusionMusicSources:()=>ipcRenderer.invoke('fusion:music:sources'),
  fusionMusicSourceImport:url=>ipcRenderer.invoke('fusion:music:source-import',url),
  fusionMusicSourceControl:(id,command,value)=>ipcRenderer.invoke('fusion:music:source-control',id,command,value),
  fusionMusicCandidates:id=>ipcRenderer.invoke('fusion:music:candidates',id),
  fusionMusicPlaylistFilePreview:()=>ipcRenderer.invoke('fusion:music:playlist-file-preview'),
  fusionMusicPlaylistExport:id=>ipcRenderer.invoke('fusion:music:playlist-export',id),
  fusionMusicPlaylistSearch:(id,query,page)=>ipcRenderer.invoke('fusion:music:playlist-search',id,query,page),
  fusionMusicPlaylistDiscover: (id,category,page)=>ipcRenderer.invoke('fusion:music:playlist-discover',id,category,page),
  fusionMusicPlaylistCategories: id=>ipcRenderer.invoke('fusion:music:playlist-categories',id),
  fusionMusicPlaylistPreview: (id,reference)=>ipcRenderer.invoke('fusion:music:playlist-preview',id,reference),
  fusionMusicPlaylistCommit: (id,selected)=>ipcRenderer.invoke('fusion:music:playlist-commit',id,selected),
  fusionMusicPlaylistImport:(id,url)=>ipcRenderer.invoke('fusion:music:playlist-import',id,url),
  onFusionMusicSearchBatch:callback=>listen('fusion:music:search-batch',callback),
  onFusionMusicSources:callback=>listen('fusion:music:sources',callback),
  onFusionMusicState:callback=>listen('fusion:music:changed',callback),
  ...fusionProductApi,
  ...fusionLibraryApi,
  fusionColorPick: command => ipcRenderer.invoke('fusion:color:pick', command),
  fusionFilesSelect: kind=>ipcRenderer.invoke('fusion:files:select',kind),
  fusionRenamePreview: (ids,options)=>ipcRenderer.invoke('fusion:files:rename-preview',ids,options),
  fusionRenameExecute: id=>ipcRenderer.invoke('fusion:files:rename-execute',id),
  fusionRenameUndo: ()=>ipcRenderer.invoke('fusion:files:rename-undo'),
  fusionArchiveList: id=>ipcRenderer.invoke('fusion:files:archive-list',id),
  fusionArchiveStart: (operation,ids,entries)=>ipcRenderer.invoke('fusion:files:archive-start',operation,ids,entries),
  fusionFileJobCancel: id=>ipcRenderer.invoke('fusion:files:cancel',id),
  onFusionFileJob: callback=>listen('fusion:files:job',callback),
  fusionStopwatchGet: ()=>ipcRenderer.invoke('fusion:stopwatch:get'),
  fusionStopwatchControl: action=>ipcRenderer.invoke('fusion:stopwatch:control',action),
  onFusionStopwatch: callback=>listen('fusion:stopwatch:updated',callback),
  fusionFitView: request => ipcRenderer.invoke('fusion:tools:fit', request),
  fusionToolData: () => ipcRenderer.invoke('fusion:tools:data'),
  fusionToolWrite: (kind, value) => ipcRenderer.invoke('fusion:tools:write', kind, value),
  onFusionToolData: callback => listen('fusion:tools:data-changed', callback),
  fusionWebState: () => ipcRenderer.invoke('fusion:web:state'),
  fusionWebNavigate: (kind, url) => ipcRenderer.invoke('fusion:web:navigate', kind, url),
  fusionWebAction: (kind, action) => ipcRenderer.invoke('fusion:web:action', kind, action),
  fusionWebAttach: (kind, rect) => ipcRenderer.invoke('fusion:web:attach', kind, rect),
  fusionVideoFile: file => {
    if (file === undefined) return ipcRenderer.invoke('fusion:web:file');
    const path = webUtils.getPathForFile(file);
    if (!path) return Promise.reject(new Error('file-not-authorized'));
    return ipcRenderer.invoke('fusion:web:file', path);
  },
  fusionMediaCommand: (command, value) => ipcRenderer.invoke('fusion:web:media', command, value),
  onFusionWebState: callback => listen('fusion:web:changed', callback),
  fusionFilePath: file => webUtils.getPathForFile(file),
};
