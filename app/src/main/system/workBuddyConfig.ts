/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file workBuddyConfig.ts @description Local WorkBuddy selection and bounded historical metadata discovery. @author 鸡哥 */
import {app,ipcMain,shell} from 'electron';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,readdirSync,openSync,readSync,closeSync,fstatSync} from 'fs';
import {homedir} from 'os';import {join,basename,isAbsolute} from 'path';
import {execFile} from 'child_process';import {promisify} from 'util';
import {isFusionView} from './fusionWindows';
import type {WorkBuddyConfig} from '../../preload/types/fusionWorkspace';
import type {FusionEchoCodexSession} from '../../preload/types/fusion';
const execute=promisify(execFile);
let cached:WorkBuddyConfig|null=null;
const file=():string=>join(app.getPath('userData'),'eIsland_store','workbuddy.json');
/** Discovers real installations and prefers the running edition; reads no account credentials. */
export async function discoverWorkBuddy():Promise<WorkBuddyConfig> {
  if(cached)return structuredClone(cached);
  let paths:string[]=[];
  try{const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$live = @(Get-Process -Name WorkBuddy,WorkBuddyAI -ErrorAction SilentlyContinue | ForEach-Object {$_.Path}); $installed = @(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -match '^WorkBuddy(?: AI)?(?: |$)'} | Sort-Object @{Expression={$_.DisplayName -like 'WorkBuddy AI*'}} | ForEach-Object {($_.DisplayIcon -replace ',0$','').Trim('\"')}); @($live + $installed) | ConvertTo-Json -Compress"],{windowsHide:true,timeout:5000,maxBuffer:65536});
    const values:unknown=JSON.parse(stdout);paths=(Array.isArray(values)?values:[values]).filter((value):value is string=>typeof value==='string'&&existsSync(value));
  }catch{/* Registry unavailable; the manual configuration remains usable. */}
  paths=[...new Set([...paths,...[join(process.env.LOCALAPPDATA||homedir(),'Programs/WorkBuddy/WorkBuddy.exe'),join(process.env.ProgramFiles||'C:/Program Files','WorkBuddy/WorkBuddy.exe')].filter(existsSync)])];
  const executable=paths[0]??'',edition=/WorkBuddyAI/i.test(executable)?'intl':'cn';
  cached={version:1,edition,executable,configDir:process.env.WORKBUDDY_CONFIG_DIR||join(homedir(),'.workbuddy'),candidates:paths};
  try{const saved:unknown=JSON.parse(readFileSync(file(),'utf8'));if(saved&&typeof saved==='object'&&'version'in saved&&saved.version===1&&'executable'in saved&&typeof saved.executable==='string'&&'configDir'in saved&&typeof saved.configDir==='string'&&isAbsolute(saved.configDir)&&'edition'in saved&&(saved.edition==='cn'||saved.edition==='intl'))cached={...cached,executable:saved.executable,configDir:saved.configDir,edition:saved.edition};}catch{/* Default configuration. */}
  return structuredClone(cached);
}
/** Gets the already-discovered config root without spawning anything. */
export function workBuddyRoot():string {return cached?.configDir||process.env.WORKBUDDY_CONFIG_DIR||join(homedir(),'.workbuddy');}
/** Opens the selected local app; no session is resumed or submitted. */
export async function openWorkBuddy():Promise<boolean> {const config=await discoverWorkBuddy();if(!config.executable||!existsSync(config.executable))return false;return !(await shell.openPath(config.executable));}
/** Reports a live WorkBuddy lease only when its owner PID still exists. */
export function workBuddyAlive():boolean {
  try{for(const entry of readdirSync(join(workBuddyRoot(),'sessions'))){if(!entry.endsWith('.json'))continue;const record=JSON.parse(readFileSync(join(workBuddyRoot(),'sessions',entry),'utf8'));if(Number.isSafeInteger(record.pid)&&record.pid>0){try{process.kill(record.pid,0);return true;}catch{/* Expired lease. */}}}}catch{/* No live lease. */}return false;
}
/** Reads bounded first/last transcript blocks for session titles; never executes transcript content. */
export function workBuddyHistory():FusionEchoCodexSession[] {
  const values:FusionEchoCodexSession[]=[];
  const scan=(dir:string,depth:number):void=>{try{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isSymbolicLink())continue;if(entry.isDirectory()&&depth>0){scan(path,depth-1);continue;}if(!entry.isFile()||!entry.name.endsWith('.jsonl'))continue;
    let text='';try{const fd=openSync(path,'r');try{const size=fstatSync(fd).size,buffer=Buffer.alloc(65536);const count=readSync(fd,buffer,0,buffer.length,0);text=buffer.subarray(0,count).toString('utf8');if(size>buffer.length){const tail=readSync(fd,buffer,0,buffer.length,Math.max(buffer.length,size-buffer.length));text+='\n'+buffer.subarray(0,tail).toString('utf8');}}finally{closeSync(fd);}}catch{continue;}
    let id='',title='',cwd='',stamp='';for(const line of text.split('\n')){try{const record=JSON.parse(line);if(typeof record.sessionId==='string')id=record.sessionId;if(record.type==='ai-title'&&typeof record.aiTitle==='string')title=record.aiTitle;if(typeof record.cwd==='string')cwd=record.cwd;if(typeof record.timestamp==='string')stamp=record.timestamp;}catch{/* Partial JSONL records are ignored. */}}
    if(id)values.push({sessionId:id,key:'workbuddy:'+id,source:'workbuddy',cwd:cwd||null,projectName:title||basename(cwd)||null,model:null,status:'Restored',currentTool:null,lastUserPrompt:null,lastAssistantMessage:null,lastActivity:stamp||null,windowTitle:null,capabilities:{focus:true,chat:false,approve:false}});
  }}catch{/* Missing or locked transcript directories. */}};
  scan(join(workBuddyRoot(),'projects'),2);return values;
}
/** Installs restricted selection controls, preserving existing WorkBuddy settings. */
export function registerWorkBuddyConfig():void {
  ipcMain.handle('fusion:workbuddy:get',event=>{if(!isFusionView(event.sender))throw Error('untrusted-view');return discoverWorkBuddy();});
  ipcMain.handle('fusion:workbuddy:save',async(event,value:WorkBuddyConfig)=>{
    if(!isFusionView(event.sender)||!value||value.version!==1||!['cn','intl'].includes(value.edition)||typeof value.executable!=='string'||!isAbsolute(value.executable)||!existsSync(value.executable)||!/^WorkBuddy(?:AI)?\.exe$/i.test(basename(value.executable))||typeof value.configDir!=='string'||!isAbsolute(value.configDir)||!existsSync(value.configDir))throw Error('invalid-workbuddy-config');
    const previous=await discoverWorkBuddy();const installed=join(previous.configDir,'settings.json');
    if(previous.configDir!==value.configDir&&existsSync(installed)&&readFileSync(installed,'utf8').includes('fusion-island-workbuddy-hook.cmd'))throw Error('workbuddy-remove-before-changing-root');
    cached={...previous,edition:value.edition,executable:value.executable,configDir:value.configDir};
    mkdirSync(join(app.getPath('userData'),'eIsland_store'),{recursive:true});writeFileSync(file()+'.tmp',JSON.stringify(cached));renameSync(file()+'.tmp',file());return structuredClone(cached);
  });
}
