/* FloatIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FloatIsland contributors. GPL-3.0. */
/**
 * @file TurntablePlayer.tsx
 * @description 留声机风格的系统媒体面板：黑胶随播放旋转、唱臂随进度移动、歌词居中滚动。
 * @author 鸡哥
 */
import { useMemo, useRef, type CSSProperties, type JSX, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import useIslandStore from '../../../store/slices';
import type { SyncedLyricLine } from '../../../store/types';
import mark from '../../../assets/float-island.svg';
import './turntable.css';

/** 唱臂角度：停放位与唱片外沿、内沿。 */
const ARM_REST = -32, ARM_START = -4, ARM_END = 20;

/**
 * 找出当前播放位置对应的歌词行。
 * @param lyrics - 按时间排序的歌词。
 * @param positionMs - 当前播放位置。
 * @returns 行索引；前奏阶段返回 -1。
 */
function currentLine(lyrics: SyncedLyricLine[], positionMs: number): number {
  let lo = 0, hi = lyrics.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lyrics[mid].time_ms <= positionMs) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/**
 * 毫秒转为 m:ss。
 * @param ms - 毫秒。
 * @returns 格式化时长。
 */
function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * 黑胶唱盘：唱片随播放旋转，唱臂按进度从外沿移向内沿。
 * @param props - 播放状态、进度、封面与可选的自定义唱片标签。
 * @returns 纯装饰唱盘。
 */
export function VinylDeck({ playing, progress, cover, children }: { playing: boolean; progress: number; cover?: string; children?: ReactNode }): JSX.Element {
  const arm = playing ? ARM_START + (ARM_END - ARM_START) * Math.min(1, Math.max(0, progress)) : ARM_REST;
  return <div className="fi-deck" data-playing={playing} aria-hidden="true">
    <div className="fi-platter">
      <div className="fi-record">
        <div className="fi-record-label" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
          {children ?? (!cover && <img src={mark} alt="" />)}
        </div>
      </div>
      <div className="fi-record-sheen" />
      <span className="fi-spindle" />
    </div>
    <svg className="fi-tonearm" viewBox="0 0 60 220" style={{ transform: `rotate(${arm}deg)` }}>
      <defs>
        <linearGradient id="fi-arm" x1="0" x2="1"><stop offset="0" stopColor="#d9dde6" /><stop offset=".5" stopColor="#9aa1ae" /><stop offset="1" stopColor="#6f7684" /></linearGradient>
      </defs>
      <circle cx="30" cy="22" r="18" fill="#26282f" stroke="#3a3d46" strokeWidth="2" />
      <circle cx="30" cy="22" r="8" fill="url(#fi-arm)" />
      <path d="M30 24 L30 160 Q30 176 22 186" fill="none" stroke="url(#fi-arm)" strokeWidth="5" strokeLinecap="round" />
      <rect x="8" y="182" width="20" height="30" rx="4" transform="rotate(28 18 197)" fill="#c9ced8" />
    </svg>
  </div>;
}

/**
 * 留声机播放器。
 * @returns 媒体工具页内容。
 */
export function TurntablePlayer(): JSX.Element {
  const { t } = useTranslation();
  const active = useIslandStore(s => s.isMusicPlaying);
  const playing = useIslandStore(s => s.isPlaying);
  const info = useIslandStore(s => s.mediaInfo);
  const cover = useIslandStore(s => s.coverImage);
  const [r, g, b] = useIslandStore(s => s.dominantColor);
  const lyrics = useIslandStore(s => s.syncedLyrics);
  const position = useIslandStore(s => s.currentPositionMs);
  const duration = useIslandStore(s => s.currentDurationMs) || info.duration_ms;
  const bar = useRef<HTMLDivElement>(null);

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const index = useMemo(() => (lyrics?.length ? currentLine(lyrics, position) : -1), [lyrics, position]);
  const tint = active && (r + g + b) > 0 ? `${r}, ${g}, ${b}` : '150, 165, 255';

  const seek = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || !duration || !active) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    void window.api.mediaSeek(Math.round(ratio * duration));
  };

  return <div className="fi-turntable" data-active={active} data-playing={active && playing} style={{ '--tint': tint } as CSSProperties}>
    {cover && <div className="fi-turntable-backdrop" style={{ backgroundImage: `url(${cover})` }} aria-hidden="true" />}
    <VinylDeck playing={active && playing} progress={progress} cover={cover || undefined} />

    <section className="fi-turntable-info">
      <header>
        <h2 title={info.title}>{active && info.title ? info.title : t('songTab.meta.notPlaying')}</h2>
        <p title={info.artist}>{active ? info.artist || info.album : t('songTab.onboarding.hint')}</p>
      </header>

      <div className="fi-lyrics" aria-live="off">
        {lyrics?.length ? <ol style={{ '--line': Math.max(0, index) } as CSSProperties}>
          {lyrics.map((line, i) => <li key={line.time_ms + ':' + i} data-current={i === index} data-near={Math.abs(i - index) === 1}>{line.text || ' '}</li>)}
        </ol> : active && <span className="fi-lyrics-empty">{t('songTab.lyrics.enjoyMusic')}</span>}
      </div>

      <div className="fi-progress">
        <div ref={bar} className="fi-progress-track" role="slider" tabIndex={active ? 0 : -1}
          aria-label={t('fusion.media.progress')} aria-valuemin={0} aria-valuemax={Math.round(duration / 1000)} aria-valuenow={Math.round(position / 1000)}
          onPointerDown={seek}
          onKeyDown={event => {
            if (!active || !duration || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
            event.preventDefault();
            void window.api.mediaSeek(Math.max(0, Math.min(duration, position + (event.key === 'ArrowRight' ? 5000 : -5000))));
          }}>
          <span style={{ transform: `scaleX(${progress})` }} />
          <i style={{ left: `${progress * 100}%` }} />
        </div>
        <div className="fi-progress-time"><span>{clock(position)}</span><span>{clock(duration)}</span></div>
      </div>

      <div className="fi-controls">
        <button type="button" disabled={!active} aria-label={t('songTab.controls.prev')} title={t('songTab.controls.prev')} onClick={() => void window.api.mediaPrev()}><SkipBack size={18} fill="currentColor" /></button>
        <button type="button" className="fi-play" disabled={!active} aria-label={t(playing ? 'songTab.controls.pause' : 'songTab.controls.play')} title={t(playing ? 'songTab.controls.pause' : 'songTab.controls.play')} onClick={() => void window.api.mediaPlayPause()}>
          {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>
        <button type="button" disabled={!active} aria-label={t('songTab.controls.next')} title={t('songTab.controls.next')} onClick={() => void window.api.mediaNext()}><SkipForward size={18} fill="currentColor" /></button>
      </div>
    </section>
  </div>;
}
