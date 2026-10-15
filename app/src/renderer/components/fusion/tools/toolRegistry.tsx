/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file toolRegistry.tsx @description 统一的工具导航、加载和布局定义。 @author 鸡哥 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Calculator, QrCode, StickyNote, Files, Text, Clock, Palette, KeyRound, Globe, Video, Clipboard, Camera, Timer, Music, Rocket, Languages, Download, History, Star, Languages as TranslateIcon, Fingerprint, Braces, Binary, Network, ImageDown, ArchiveRestore, Images, Film, Image, Dices, FolderPen, Archive, Share2, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TOOLBOX_NAV_CARDS, type ToolboxIndexCardId } from '../../states/maxExpand/components/tools/config/commonToolboxConfig';
export const TOOL_GROUPS = ['common', 'media', 'efficiency', 'file', 'development'] as const;
export type ToolPresentation = 'form'|'editor'|'canvas'|'list'|'media';
export type ToolInputKind='text'|'image'|'pdf'|'document'|'media'|'file';
export interface ToolDefinition { accepts?:ToolInputKind[];actions?:string[];produces?:ToolInputKind[];presentation?: ToolPresentation; id: string; group: typeof TOOL_GROUPS[number]; label: string; description?: string; icon: LucideIcon; keywords: string; layout: 'adaptive'|'web'|'video'; width: 560|880; component?: LazyExoticComponent<ComponentType<{workspace?:string}>>; }
const extra = (name: 'DateTool'|'ColorTool'|'PasswordTool') => lazy(() => import('./ExtraTools').then(module => ({default: () => {const Component=module[name];return <Component/>;}})));
const web = (kind: 'browser'|'video') => lazy(() => import('./WebTool').then(module => ({default: () => <module.WebTool kind={kind} />})));
const legacy = (id: string) => lazy(() => import('./LegacyTools').then(module => ({default: () => <module.LegacyTools id={id} />})));
const item = (id: string, group: ToolDefinition['group'], icon: LucideIcon, keywords: string, component?: ToolDefinition['component'], width: 560|880 = 560, layout: ToolDefinition['layout'] = 'adaptive'): ToolDefinition => ({id,group,icon,keywords,component,width,layout,label:'fusion.toolbox.items.'+id,description:'fusion.toolbox.descriptions.'+id});
const legacyIcons:Record<ToolboxIndexCardId,LucideIcon>={
 'download-create':Download,'download-history':History,software:Star,translate:TranslateIcon,
 'fileService-hash':Fingerprint,'encodingService-json':Braces,'encodingService-base64':Binary,
 networkService:Network,'fileCompression-imageCompression':ImageDown,'fileCompression-history':ArchiveRestore,
 'formatFactory-image':Images,'formatFactory-video':Film,
};
const daily=(name:'RandomTool')=>lazy(()=>import('./DailyTools').then(m=>({default:m[name]})));
const integrated=(name:'ImageUnified'|'PdfUnified'|'DownloadUnified'|'LauncherUnified'|'ProductFlows'|'EncodingUnified'|'TimeUnified'|'TextUnified'|'VideoUnified'|'DateUnified')=>lazy(()=>import('./UnifiedTools').then(m=>({default:m[name]})));
const file=(name:'RenameTool'|'ZipTool')=>lazy(()=>import('./FileTools').then(m=>({default:m[name]})));
const dailyLibrary=(name:'ClipboardUnified'|'NotesUnified'|'FingerprintUnified')=>lazy(()=>import('./DailyLibraryTools').then(m=>({default:m[name]})));
export const TOOL_ALIASES:Record<string,{id:string;tab:string}>={
 'anniversary':{id:'dates',tab:'anniversary'},recording:{id:'video',tab:'record'},'formatFactory-video':{id:'video',tab:'convert'},preview:{id:'collections',tab:'preview'},
 'urlFavorites':{id:'collections',tab:'all'},'url-favorites':{id:'collections',tab:'all'},'localFileSearch':{id:'collections',tab:'scopes'},'local-file-search':{id:'collections',tab:'scopes'},todo:{id:'notes',tab:'todo'},'clipboardHistory':{id:'clipboard',tab:'history'},
 'encodingService-json':{id:'encoding',tab:'json'},'encodingService-base64':{id:'encoding',tab:'base64'},'url-codec':{id:'encoding',tab:'url'},stopwatch:{id:'timer',tab:'stopwatch'},
 csv:{id:'encoding',tab:'csv'},regex:{id:'text',tab:'regex'},
 'image-edit':{id:'image',tab:'edit'},'fileCompression-imageCompression':{id:'image',tab:'compress'},'fileCompression-history':{id:'image',tab:'history'},'formatFactory-image':{id:'image',tab:'convert'},
 'download-create':{id:'download',tab:'file'},'download-history':{id:'download',tab:'history'},software:{id:'launcher',tab:'catalog'},translate:{id:'translation',tab:''},
};
/** Resolves old routes to the unique canonical page. @param id - Old or current id. @returns Canonical route. */
export function resolveToolTarget(id:string):{id:string;tab:string} {return TOOL_ALIASES[id]??{id,tab:''};}
/** 所有首页和恢复导航都使用稳定 ID；组件首次访问才加载。 */
export const TOOL_REGISTRY: ToolDefinition[] = [
 item('screenshot','common',Camera,'OCR 截图 screenshot',lazy(()=>import('./ProductCapture').then(m=>({default:m.ProductCapture})))), // i18n-exclude: bilingual search keywords; never displayed
 item('clipboard','common',Clipboard,'剪贴板 clipboard templates',dailyLibrary('ClipboardUnified')), // i18n-exclude: bilingual search keywords; never displayed
 item('collections','common',Star,'收藏 网址 文件 文件夹 书签 阅读 订阅 工作空间 favorites bookmarks files reader RSS workspace',lazy(()=>import('./LibraryTool').then(m=>({default:m.LibraryTool})))), // i18n-exclude: bilingual search keywords; never displayed
 item('calculator','common',Calculator,'math 计算 科学 单位 换算',lazy(()=>import('./CalculationTool').then(m=>({default:m.CalculationTool})))), // i18n-exclude: bilingual search keywords; never displayed
 item('qr','common',QrCode,'二维码 QR 扫码',lazy(()=>import('./QrTool').then(m=>({default:m.QrTool})))), // i18n-exclude: bilingual search keywords; never displayed
 item('notes','efficiency',StickyNote,'便签 待办 提醒 markdown note todo reminders',dailyLibrary('NotesUnified'),880), // i18n-exclude: bilingual search keywords; never displayed
 item('browser','media',Globe,'网页 浏览 browser bilibili youtube',web('browser'),880,'web'), // i18n-exclude: bilingual search keywords; never displayed
 item('video','media',Video,'视频 播放 mp4 webm bilibili youtube',integrated('VideoUnified'),880,'video'), // i18n-exclude: bilingual search keywords; never displayed
 item('music','media',Music,'音乐 music 歌曲 歌单 lyrics 网易 QQ 咪咕',lazy(()=>import('./MusicTool').then(m=>({default:m.MusicTool}))),880), // i18n-exclude: bilingual search keywords; never displayed
 item('timer','efficiency',Timer,'倒计时 番茄 秒表 timer stopwatch',integrated('TimeUnified')), // i18n-exclude: bilingual search keywords; never displayed
 item('dates','efficiency',Clock,'日期 时区 时间戳 timezone timestamp',integrated('DateUnified'),880), // i18n-exclude: bilingual search keywords; never displayed
 item('translation','efficiency',Languages,'翻译 translation',lazy(()=>import('../../states/expand/components/TranslationTab').then(m=>({default:m.TranslationTab})))), // i18n-exclude: bilingual search keywords; never displayed
 item('launcher','efficiency',Rocket,'启动 程序 launcher',integrated('LauncherUnified')), // i18n-exclude: bilingual search keywords; never displayed
 item('pdf','file',Files,'PDF 合并 提取 旋转 图片',integrated('PdfUnified'),880), // i18n-exclude: bilingual search keywords; never displayed
 item('text','development',Text,'文本 对比 正则 表达式 匹配 diff replace regex',integrated('TextUnified'),880), // i18n-exclude: bilingual search keywords; never displayed
 item('colors','development',Palette,'取色 配色 HEX RGB HSL',extra('ColorTool')), // i18n-exclude: bilingual search keywords; never displayed
 item('password','development',KeyRound,'密码 UUID password',extra('PasswordTool')), // i18n-exclude: bilingual search keywords; never displayed
 item('image','file',Image,'图片 裁剪 标注 压缩 转换 crop annotate compress convert',integrated('ImageUnified')), // i18n-exclude: bilingual search keywords; never displayed
 item('random','common',Dices,'抽签 随机 名单 random pick',daily('RandomTool')), // i18n-exclude: bilingual search keywords; never displayed
 item('rename','file',FolderPen,'批量 重命名 文件 rename',file('RenameTool')), // i18n-exclude: bilingual search keywords; never displayed
 item('zip','file',Archive,'ZIP 压缩 解压 archive',file('ZipTool')), // i18n-exclude: bilingual search keywords; never displayed
 item('encoding','development',Binary,'CSV JSON Base64 URL 表格 编码 解码 地址 参数 url encode table',integrated('EncodingUnified')), // i18n-exclude: bilingual search keywords; never displayed
 item('download','file',Download,'download history',integrated('DownloadUnified')),
 item('workflows','efficiency',Workflow,'workflow automation steps',lazy(()=>import('./ProductFlows').then(m=>({default:m.ProductFlows})))),
 item('sharing','file',Share2,'LocalSend LAN transfer',lazy(()=>import('./ProductSharing').then(m=>({default:m.ProductSharing})))),
 ...TOOLBOX_NAV_CARDS.filter(card=>!TOOL_ALIASES[card.id]).map(card=>({id:card.id,group:(card.sidebar==='encodingService'||card.sidebar==='networkService'?'development':card.sidebar==='translate'||card.sidebar==='software'?'efficiency':'file') as ToolDefinition['group'],label:card.labelKey,description:card.descKey,icon:legacyIcons[card.id],keywords:card.id,layout:'adaptive' as const,width:880 as const,component:card.id==='fileService-hash'?dailyLibrary('FingerprintUnified'):legacy(card.id)})),
];

