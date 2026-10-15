import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';
import { spawn, type ChildProcess } from 'child_process';
import type { SpeechStatus } from '../../preload/types/fusionWorkspace';

/** Reuses the installed Harness recognizer and cached models without starting a chat host. */
export function createLocalSpeechService() {
  const dataRoot = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'speech-to-text', 'sensevoice');
  const resources = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Programs', 'DeepSeek Harness', 'resources');
  const executable = join(resources, '..', 'DeepSeek Harness.exe');
  const worker = join(resources, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-experimental-speech-to-text-sensevoice', 'lib', 'worker.js');
  const model = join(dataRoot, 'models', 'sensevoice-onnx', 'model.int8.onnx');
  const tokens = join(dataRoot, 'models', 'sensevoice-onnx', 'tokens.txt');
  const vad = join(dataRoot, 'models', 'silero', 'silero_vad.onnx');
  let child: ChildProcess | undefined;
  let starting: Promise<{ port: number; token: string }> | undefined;
  let idle: NodeJS.Timeout | undefined;
  const status = (): SpeechStatus => {
    const installed = existsSync(executable);
    const ready = installed && [model, tokens, vad].every(existsSync);
    return { available: installed, ready, providerId: 'floatisland-local-sensevoice', language: 'auto', reason: ready ? 'standby' : installed ? 'unprepared' : 'dsh-disconnected', maxAudioBytes: 4 * 1024 * 1024, maxDurationSeconds: 120 };
  };
  const stop = (): void => { clearTimeout(idle); child?.kill(); child = undefined; starting = undefined; };
  const start = () => starting ||= new Promise<{ port: number; token: string }>((resolve, reject) => {
    const token = randomBytes(32).toString('hex');
    const process = spawn(executable, [worker, JSON.stringify({ dataRoot, model, tokens, vad })], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...globalThis.process.env, ELECTRON_RUN_AS_NODE: '1', DSH_SPEECH_TOKEN: token },
    });
    child = process;
    let output = '', errors = '', settled = false;
    const timer = setTimeout(() => { reject(new Error('本地语音模型加载超时')); stop(); }, 60_000);
    process.stderr?.on('data', chunk => { errors = (errors + String(chunk)).slice(-1000); });
    process.stdout?.on('data', chunk => {
      output += String(chunk);
      const lines = output.split('\n'); output = lines.pop() || '';
      for (const line of lines) {
        try { const { port } = JSON.parse(line); if (!settled && Number.isInteger(port) && port > 0 && port < 65536) { settled = true; clearTimeout(timer); resolve({ port, token }); } } catch {}
      }
    });
    const fail = (): void => { clearTimeout(timer); if (!settled) reject(new Error('本地语音进程启动失败：' + errors)); if (child === process) { child = undefined; starting = undefined; } };
    process.once('error', fail); process.once('exit', fail);
  });
  return { status, stop, async transcribe(audioBase64: string, language: string | undefined, signal: AbortSignal): Promise<string> {
    if (!status().ready) throw new Error('本机尚未准备好语音识别模型');
    clearTimeout(idle);
    try {
      const worker = await start(); signal.throwIfAborted();
      const response = await fetch(`http://127.0.0.1:${worker.port}/transcribe?language=${encodeURIComponent(language || 'auto')}`, {
        method: 'POST', headers: { authorization: 'Bearer ' + worker.token, 'content-type': 'audio/wav' }, body: Buffer.from(audioBase64, 'base64'), signal,
      });
      const result = await response.json() as { text?: string; error?: string };
      if (!response.ok || result.error) throw new Error(result.error || '本地语音识别失败');
      return result.text || '';
    } catch (error) { stop(); throw error; }
    finally { idle = setTimeout(stop, 300_000); }
  } };
}
