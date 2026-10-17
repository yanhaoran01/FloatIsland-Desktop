/* FloatIsland contributors. GPL-3.0. */
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';

/** Desktop launches do not inherit the PATH additions made by terminal profiles. */
export function resolveAgentExecutable(name: 'codex' | 'dsh', override?: string): string {
  const command = override || name;
  if (isAbsolute(command)) {
    if (!existsSync(command)) throw new Error(`${name}: executable not found: ${command}`);
    return command;
  }
  if (command.includes('/') || command.includes('\\')) throw new Error(`${name}: use an absolute executable path.`);
  const home = homedir();
  const local = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');
  const roaming = process.env.APPDATA || join(home, 'AppData', 'Roaming');
  const folders = [
    ...(process.env.PATH || '').split(delimiter).map(value => value.replace(/^"|"$/g, '')),
    join(home, '.local', 'bin'), join(home, '.cargo', 'bin'), join(home, 'scoop', 'shims'),
    join(roaming, 'npm'),
  ];
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const find = (directory: string): string | undefined => extensions.map(extension => join(directory, command + extension)).find(file => {
    try { return statSync(file).isFile(); } catch { return false; }
  });
  for (const folder of folders.filter(Boolean)) { const file = find(folder); if (file) return file; }
  if (!override && process.platform === 'win32') {
    if (name === 'codex') {
      const bin = join(local, 'OpenAI', 'Codex', 'bin');
      try {
        const versions = readdirSync(bin, { withFileTypes: true }).filter(entry => entry.isDirectory())
          .map(entry => join(bin, entry.name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
        for (const directory of [bin, ...versions]) { const file = find(directory); if (file) return file; }
      } catch { /* The CLI may instead be installed through npm or a package manager. */ }
    } else {
      for (const base of [local, join(home, 'AppData', 'Local')]) {
        const file = find(join(base, 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin'));
        if (file) return file;
      }
    }
  }
  throw new Error(`${name}: executable not found. Install ${name === 'codex' ? 'Codex' : 'DeepSeek Harness'} or set FUSION_${name.toUpperCase()}_EXECUTABLE to its absolute path.`);
}

/** Only batch launchers require cmd; native executables retain Node's argument escaping. */
export function spawnAgent(executable: string, args: string[]): ChildProcessWithoutNullStreams {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable)) {
    if (/[&|<>^%!\r\n"]/.test(executable) || args.some(arg => /[^\w:/.-]/.test(arg))) throw new Error('Unsupported agent command characters.');
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${executable}" ${args.join(' ')}"`], {
      windowsHide: true, windowsVerbatimArguments: true, stdio: 'pipe',
    });
  }
  return spawn(executable, args, { windowsHide: true, stdio: 'pipe' });
}

/** Batch launchers own a CLI process tree; killing only cmd leaves the bridge running. */
export async function stopAgent(child: ChildProcessWithoutNullStreams | null): Promise<void> {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    await new Promise<void>(resolve => execFile('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'],
      { windowsHide: true, timeout: 5000 }, () => { if (!child.killed) child.kill(); resolve(); }));
  } else child.kill();
  child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
}