for(const [oldId,target] of Object.entries(TOOL_ALIASES)){const tool=TOOL_REGISTRY.find(item=>item.id===target.id);if(tool)tool.keywords+=" "+oldId;}

// Content presentation is independent from native window sizing.
const presentations:Record<ToolPresentation,readonly string[]>={form:['calculator','qr','dates','colors','password','random','timer','anniversary'],editor:['text','encoding','notes','translation'],canvas:['image','pdf','preview','screenshot'],list:['collections','download','zip','rename','clipboard','todo','launcher','sharing','workflows','fileService-hash','networkService'],media:['video','browser','local-video','music','recording']};
for(const tool of TOOL_REGISTRY)tool.presentation=(Object.keys(presentations) as ToolPresentation[]).find(kind=>presentations[kind].includes(tool.id))??'form';
const contracts:Record<string,{accepts:ToolInputKind[];actions:string[];produces:ToolInputKind[]}>= {
 colors:{accepts:['image'],actions:['pick','palette'],produces:['text']},
 screenshot:{accepts:['image'],actions:['region','ocr','scroll','pin'],produces:['image','text']},
 text:{accepts:['text'],actions:['process','compare','regex'],produces:['text']},
 encoding:{accepts:['text','file'],actions:['json','csv','base64','url'],produces:['text','file']},
 translation:{accepts:['text'],actions:['translate'],produces:['text']},
 qr:{accepts:['text','image'],actions:['generate','recognize'],produces:['image','text']},
 image:{accepts:['image'],actions:['edit','convert','compress'],produces:['image']},
 pdf:{accepts:['pdf','image'],actions:['preview','organize'],produces:['pdf','image']},
 calculator:{accepts:['text'],actions:['calculate','units'],produces:['text']},
 random:{accepts:['text'],actions:['draw'],produces:['text']},
 video:{accepts:['media'],actions:['play','record','convert'],produces:['media']},
 browser:{accepts:['text'],actions:['navigate'],produces:['file']},
 download:{accepts:['text','file'],actions:['file','media','torrent','history'],produces:['file']},
 collections:{accepts:['file','document','pdf','text'],actions:['open','collect'],produces:['file']},
 zip:{accepts:['file'],actions:['compress','extract'],produces:['file']},
 rename:{accepts:['file'],actions:['preview','execute','undo'],produces:['file']},
 'fileService-hash':{accepts:['file'],actions:['hash','duplicates'],produces:['text']},
 sharing:{accepts:['file','text'],actions:['send','receive'],produces:['file','text']},
};
for(const tool of TOOL_REGISTRY)Object.assign(tool,contracts[tool.id]||{accepts:[],actions:[],produces:[]});
/** Suggestions only choose a tool; processing always waits for an explicit user action. */
export function toolsForInput(kind:ToolInputKind):ToolDefinition[]{return TOOL_REGISTRY.filter(tool=>tool.accepts?.includes(kind));}

