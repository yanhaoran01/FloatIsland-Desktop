/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file fusionIntegrationService.ts @description Incremental Agent integration installation with per-change backups. @author 鸡哥 */
import { app, ipcMain, shell } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { isFusionView } from './fusionWindows';
import {discoverWorkBuddy,workBuddyRoot,registerWorkBuddyConfig} from './workBuddyConfig';

type Integration = 'codex' | 'claude' | 'dsh' | 'workbuddy';
const events = {
  workbuddy: ['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure','Stop','StopFailure','PermissionRequest','PermissionDenied','Elicitation','Notification','SubagentStart','SubagentStop'],
  codex: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'],
  claude: ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'PermissionRequest', 'PermissionDenied', 'Elicitation', 'Notification', 'SubagentStart', 'SubagentStop'],
};
const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
const read = (file: string): string => existsSync(file) ? readFileSync(file, 'utf8') : '';
const atomic = (file: string, text: string): void => {
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file + '.fusion.tmp', text); renameSync(file + '.fusion.tmp', file);
};

/** Exposes explicit install/remove controls; discovery itself never modifies Agent configuration. */
export function registerFusionIntegrations(): void {
  registerWorkBuddyConfig();
  const data = join(app.getPath('userData'), 'integrations');
  const resources = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
  const codexRoot = process.env.CODEX_HOME || join(homedir(), '.codex');
  const claudeRoot = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const dshRoot = process.env.DSH_HOME || join(homedir(), '.dsh');
  const files: Record<Integration, string> = { codex: join(codexRoot, 'hooks.json'), claude: join(claudeRoot, 'settings.json'), dsh: join(dshRoot, 'profiles/desktop/cordis.patch.yml'), workbuddy:join(workBuddyRoot(),'settings.json') };
  const status = () => (['codex', 'claude', 'dsh','workbuddy'] as Integration[]).map(source => ({
    source, installed: read(files[source]).includes(source === 'dsh' ? '# FUSIONISLAND:BEGIN managed bridge' : 'fusion-island-' + source + '-hook.cmd'),
    configured: existsSync(dirname(files[source])), configPath: files[source],
  }));
  const install = (source: Integration, remove: boolean) => {
    if (!Object.hasOwn(files, source)) throw new Error('invalid-integration');
    const file = files[source], original = read(file);
    const backup = join(data, 'backups', Date.now() + '-' + source);
    mkdirSync(backup, { recursive: true });
    if (existsSync(file)) copyFileSync(file, join(backup, 'config.backup'));
    if (source === 'dsh') {
      if (!existsSync(dirname(file))) throw new Error('deepseek-harness-profile-not-found');
      const clean = original.replace(/^# FUSIONISLAND:BEGIN managed bridge\r?\n[\s\S]*?^# FUSIONISLAND:END managed bridge\r?\n?/gm, '');
      let next = clean;
      if (!remove) {
        const sourceRoot = app.isPackaged ? join(resources, 'dsh-plugin') : join(app.getAppPath(), '../dsh-plugin');
        const targetRoot = join(dshRoot, 'local-plugins/fusion-island-bridge');
        mkdirSync(targetRoot, { recursive: true });
        for (const name of ['index.mjs', 'package.json']) {
          const target = join(targetRoot, name);
          if (existsSync(target)) copyFileSync(target, join(backup, name));
          copyFileSync(join(sourceRoot, name), target);
        }
        const quote = (value: string): string => "'" + value.replaceAll('\\', '/').replaceAll("'", "''") + "'";
        const connection = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'FusionIsland/dsh-bridge.json');
        next = clean.replace(/^\s*\[\]\s*$/gm, '').trimEnd() + '\n# FUSIONISLAND:BEGIN managed bridge\n- insert:\n    - id: fusion-island-bridge\n      name: ' +
          quote(join(targetRoot, 'index.mjs')) + '\n      config:\n        connectionFile: ' + quote(connection) + '\n# FUSIONISLAND:END managed bridge\n';
      }
      if (!next.replace(/^\s*#.*$/gm, '').trim()) next += '\n[]\n';
      if (read(file) !== original) throw new Error('integration-config-changed');
      atomic(file, next);
      return { backup, restartRequired: true };
    }
    const root = original.trim() ? JSON.parse(original.replace(/^\uFEFF/,'')) : {};
    if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('invalid-hooks-config');
    root.hooks ||= {};
    const runtime = join(data, source);
    const wrapper = join(runtime, 'fusion-island-' + source + '-hook.cmd');
    const command = 'cmd /d /s /c ""' + wrapper.replaceAll('\\', '/') + '""';
    // Filter individual hooks, preserving any third-party hooks in the same matcher group.
    for (const [event, groups] of Object.entries(root.hooks)) {
      if (!Array.isArray(groups)) throw new Error('invalid-hook-groups');
      root.hooks[event] = groups.flatMap(group => {
        if (!Array.isArray(group.hooks)) return [group];
        const hooks = group.hooks.filter((hook: { command?: string }) => hook.command !== command);
        return hooks.length ? [{ ...group, hooks }] : [];
      });
    }
    if (!remove) {
      mkdirSync(runtime, { recursive: true });
      const binary = join(runtime, 'fusion-hook.exe');
      copyFileSync(join(resources, 'echoisland/fusion-hook.exe'), binary);
      const escape = (value: string): string => value.replaceAll('%', '%%');
      atomic(wrapper, '@echo off\r\nset "FUSION_ECHO_CONNECTION=' + escape(join(app.getPath('userData'), 'echo-runtime/connection.json')) +
        '"\r\n"' + escape(binary) + '" --source ' + source + (source === 'codex' ? ' >nul 2>nul' : '') + '\r\nexit /b 0\r\n');
      for (const event of events[source]) {
        root.hooks[event] ||= [];
        root.hooks[event].push({ ...(source === 'claude' ? { matcher: '' } : {}), hooks: [{ type: 'command', command,
          timeout: source!=='workbuddy'&&['PermissionRequest', 'Elicitation', 'Notification'].includes(event) ? 86400 : 5 }] });
      }
    }
    if (read(file) !== original) throw new Error('integration-config-changed');
    atomic(file, JSON.stringify(root, null, 2) + '\n');
    if (source === 'codex') {
      const configFile = join(codexRoot, 'config.toml'), receiptFile = join(data, 'codex-feature.json');
      const current = read(configFile);
      if (!remove) {
        let next = current;
        const section = /^\[features\][^\r\n]*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m;
        if (section.test(next)) next = next.replace(section, (whole, body: string) =>
          /^\s*hooks\s*=/m.test(body) ? whole.replace(/^(\s*hooks\s*=\s*)(true|false)/m, '$1true') : whole + 'hooks = true\n');
        else next += '\n[features]\nhooks = true\n';
        if (next !== current) {
          atomic(join(backup, 'config.toml'), current); atomic(configFile, next);
          atomic(receiptFile, JSON.stringify({ backup: join(backup, 'config.toml'), installedHash: hash(next) }));
        }
      } else if (existsSync(receiptFile)) {
        const receipt = JSON.parse(read(receiptFile));
        if (hash(current) === receipt.installedHash) atomic(configFile, read(receipt.backup));
      }
    }
    return { backup, restartRequired: true };
  };
  ipcMain.handle('fusion:integrations:list', async event => { if (!isFusionView(event.sender)) throw new Error('untrusted-view'); await discoverWorkBuddy();files.workbuddy=join(workBuddyRoot(),'settings.json');return status(); });
  ipcMain.handle('fusion:integrations:change', (event, source: Integration, remove = false) => {
    if (!isFusionView(event.sender)) throw new Error('untrusted-view');
    files.workbuddy=join(workBuddyRoot(),'settings.json');return install(source, remove);
  });
  ipcMain.handle('fusion:integrations:open', async (event, source: Integration) => {
    files.workbuddy=join(workBuddyRoot(),'settings.json');
    if (!isFusionView(event.sender) || !Object.hasOwn(files, source)) throw new Error('invalid-integration');
    const error = await shell.openPath(dirname(files[source]));
    if (error) throw new Error(error);
  });
}
