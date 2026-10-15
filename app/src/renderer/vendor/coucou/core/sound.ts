/*
 * Coucou resources reused by FusionIsland for the user's personal desktop build.
 * https://github.com/Louis-CFM/coucou
 * Copyright (C) 2026 Louis Raillé (original sound names and media).
 * Copyright (C) 2026 FusionIsland contributors (Electron playback adapter).
 * Adapter: GPL-3.0. Sound assets retain their separate LICENSE-ASSETS.md terms.
 */

/**
 * @file sound.ts
 * @description Plays the original WAV resources through media URLs that also work in packaged Electron file pages.
 * @author 鸡哥
 */

export const SOUND_NAMES = [
  'peek', 'open', 'close', 'hover', 'blip', 'slap', 'annoyed', 'dizzy', 'greet',
  'work', 'finish', 'error', 'approval', 'question', 'approve', 'gulp', 'tick',
  'send', 'love', 'pop', 'proud', 'wink', 'yawn', 'attach', 'think', 'search',
  'rate', 'sleep', 'greeting',
] as const;

type SoundName = (typeof SOUND_NAMES)[number];

class SoundEngine {
  private enabled = true;
  private visible = false;
  private visibleOwners = new Set<object | string>();
  private active = new Set<HTMLAudioElement>();
  private suppressedOwners = new Set<string>();

  /** Temporarily suppresses pet cues without changing the user's mute preference. */
  setSuppressed(owner: string, suppressed: boolean): void {
    if (suppressed) this.suppressedOwners.add(owner); else this.suppressedOwners.delete(owner);
    if (this.suppressedOwners.size) this.idle();
  }

  /** Silences cues while the companion's canvas is outside the visible workspace. */
  setActive(visible: boolean, owner: object | string = 'default'): void {
    if (visible) this.visibleOwners.add(owner); else this.visibleOwners.delete(owner);
    this.visible = this.visibleOwners.size > 0;
    if (!this.visible) this.idle();
  }

  /** Applies the shared mute preference and stops already-playing cues when muted. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.idle();
  }

  /** Releases media playback when the pet is hidden or unmounted. */
  idle(): void {
    this.active.forEach((audio) => audio.pause());
    this.active.clear();
  }

  /** Plays an upstream cue at Coucou's original default volume without fetching file URLs. */
  play(name: SoundName | string): void {
    if (!this.visible || !this.enabled || this.suppressedOwners.size || document.hidden || !SOUND_NAMES.includes(name as SoundName)) return;
    const audio = new Audio(new URL(`./coucou/sounds/${name}.wav`, document.baseURI).href);
    audio.volume = 0.12;
    this.active.add(audio);
    const release = (): void => { this.active.delete(audio); };
    audio.addEventListener('ended', release, { once: true });
    audio.addEventListener('error', release, { once: true });
    void audio.play().catch(release);
  }
}

export const Sound = new SoundEngine();
