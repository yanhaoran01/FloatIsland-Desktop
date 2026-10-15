/* FloatIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file localAgentDiscovery.ts @description Bounded local installation and Kimi process discovery. */
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { discoverWorkBuddy } from './workBuddyConfig';
import type { FusionLocalAgent, FusionEchoCodexSession } from '../../preload/types/fusion';
const execute = promisify(execFile);

/** Detects executable shims and config directories without reading credentials or changing the Agent. */
export function createLocalAgentDiscovery() {
  let agents: FusionLocalAgent[] = [];
  let sessions: FusionEchoCodexSession[] = [];
  let scanning: Promise<void> | undefined;
  let windows = new Map<string, number>();
  const hasCommand = (name: string): boolean => {
    const paths = [...(process.env.PATH || '').split(';').map(path => path.replace(/^"|"$/g, '')),
      join(homedir(), '.local', 'bin'), join(homedir(), '.cargo', 'bin'),
      join(homedir(), 'AppData', 'Roaming', 'npm'), join(homedir(), 'scoop', 'shims')];
    return paths.filter(Boolean).some(path => ['.exe', '.cmd', '.bat', '.ps1', ''].some(extension => existsSync(join(path, name + extension))));
  };
  const scan = (): Promise<void> => scanning ||= (async () => {
    const workbuddy = await discoverWorkBuddy();
    agents = [
      { source: 'claude', name: 'Claude Code', installed: hasCommand('claude'), configured: existsSync(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')) },
      { source: 'workbuddy', name: 'WorkBuddy', installed: Boolean(workbuddy.executable && existsSync(workbuddy.executable)), configured: existsSync(workbuddy.configDir) },
      { source: 'kimi', name: 'Kimi Code', installed: hasCommand('kimi') || existsSync(join(process.env.LOCALAPPDATA || '', 'Programs', 'Kimi Code', 'Kimi Code.exe')), configured: existsSync(process.env.KIMI_HOME || join(homedir(), '.kimi')) },
      { source: 'gemini', name: 'Gemini CLI', installed: hasCommand('gemini'), configured: existsSync(join(homedir(), '.gemini')) },
      { source: 'glm', name: 'GLM CLI', installed: hasCommand('glm'), configured: existsSync(join(homedir(), '.glm')) },
      { source: 'openclaw', name: 'OpenClaw', installed: hasCommand('openclaw'), configured: existsSync(join(homedir(), '.openclaw')) },
      { source: 'cursor', name: 'Cursor', installed: hasCommand('cursor') || existsSync(join(process.env.LOCALAPPDATA || '', 'Programs', 'Cursor', 'Cursor.exe')), configured: existsSync(join(process.env.APPDATA || '', 'Cursor')) },
      { source: 'vscode', name: 'Visual Studio Code', installed: hasCommand('code') || existsSync(join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe')), configured: existsSync(join(process.env.APPDATA || '', 'Code')) },
      { source: 'trae', name: 'Trae', installed: hasCommand('trae') || existsSync(join(process.env.LOCALAPPDATA || '', 'Programs', 'Trae', 'Trae.exe')), configured: existsSync(join(process.env.APPDATA || '', 'Trae')) },
    ];
    // Return only PID/window metadata, never process command lines or authentication arguments.
    try {
      const script = "$items = @(Get-CimInstance Win32_Process -Filter \"Name LIKE 'kimi%.exe' OR Name='python.exe' OR Name='pythonw.exe' OR Name='uv.exe' OR Name='node.exe'\" | Where-Object {$_.Name -like 'kimi*.exe' -or $_.CommandLine -match '(?:[\\\\/]kimi(?:_cli)?[\\\\/]|[\\\\/]kimi(?:\\.exe)?(?:\"|\\s|$)|-m\\s+kimi_cli)'} | ForEach-Object {$p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; [pscustomobject]@{pid=$_.ProcessId;window=([string]$p.MainWindowTitle);handle=([long]$p.MainWindowHandle)}}); ConvertTo-Json -InputObject $items -Compress";
      const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 6000, maxBuffer: 65536 });
      const parsed = JSON.parse(stdout || '[]') as { pid: number; window: string; handle: number } | Array<{ pid: number; window: string; handle: number }> | null;
      const values = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
      const nextWindows = new Map<string, number>();
      sessions = values.filter(value => Number.isSafeInteger(value.pid) && value.pid > 0).map(value => {
        const id = 'kimi-process-' + value.pid;
        if (Number.isSafeInteger(value.handle) && value.handle > 0) nextWindows.set(id, value.handle);
        return { source: 'kimi', sessionId: id, key: 'kimi:' + id, cwd: null, projectName: 'Kimi Code', model: null,
          status: 'ApplicationOpen', currentTool: null, lastUserPrompt: null, lastAssistantMessage: null,
          lastActivity: null, windowTitle: value.window || null, capabilities: { focus: nextWindows.has(id), chat: false, approve: false } };
      });
      windows = nextWindows;
    } catch { sessions = []; windows.clear(); }
  })().finally(() => { scanning = undefined; });
  return {
    scan,
    snapshot: () => ({ agents, sessions }),
    clear: (): void => { sessions = []; windows.clear(); },
    async focus(id: string): Promise<boolean> {
      const handle = windows.get(id); if (!handle) return false;
      const script = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class FloatIslandAgentWindow{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindowAsync(IntPtr h,int n);}';[FloatIslandAgentWindow]::ShowWindowAsync([IntPtr]${handle},9)|Out-Null;if(-not [FloatIslandAgentWindow]::SetForegroundWindow([IntPtr]${handle})){exit 1}`;
      try { await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000 }); return true; } catch { return false; }
    },
  };
}
