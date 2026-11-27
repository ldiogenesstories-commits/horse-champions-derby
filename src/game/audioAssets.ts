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
  file?: string;
  /** Several takes instead of one; a random one plays each time (keeps repeats from sounding robotic). */
  files?: string[];
  /** Minimum seconds between plays, for sounds that fire rapidly (like hoofbeats). */
  minGap?: number;
  /** Loudness trim, 0-1 (default 1). */
  volume?: number;
  /** Preload this music file at startup (good for short stings that must start instantly). */
  preload?: boolean;
  /** Shown on the Options > Credits screen. Required for CC-BY sources; a courtesy for CC0. */
  credit?: Credit | Credit[];
}

export interface Credit {
  title: string;
  by: string;
  url: string;
  /** e.g. 'CC BY 4.0' or 'CC0'. */
  license: string;
  /** What was changed, for CC-BY ('trimmed and converted'). */
  note?: string;
}

/** Short effects. Keys match the function names in sfx.ts. */
export const SOUNDS: Record<string, AudioEntry> = {
  // Call to the post (trumpet from "atpost.wav" by rdb, CC0), played on the pre-race screen.
  bugle: { file: 'sfx/at-post-trumpet.mp3', volume: 0.9, credit: { title: 'atpost.wav', by: 'rdb', url: 'https://freesound.org/s/63753/', license: 'CC0', note: 'trumpet only' } },
  // Ranch hoofbeats: two earth/grass surface takes, scaled by gait in hoofClop().
  hoofClop: { files: ['hoof/grass.mp3', 'hoof/ground.mp3'], volume: 0.8, minGap: 0.4, credit: [
    { title: 'SRS_Foley_Horse_Galloping.wav', by: 'StephenSaldanha', url: 'https://freesound.org/s/165532/', license: 'CC0' },
    { title: 'Single Horse Galopp', by: 'D4XX', url: 'https://freesound.org/s/564628/', license: 'CC0' },
  ] },
  // Whinnies from "Horse Sounds (SE515)" by MPooman (CC0), heard now and then in the barn and on the ranch.
  whinny: { files: ['sfx/whinny-1.mp3', 'sfx/whinny-2.mp3', 'sfx/whinny-3.mp3', 'sfx/whinny-4.mp3', 'sfx/whinny-5.mp3', 'sfx/whinny-6.mp3'], volume: 0.7, minGap: 8, credit: { title: 'Horse Sounds (SE515)', by: 'MPooman', url: 'https://freesound.org/s/681727/', license: 'CC0' } },
  // Little 8-bit jingle for an S-rank drill and for a new barn friend moving in.
  levelComplete: { file: 'sfx/level-complete.mp3', volume: 0.8, minGap: 2, credit: { title: '8-Bit Level Complete', by: 'Qvantor', url: 'https://freesound.org/s/878321/', license: 'CC0' } },
  // Horse Dollar coin: shop buys, stall purchases, Premier Partner fee and prize money.
  coin: { file: 'sfx/coin.mp3', volume: 0.8, minGap: 0.15, credit: { title: 'Coin_Misc_06', by: 'Valenspire', url: 'https://freesound.org/s/699535/', license: 'CC0' } },
  // More slots (add a file in public/audio/ and uncomment or add a line):
  // gateBell:     { file: 'sfx/gate-bell.mp3' },
  // crowdRoar:    { file: 'sfx/crowd-cheer.mp3' },
  // crowdRoarWin: { file: 'sfx/crowd-cheer-big.mp3' },
  // finishHit:    { file: 'sfx/finish-hit.mp3' },
  // logoChime:    { file: 'sfx/chime.mp3' },
  // curtainSwish: { file: 'sfx/curtain.mp3' },
  // naturePops:   { file: 'sfx/pops.mp3' },
  // cameraCut:    { file: 'sfx/camera-cut.mp3' },
  // 'critter:bird': { file: 'sfx/bird.mp3' },
};

/** Looping or one-shot music tracks, played with playMusic(key). */
export const MUSIC: Record<string, AudioEntry> = {
  // Victory fanfare for big races (the build and climax of the track, about 14 s).
  fanfareBig: { file: 'music/fanfare-big.mp3', volume: 0.85, preload: true, credit: { title: 'Superhero Fanfare', by: 'humanoide9000', url: 'https://freesound.org/s/505426/', license: 'CC BY 4.0', note: 'trimmed and converted' } },
  // fanfareRegular: { file: 'music/fanfare-regular.mp3' },  // for everyday wins (coming)
  // menu:    { file: 'music/menu.mp3', volume: 0.6 },
  // race:    { file: 'music/race.mp3' },
};

/** Every credit for audio files in use, de-duplicated, for the Credits screen. */
export function audioCredits(): Credit[] {
  const all = [...Object.values(SOUNDS), ...Object.values(MUSIC)].flatMap((e) => (e.credit ? [e.credit].flat() : []));
  return all.filter((c, i) => all.findIndex((d) => d.url === c.url) === i);
}

// ---------- loading ----------
// Buffers are cached by file path, so one file can serve several keys.
const buffers = new Map<string, AudioBuffer>();
const pending = new Map<string, Promise<AudioBuffer | null>>();
const failed = new Set<string>();
const lastPlayed = new Map<string, number>();

const urlFor = (file: string) => `${import.meta.env.BASE_URL}audio/${file}`;
const filesOf = (e: AudioEntry): string[] => e.files ?? (e.file ? [e.file] : []);

function load(file: string): Promise<AudioBuffer | null> {
  const have = buffers.get(file);
  if (have) return Promise.resolve(have);
  if (failed.has(file)) return Promise.resolve(null);
  let p = pending.get(file);
  if (!p) {
    const g = audioGraph();
    if (!g) return Promise.resolve(null); // audio not unlocked yet; try again after a tap
    p = fetch(urlFor(file))
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then((ab) => g.ctx.decodeAudioData(ab))
      .then((buf) => { buffers.set(file, buf); return buf; })
      .catch(() => { failed.add(file); return null; })
      .finally(() => pending.delete(file));
    pending.set(file, p);
  }
  return p;
}

/** Fetch and decode files ahead of time (runs once audio is unlocked by the first tap). */
export function preloadAudio(): void {
  for (const e of Object.values(SOUNDS)) for (const f of filesOf(e)) void load(f);
  for (const e of Object.values(MUSIC)) if (e.preload) for (const f of filesOf(e)) void load(f);
}

// ---------- sound effects ----------
/**
 * Play a sound effect from a file. Returns true if a file is handling it, so the
 * caller can skip its synthesized version; false means "use the synth fallback".
 * `scale` trims the loudness for this play (e.g. quieter hoofbeats at a walk).
 */
export function playSample(key: string, scale = 1): boolean {
  const e = SOUNDS[key];
  const g = audioGraph();
  if (!e || !g) return false;
  const ready = filesOf(e).filter((f) => buffers.has(f));
  if (!ready.length) {
    for (const f of filesOf(e)) void load(f); // first use: fetch now, synth covers this one play
    return false;
  }
  if (isMuted() || g.ctx.state !== 'running') return true;
  const t = g.ctx.currentTime;
  if (e.minGap && t - (lastPlayed.get(key) ?? -999) < e.minGap) return true;
  lastPlayed.set(key, t);
  const src = g.ctx.createBufferSource();
  src.buffer = buffers.get(ready[Math.floor(Math.random() * ready.length)])!;
  const gain = g.ctx.createGain();
  gain.gain.value = (e.volume ?? 1) * scale;
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
  const buf = e.file ? await load(e.file) : null;
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
