import type { FusionFileToolsApi } from './fusionFileTools';
import type { FusionProductApi } from './fusionProduct';
import type { FusionMusicApi } from './fusionMusic';
import type {FusionLibraryApi} from './fusionLibrary';
/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file fusionTools.ts @description 工具、网页和媒体的受限共享契约。 @author 鸡哥 */
export type WebKind = 'browser' | 'video';
export type ViewLayout = 'chat' | 'adaptive' | 'web' | 'video' | 'voice' | 'strip';
export interface FitRequest { mode: ViewLayout; width: number; height: number; page: string; sequence?: number; }
export interface WebRect { x: number; y: number; width: number; height: number; }
export interface WebSnapshot {
  kind: WebKind; url: string; title: string; loading: boolean; error: string;
  back: boolean; forward: boolean; active: boolean; playing: boolean; muted: boolean;
  controllable: boolean; time: number; duration: number; width: number; height: number;
}
export interface ToolNote {tags?:string[]; id: string; title: string; text: string; updated: number; }
export interface ToolBookmark { id: string; title: string; url: string; }
export interface ToolData { version: 1; revision: number; notes: ToolNote[]; colors: string[]; bookmarks: ToolBookmark[]; }
export interface MediaControlResult { paused: boolean; muted: boolean; controllable: boolean; }
export type MediaCommand = 'play' | 'pause' | 'pause-all' | 'toggle' | 'mute' | 'seek' | 'rate' | 'close';
export interface FusionToolsApi extends FusionFileToolsApi,FusionProductApi,FusionMusicApi,FusionLibraryApi {
  fusionTranslateText:(text:string,source:string,target:string,requestId:string)=>Promise<{targetText:string;source:string;target:string;requestId:string}>;
  fusionTranslateCancel:(requestId:string)=>Promise<void>;
  fusionColorPick: (command: 'start' | 'cancel') => Promise<string | null>;
  fusionFitView: (request: FitRequest) => Promise<{ width: number; height: number } | null>;
  fusionToolData: () => Promise<ToolData>;
  fusionToolWrite: (kind: 'note' | 'deleteNote' | 'colors' | 'bookmark' | 'deleteBookmark', value: unknown) => Promise<ToolData>;
  onFusionToolData: (callback: (data: ToolData) => void) => () => void;
  fusionWebState: () => Promise<WebSnapshot[]>;
  fusionWebNavigate: (kind: WebKind, url: string) => Promise<void>;
  fusionWebAction: (kind: WebKind, action: 'back' | 'forward' | 'reload' | 'external' | 'clear') => Promise<void>;
  fusionWebAttach: (kind: WebKind, rect: WebRect | null) => Promise<void>;
  fusionVideoFile: (file?: File) => Promise<boolean>;
  fusionMediaCommand: (command: MediaCommand, value?: number) => Promise<MediaControlResult>;
  onFusionWebState: (callback: (state: WebSnapshot[]) => void) => () => void;
  fusionFilePath: (file: File) => string;
}
