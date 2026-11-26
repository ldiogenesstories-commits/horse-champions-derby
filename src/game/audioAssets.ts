// Real audio files (royalty-free sound effects and music) layered on top of the
// synthesized sounds in sfx.ts.
//
// How it works
// - Drop files in public/audio/ (NOT src/, or the single-file build inlines them as base64).
// - Add one line to SOUNDS or MUSIC below. Nothing else changes.
// - Any sound with no entry (or whose file fails to load) falls back to the
//   synthesized version in sfx.ts, so the game never goes silent.
// - Everything routes through the shared audio graph, so Mute and master volume work.
//
// Formats: MP3 or M4A/AAC (safest on phones). Keep music ~128 kbps and under ~2 MB.
import { audioGraph, isMuted } from './sfx';

export interface AudioEntry {
  /** Path under public/audio/, e.g. 'sfx/gate-bell.mp3'. */
  file: string;
  /** Loudness trim, 0-1 (default 1). */
  volume?: number;
  /** Shown on the Options > Credits screen (required for CC-BY sources). */
  credit?: string;
}

/** Short effects. Keys match the function names in sfx.ts. */
export const SOUNDS: Record<string, AudioEntry> = {
  // gateBell:   { file: 'sfx/gate-bell.mp3', volume: 0.9, credit: '"Gate bell" by Name (CC0)' },
  // crowdRoar:  { file: 'sfx/crowd-cheer.mp3' },
  // crowdRoarWin: { file: 'sfx/crowd-cheer-big.mp3' },
  // bugle:      { file: 'sfx/bugle.mp3' },
  // finishHit:  { file: 'sfx/finish-hit.mp3' },
  // logoChime:  { file: 'sfx/chime.mp3' },
  // curtainSwish: { file: 'sfx/curtain.mp3' },
  // naturePops: { file: 'sfx/pops.mp3' },
  // cameraCut:  { file: 'sfx/camera-cut.mp3' },
  // 'critter:bird': { file: 'sfx/bird.mp3' },
};

/** Looping or one-shot music tracks, played with playMusic(key). */
export const MUSIC: Record<string, AudioEntry> = {
  // menu:    { file: 'music/menu.mp3', volume: 0.6, credit: '"Title" by Artist (CC-BY 4.0)' },
  // race:    { file: 'music/race.mp3' },
  // victory: { file: 'music/victory.mp3' },
};

/** Credit lines for everything in use, for the Credits screen. */
export function audioCredits(): string[] {
  const all = [...Object.values(SOUNDS), ...Object.values(MUSIC)];
  return [...new Set(all.map((e) => e.credit).filter((c): c is string => !!c))];
}

// ---------- loading ----------
const buffers = new Map<string, AudioBuffer>();
const pending = new Map<string, Promise<AudioBuffer | null>>();
const failed = new Set<string>();

const urlFor = (e: AudioEntry) => `${import.meta.env.BASE_URL}audio/${e.file}`;

function load(id: string, e: AudioEntry): Promise<AudioBuffer | null> {
  const have = buffers.get(id);
  if (have) return Promise.resolve(have);
  if (failed.has(id)) return Promise.resolve(null);
  let p = pending.get(id);
  if (!p) {
    const g = audioGraph();
    if (!g) return Promise.resolve(null); // audio not unlocked yet; try again after a tap
    p = fetch(urlFor(e))
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then((ab) => g.ctx.decodeAudioData(ab))
      .then((buf) => { buffers.set(id, buf); return buf; })
      .catch(() => { failed.add(id); return null; })
      .finally(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}

/** Fetch and decode files ahead of time (call after the first tap, e.g. on the home menu). */
export function preloadAudio(): void {
  for (const [k, e] of Object.entries(SOUNDS)) void load('s:' + k, e);
}

// ---------- sound effects ----------
/**
 * Play a sound effect from a file. Returns true if a file is handling it, so the
 * caller can skip its synthesized version; false means "use the synth fallback".
 */
export function playSample(key: string): boolean {
  const e = SOUNDS[key];
  const g = audioGraph();
  if (!e || !g || failed.has('s:' + key)) return false;
  const buf = buffers.get('s:' + key);
  if (!buf) {
    void load('s:' + key, e); // first use: fetch now, synth covers this one play
    return false;
  }
  if (isMuted() || g.ctx.state !== 'running') return true;
  const src = g.ctx.createBufferSource();
  src.buffer = buf;
  const gain = g.ctx.createGain();
  gain.gain.value = e.volume ?? 1;
  src.connect(gain).connect(g.out);
  src.start();
  return true;
}

// ---------- music ----------
let current: { key: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let wanted: string | null = null;

/** Start a music track (cross-fades from whatever is playing). No-op if no file is set. */
export async function playMusic(key: string, opts: { loop?: boolean; fade?: number } = {}): Promise<void> {
  const e = MUSIC[key];
  const g = audioGraph();
  if (!e || !g) return;
  if (current?.key === key) return;
  wanted = key;
  const buf = await load('m:' + key, e);
  if (!buf || wanted !== key) return; // failed, or a newer request won
  const fade = opts.fade ?? 1.2;
  const t = g.ctx.currentTime;
  stopMusic(fade);
  const src = g.ctx.createBufferSource();
  src.buffer = buf;
  src.loop = opts.loop ?? true;
  const gain = g.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(e.volume ?? 1, t + fade);
  src.connect(gain).connect(g.out);
  src.start(t);
  current = { key, src, gain };
  src.onended = () => { if (current?.src === src) current = null; };
}

/** Fade out and stop the current music. */
export function stopMusic(fade = 0.8): void {
  const g = audioGraph();
  const cur = current;
  wanted = null;
  if (!cur || !g) return;
  current = null;
  const t = g.ctx.currentTime;
  cur.gain.gain.cancelScheduledValues(t);
  cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
  cur.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
  cur.src.stop(t + fade + 0.05);
}
