/*
 * FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors
 * Licensed under GPL-3.0. See LICENSE.
 */

/** @file useFusionVoice.ts @description Agent-routed microphone capture using eIsland PCM helpers. @author 鸡哥 */
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { getAudioContextCtor } from '../states/agentVoiceInput/utils/agentVoiceInputAudio';
import { pushFloat32Frames } from '../states/agentVoiceInput/utils/agentVoiceInputPcm';
import type { FusionProvider, SpeechStatus } from '../../../preload/types/fusionWorkspace';
import { useFusionPreferences } from './fusionPreferences';
import { Sound } from '../../vendor/coucou/core/sound';

/** Encodes a complete mono PCM16 recording in the native dsh WAV format. */
export function encodeVoiceWave(chunks: Int16Array[]): string {
  const count = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const data = new Uint8Array(44 + count * 2), view = new DataView(data.buffer);
  const label = (at: number, text: string): void => { for (let i = 0; i < text.length; i++) data[at + i] = text.charCodeAt(i); };
  label(0, 'RIFF'); view.setUint32(4, data.length - 8, true); label(8, 'WAVE'); label(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  label(36, 'data'); view.setUint32(40, count * 2, true);
  let offset = 44; for (const chunk of chunks) for (const sample of chunk) { view.setInt16(offset, sample, true); offset += 2; }
  let binary = ''; for (let at = 0; at < data.length; at += 8192) binary += String.fromCharCode(...data.subarray(at, at + 8192));
  return btoa(binary);
}

/** Binds recognition to the starting session and text; never submits a prompt automatically. */
export function useFusionVoice(provider: FusionProvider, sessionKey: string, visible: boolean, text: string, draftVersion: number, insert: (text: string) => void) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SpeechStatus | null>(null);
  const statusRef = useRef(status); statusRef.current = status;
  const [phase, setPhase] = useState<'idle' | 'permission' | 'recording' | 'transcribing'>('idle');
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (phase !== 'recording') return;
    const started = performance.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [phase]);
  type VoiceCapture = { stream?: MediaStream; context?: AudioContext; processor?: ScriptProcessorNode; chunks: Int16Array[]; timer?: number; requestId: string; text: string; version: number; selection?: SpeechStatus; generation: number; transcribing?: boolean };
  const capture = useRef<VoiceCapture | null>(null);
  const generation = useRef(0);
  const textRef = useRef(text); textRef.current = text;
  const versionRef = useRef(draftVersion); versionRef.current = draftVersion;
  const insertRef = useRef(insert); insertRef.current = insert;
  const preferences = useFusionPreferences(s => s.value);
  const release = (): void => {
    setLevel(0);
    const current = capture.current;
    if (!current) return;
    Sound.setSuppressed(current.requestId, false);
    if (current) {
      if (current.timer) window.clearTimeout(current.timer);
      if (current.processor) { current.processor.onaudioprocess = null; current.processor.disconnect(); }
      current.stream?.getTracks().forEach(track => track.stop());
      void current.context?.close().catch(() => {});
      void window.api.fusionReleaseMicrophone(current.requestId).catch(() => {});
    }
    void window.api.fusionVoiceGlow(false, false, current.requestId).catch(() => {});
  };
  const cancel = (): void => {
    generation.current++;
    const id = capture.current?.requestId;
    release(); capture.current = null;
    if (id) void window.api.fusionCancelTranscription(id).catch(() => {});
    setPhase('idle'); setPending('');
  };
  const stop = async (): Promise<void> => {
    const current = capture.current;
    if (!current || !current.processor || current.transcribing) return;
    current.transcribing = true;
    release(); setPhase('transcribing');
    try {
      const result = await window.api.fusionTranscribe(provider, current.requestId, encodeVoiceWave(current.chunks), current.selection);
      if (current.generation !== generation.current) return;
      if (versionRef.current !== current.version || textRef.current !== current.text) setPending(result);
      else insertRef.current([current.text, result].filter(Boolean).join('\n'));
    } catch (reason) { if (current.generation === generation.current) setError(String(reason)); }
    finally { if (current.generation === generation.current) { capture.current = null; setPhase('idle'); } }
  };
  const start = async (): Promise<void> => {
    if (phase !== 'idle' || capture.current || !visible) return;
    setError(''); setPending(''); setElapsed(0); const id = ++generation.current;
    const current = { chunks: [] as Int16Array[], requestId: crypto.randomUUID(), text: textRef.current, version: versionRef.current, generation: id } as VoiceCapture;
    capture.current = current; Sound.setSuppressed(current.requestId, true); setPhase('permission');
    try {
      const media = await window.api.fusionMediaCommand('pause-all');
      if (!media.paused && !media.muted) throw new Error('media-not-quiet');
      if (id !== generation.current) return;
      const available = await window.api.fusionSpeechStatus(provider); setStatus(available);
      if (id !== generation.current) return;
      if (!available.ready) throw new Error(available.reason || 'voice-unavailable');
      current.selection = available;
      await window.api.fusionClaimMicrophone(current.requestId);
      if (id !== generation.current) { await window.api.fusionReleaseMicrophone(current.requestId); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true } });
      if (id !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      current.stream = stream;
      const Audio = getAudioContextCtor(); if (!Audio) throw new Error('audio-context-unavailable');
      const context = new Audio({ sampleRate: 16000 }); current.context = context;
      await context.resume();
      if (id !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      if (context.sampleRate !== 16000) throw new Error('unsupported-audio-rate');
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(1024, 1, 1); current.processor = processor;
      let remainder: Float32Array<ArrayBufferLike> = new Float32Array(0);
      let lastMeter = 0;
      processor.onaudioprocess = event => {
        const samples = event.inputBuffer.getChannelData(0);
        if (performance.now() - lastMeter >= 60) {
          lastMeter = performance.now();
          let energy = 0; for (const sample of samples) energy += sample * sample;
          const next = Math.min(1, Math.sqrt(energy / samples.length) * 5);
          setLevel(previous => previous + (next - previous) * .35);
        }
        remainder = pushFloat32Frames({ input: samples, pending: remainder, frameSize: 320,
          onFrame: pcm => current.chunks.push(pcm) });
      };
      source.connect(processor); processor.connect(context.destination);
      if (preferences.voiceGlow) await window.api.fusionVoiceGlow(true, preferences.reducedMotion, current.requestId);
      if (id !== generation.current) { release(); return; }
      setPhase('recording');
      current.timer = window.setTimeout(() => { void stop(); }, Math.max(1, Math.min(available.maxDurationSeconds, (available.maxAudioBytes - 44) / 32000)) * 1000);
    } catch (reason) {
      if (id === generation.current) { release(); capture.current = null; setPhase('idle'); setError(String(reason)); }
    }
  };
  useEffect(() => {
    let active = true;
    setStatus(null); setError('');
    if (visible) void window.api.fusionSpeechStatus(provider).then(value => { if (active) setStatus(value); }).catch(() => {});
    const unsubscribe = window.api.onFusionSpeechStatus(event => {
      if (!active || event.provider !== provider || statusRef.current?.providerId === 'floatisland-local-sensevoice') return;
      setStatus(event.status);
      // 首次识别按需加载模型时，准备状态会变化；不能取消自身触发的识别。
      if (!event.status.ready && capture.current && (!capture.current.transcribing || !event.status.available || event.status.reason === 'dsh-disconnected')) cancel();
    });
    return () => { active = false; unsubscribe(); cancel(); };
  }, [provider, sessionKey, visible]);
  useEffect(() => {
    const interrupt = (): void => { if (capture.current) { cancel(); setError(t('fusion.voice.interrupted')); } };
    const unsubscribe = window.api.onFusionVoiceHidden(interrupt);
    const hidden = (): void => { if (document.hidden) interrupt(); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('beforeunload', cancel);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('beforeunload', cancel); };
  }, []);
  return { status, phase, error, pending, level, elapsed, start, stop, cancel,
    insertPending: () => { insertRef.current([textRef.current, pending].filter(Boolean).join('\n')); setPending(''); },
    discardPending: () => setPending('') };
}