/** Canonical subfunctions used by both route validation and global search. */
export const TOOL_FUNCTIONS:Record<string,Array<{id:string;label:string}>>={
 screenshot:['region','ocr','scroll','pin'].map(id=>({id,label:'fusion.toolbox.catalog.screenshot-'+id+'.name'})),
 calculator:['calculate','units'].map(id=>({id,label:'fusion.toolbox.workspace.'+id})),
 dates:[...['dates','timestamp','clock'].map(id=>({id,label:'fusion.toolbox.workspace.'+id})),{id:'anniversary',label:'fusion.toolbox.items.anniversary'}],
 notes:['notes','todo','reminders'].map(id=>({id,label:'fusion.library.tabs.'+id})),
 'fileService-hash':['hash','duplicates'].map(id=>({id,label:'fusion.library.'+id})),
 image:['edit','convert','compress','history','preview'].map(id=>({id,label:'fusion.product.tabs.'+id})),
 pdf:['preview','organize'].map(id=>({id,label:'fusion.product.tabs.'+id})),
 download:['file','media','torrent','history'].map(id=>({id,label:'fusion.download.tabs.'+id})),
 encoding:['json','csv','base64','url'].map(id=>({id,label:'fusion.product.tabs.'+id})),
 text:[{id:'process',label:'fusion.toolbox.workspace.process'},{id:'compare',label:'fusion.toolbox.compare'},{id:'regex',label:'fusion.product.tabs.regex'}],
 timer:[{id:'countdown',label:'fusion.product.tabs.countdown'},{id:'stopwatch',label:'fusion.product.tabs.stopwatch'},{id:'focus',label:'fusion.library.focus'}],
 video:['play','record','convert'].map(id=>({id,label:'fusion.product.tabs.'+id})),
 launcher:['favorites','catalog'].map(id=>({id,label:'fusion.product.tabs.'+id})),
 clipboard:[{id:'history',label:'fusion.toolbox.items.clipboard'},{id:'templates',label:'fusion.library.templates'}],
 collections:[...['files','all','reading','books','sources','workspaces','feeds','scopes'].map(id=>({id,label:'fusion.library.tabs.'+id})),{id:'search',label:'fusion.reader.search'},{id:'preview',label:'fusion.product.tabs.preview'}],
};
/** Accepts known subfunctions and durable item references. @param id - Module. @param tab - Function. @returns Route validity. */
export function validToolFunction(id:string,tab:string):boolean{
 if(!tab)return true;if(id==='workflows')return true;
 if(id==='collections'&&/^(article|item|workspace):[\w-]{1,100}$/.test(tab))return true;
 if(id==='clipboard'&&/^templates:[\w-]{1,100}$/.test(tab))return true;
 if(id==='notes'&&/^notes:[\w-]{1,100}$/.test(tab))return true;
 if(id==='timer'&&/^focus:[\w-]{1,100}$/.test(tab))return true;
 const functions=TOOL_FUNCTIONS[id];return !functions||functions.some(value=>value.id===tab);
}
