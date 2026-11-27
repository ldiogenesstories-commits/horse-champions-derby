// Sound effects, all synthesized live with the Web Audio API: no audio files, so
// nothing to license or download. Each effect is a small recipe of oscillators,
// filtered noise and envelopes.

import { playMusic, playSample, preloadAudio } from './audioAssets';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = (() => { try { return localStorage.getItem('hcd-muted') === '1'; } catch { return false; } })();

/** Browsers only allow audio after a tap; call this from any user gesture. */
export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    preloadAudio(); // fetch any real sound files now that audio is unlocked
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** The shared audio graph, for longer pieces of music (null until a tap has unlocked audio). */
export function audioGraph(): { ctx: AudioContext; out: GainNode } | null {
  return ctx && master ? { ctx, out: master } : null;
}

export const isMuted = () => muted;
export function setMuted(m: boolean): void {
  muted = m;
  try { localStorage.setItem('hcd-muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.05);
}

const ready = () => !!ctx && !!master && !muted && ctx.state === 'running';

// ---------- building blocks ----------
function env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function noise(t: number, dur: number, filter: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack = 0.02, dest: AudioNode = master!): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bq = c.createBiquadFilter();
  bq.type = filter;
  bq.Q.value = q;
  bq.frequency.setValueAtTime(f0, t);
  bq.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  env(g, t, peak, attack, Math.max(0, dur - attack - dur * 0.4), dur * 0.4);
  src.connect(bq).connect(g).connect(dest);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

function tone(t: number, freq: number, dur: number, type: OscillatorType, peak: number, opts: { slideTo?: number; attack?: number; vibrato?: number; lowpass?: number } = {}): void {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
  let node: AudioNode = o;
  if (opts.vibrato) {
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.value = opts.vibrato;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
  }
  if (opts.lowpass) {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = opts.lowpass;
    node = node.connect(lp);
  }
  const g = c.createGain();
  const a = opts.attack ?? 0.01;
  env(g, t, peak, a, Math.max(0, dur - a - 0.08), 0.08);
  node.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const now = () => ctx!.currentTime + 0.01;

// ---------- the effects ----------

/** Heavy velvet sweeping across: a filtered-noise whoosh with a fabric rustle. */
export function curtainSwish(opening = false): void {
  if (playSample('curtainSwish')) return;
  if (!ready()) return;
  const t = now();
  noise(t, 0.65, 'bandpass', opening ? 1800 : 500, opening ? 500 : 1800, 0.9, 0.35, 0.12);
  noise(t + 0.05, 0.5, 'highpass', 3000, 5000, 0.5, 0.06, 0.08); // rustle
  if (!opening) tone(t + 0.6, 70, 0.18, 'sine', 0.35, { slideTo: 45 }); // soft thud as the halves meet
}

/** A little music-box chime when the logo appears. */
export function logoChime(): void {
  if (playSample('logoChime')) return;
  if (!ready()) return;
  const t = now();
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
    tone(t + i * 0.07, f, 0.6, 'sine', 0.12);
    tone(t + i * 0.07, f * 2.01, 0.25, 'sine', 0.03);
  });
}

/** Grass and flowers popping up, with a couple of birds. */
export function naturePops(): void {
  if (playSample('naturePops')) return;
  if (!ready()) return;
  const t = now();
  for (let i = 0; i < 14; i++) {
    const at = t + i * 0.045 + Math.random() * 0.02;
    const f = 300 + Math.random() * 500 + i * 30;
    tone(at, f, 0.09, 'sine', 0.12, { slideTo: f * 2.2 });
  }
  for (let b = 0; b < 2; b++) {
    const bt = t + 0.35 + b * 0.32;
    for (let k = 0; k < 3; k++) tone(bt + k * 0.07, 2600 + Math.random() * 600, 0.06, 'sine', 0.05, { slideTo: 3600 + Math.random() * 500 });
  }
}

/** An original bugle fanfare on the natural notes of a bugle (C-G-C-E-G). */
export function bugle(): void {
  if (playSample('bugle')) return;
  if (!ready()) return;
  const t = now();
  const G4 = 392, C5 = 523.3, E5 = 659.3, G5 = 784;
  const notes: [number, number, number][] = [
    [G4, 0, 0.16], [C5, 0.18, 0.16], [E5, 0.36, 0.16], [G5, 0.54, 0.34],
    [E5, 0.92, 0.14], [G5, 1.08, 0.14], [E5, 1.24, 0.14], [C5, 1.4, 0.14],
    [G4, 1.58, 0.22], [C5, 1.84, 0.22], [E5, 2.1, 0.22], [G5, 2.36, 0.22], [C5 * 2, 2.62, 0.7],
  ];
  for (const [f, at, d] of notes) {
    tone(t + at, f, d, 'sawtooth', 0.09, { attack: 0.03, vibrato: 3, lowpass: 2200 });
    tone(t + at, f, d, 'square', 0.025, { attack: 0.03, lowpass: 1400 });
  }
}

/** The starting bell as the gates fly open. */
export function gateBell(): void {
  if (playSample('gateBell')) return;
  if (!ready()) return;
  const t = now();
  for (let i = 0; i < 6; i++) {
    tone(t + i * 0.09, 1480, 0.08, 'triangle', 0.13);
    tone(t + i * 0.09, 2960 * 1.003, 0.05, 'sine', 0.04);
  }
  noise(t + 0.2, 0.5, 'lowpass', 400, 200, 0.7, 0.12, 0.01); // gates clanging open
}

/** The comic "POW" as the finish panel slams in. */
export function finishHit(): void {
  if (playSample('finishHit')) return;
  if (!ready()) return;
  const t = now();
  tone(t, 160, 0.3, 'sine', 0.6, { slideTo: 40 });
  noise(t, 0.25, 'lowpass', 6000, 800, 0.5, 0.35, 0.003);
}

/** The crowd: a roar that swells and fades; bigger, with whistles and a fanfare, for a win. */
export function crowdRoar(win = false, top3 = false): void {
  if (playSample(win ? 'crowdRoarWin' : 'crowdRoar')) return;
  if (!ready()) return;
  const t = now();
  const peak = win ? 0.32 : top3 ? 0.22 : 0.12;
  const dur = win ? 3.2 : 2.2;
  noise(t, dur, 'bandpass', 900, 700, 0.6, peak, 0.35);
  noise(t, dur, 'bandpass', 1900, 1500, 1.2, peak * 0.5, 0.4);
  // Individual cheers popping out of the crowd.
  const cheers = win ? 10 : top3 ? 5 : 2;
  for (let i = 0; i < cheers; i++) {
    const at = t + 0.2 + Math.random() * (dur - 0.8);
    const f = 280 + Math.random() * 260;
    tone(at, f, 0.35, 'sawtooth', 0.025, { slideTo: f * 1.35, attack: 0.05, lowpass: 1200, vibrato: 8 });
  }
  if (win) {
    for (let w = 0; w < 2; w++) tone(t + 0.5 + w * 0.7, 2200, 0.4, 'sine', 0.05, { slideTo: 3100 });
    const at = t + 0.25;
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(at + i * 0.12, f, i === 3 ? 0.7 : 0.14, 'sawtooth', 0.06, { attack: 0.02, lowpass: 2400, vibrato: 3 }));
  }
}

// ---------- Live race soundscape (TV broadcast) ----------

/** A quick camera-cut whoosh between broadcast shots. */
export function cameraCut(): void {
  if (playSample('cameraCut')) return;
  if (!ready()) return;
  noise(now(), 0.18, 'bandpass', 2500, 900, 1.2, 0.07, 0.01);
}

/** Sound for a comic-panel cut-in, by what happened. */
export function cutIn(code: string): void {
  if (!ready()) return;
  const t = now();
  if (code === 'stumble') {
    // The crowd gasps.
    noise(t, 0.6, 'bandpass', 1400, 600, 1.5, 0.18, 0.04);
    tone(t, 520, 0.4, 'triangle', 0.08, { slideTo: 260 });
    return;
  }
  // Comic "BAM": a short punch and a bright stinger.
  tone(t, 140, 0.2, 'sine', 0.4, { slideTo: 55 });
  noise(t, 0.15, 'lowpass', 5000, 900, 0.5, 0.2, 0.003);
  const up = code === 'stretch' || code === 'finalLap';
  [0, 1].forEach((i) => tone(t + 0.05 + i * 0.08, (up ? 659.3 : 784) * (i ? 1.5 : 1), 0.18, 'sawtooth', 0.05, { lowpass: 2600 }));
}

/** The final-stretch freeze: everything drops out, a rising whoosh, then the slam. */
export function freezeBeat(len: number): void {
  if (!ready()) return;
  const t = now();
  tone(t, 90, 0.25, 'sine', 0.45, { slideTo: 40 });
  noise(t, 0.12, 'lowpass', 7000, 1500, 0.5, 0.25, 0.003);
  noise(t + 0.1, len - 0.15, 'bandpass', 300, 3200, 2, 0.12, len * 0.7); // rising whoosh
  tone(t + 0.1, 110, len - 0.15, 'sawtooth', 0.04, { slideTo: 440, attack: len * 0.6, lowpass: 900 });
  // The slam as the race snaps back.
  tone(t + len, 120, 0.3, 'sine', 0.5, { slideTo: 45 });
  noise(t + len, 0.3, 'lowpass', 6000, 700, 0.5, 0.3, 0.003);
}

/** A crowd that murmurs at the start and builds to a roar, plus galloping hooves. */
export class RaceAmbience {
  private crowdG: GainNode | null = null;
  private crowdHiG: GainNode | null = null;
  private srcs: AudioBufferSourceNode[] = [];
  private timer = 0;
  private nextBeat = 0;
  private beat = 0;
  private crowd = 0.2;
  private hoof = 0.5;
  private tempo = 1; // gallop strides per second ≈ 2.2 * tempo
  private duckUntil = 0;

  start(): void {
    this.stop();
    if (!ctx || !master || !noiseBuf) return;
    const c = ctx;
    const mk = (f: number, q: number) => {
      const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const bq = c.createBiquadFilter(); bq.type = 'bandpass'; bq.frequency.value = f; bq.Q.value = q;
      const g = c.createGain(); g.gain.value = 0.0001;
      s.connect(bq).connect(g).connect(master!);
      s.start(c.currentTime, Math.random() * 1.5);
      this.srcs.push(s);
      return g;
    };
    this.crowdG = mk(800, 0.6);
    this.crowdHiG = mk(1800, 1.1);
    this.nextBeat = c.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 40);
    this.apply();
  }

  /** crowd: 0 (murmur) .. 1 (roar); hooves: 0 (silent) .. 1 (right by the rail). */
  set(crowd: number, hooves: number, tempo = 1): void {
    this.crowd = Math.max(0, Math.min(1, crowd));
    this.hoof = Math.max(0, Math.min(1, hooves));
    this.tempo = tempo;
    this.apply();
  }

  /** Drop the crowd out for a moment (the freeze-frame), then let it rush back. */
  duck(seconds: number): void {
    if (!ctx) return;
    this.duckUntil = ctx.currentTime + seconds;
    for (const g of [this.crowdG, this.crowdHiG]) g?.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
    window.setTimeout(() => this.apply(true), seconds * 1000);
  }

  private apply(force = false): void {
    if (!ctx || !this.crowdG || !this.crowdHiG) return;
    if (!force && ctx.currentTime < this.duckUntil) return;
    const c = this.crowd;
    this.crowdG.gain.setTargetAtTime(0.04 + c * 0.22, ctx.currentTime, force ? 0.08 : 0.4);
    this.crowdHiG.gain.setTargetAtTime(0.01 + c * c * 0.12, ctx.currentTime, force ? 0.08 : 0.4);
  }

  /** Look-ahead scheduler for the hoofbeats: a four-beat gallop rhythm. */
  private schedule(): void {
    if (!ctx || !master) return;
    const stride = 1 / (2.2 * Math.max(0.2, this.tempo));
    const offsets = [0, 0.14, 0.26, 0.4]; // ta-ka-ta ... dum
    while (this.nextBeat < ctx.currentTime + 0.12) {
      const i = this.beat % 4;
      const t = this.nextBeat;
      if (this.hoof > 0.02 && t >= this.duckUntil) {
        const lvl = this.hoof * (i === 3 ? 1 : 0.7) * (0.85 + Math.random() * 0.3);
        tone(t, 95 + Math.random() * 20, 0.07, 'sine', 0.22 * lvl, { slideTo: 55 });
        noise(t, 0.05, 'lowpass', 1600, 500, 0.7, 0.12 * lvl, 0.002);
      }
      this.beat++;
      this.nextBeat += i === 3 ? stride * (1 - offsets[3]) : stride * (offsets[i + 1] - offsets[i]);
    }
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    const t = ctx?.currentTime ?? 0;
    for (const g of [this.crowdG, this.crowdHiG]) g?.gain.setTargetAtTime(0.0001, t, 0.3);
    const srcs = this.srcs;
    this.srcs = [];
    window.setTimeout(() => srcs.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } }), 1500);
    this.crowdG = this.crowdHiG = null;
  }
}

/** Little voices for ranch critters (tap, play, scatter). */
export function critterSound(kind: string): void {
  if (playSample('critter:' + kind)) return;
  if (!ready()) return;
  const t = now();
  switch (kind) {
    case 'butterfly': [2093, 2637, 3136].forEach((f, i) => tone(t + i * 0.05, f, 0.25, 'sine', 0.05)); break;
    case 'bird': for (let i = 0; i < 3; i++) tone(t + i * 0.08, 2800 + Math.random() * 500, 0.06, 'sine', 0.07, { slideTo: 3800 }); noise(t, 0.25, 'bandpass', 1200, 2400, 1.5, 0.05, 0.01); break;
    case 'rabbit': tone(t, 120, 0.08, 'sine', 0.3, { slideTo: 60 }); tone(t + 0.12, 120, 0.08, 'sine', 0.25, { slideTo: 60 }); break;
    case 'cat': tone(t, 700, 0.45, 'sawtooth', 0.05, { slideTo: 520, attack: 0.08, lowpass: 1800, vibrato: 6 }); break;
    case 'hen': for (let i = 0; i < 3; i++) tone(t + i * 0.11, 600 + i * 40, 0.09, 'square', 0.03, { slideTo: 420, lowpass: 1500 }); tone(t + 0.36, 700, 0.25, 'square', 0.035, { slideTo: 900, lowpass: 1600 }); break;
    case 'goat': tone(t, 380, 0.55, 'sawtooth', 0.06, { slideTo: 330, attack: 0.04, lowpass: 1400, vibrato: 25 }); break;
    case 'ducks': for (let i = 0; i < 4; i++) tone(t + i * 0.1, 1700 + (i % 2) * 300, 0.07, 'triangle', 0.06, { slideTo: 2300 }); break;
    case 'owl': tone(t, 400, 0.3, 'sine', 0.12, { slideTo: 360, attack: 0.06 }); tone(t + 0.4, 420, 0.5, 'sine', 0.12, { slideTo: 350, attack: 0.06, vibrato: 4 }); break;
  }
}

// ---------- Scene ambience (ranch & barn) ----------

/** A soft clop on the ranch grass, by gait. */
export function hoofClop(gait: string): void {
  const lvl = gait === 'canter' ? 1 : gait === 'trot' ? 0.75 : 0.5;
  if (playSample('hoofClop', lvl)) return;
  if (!ready()) return;
  const t = now();
  tone(t, 180 + Math.random() * 40, 0.06, 'sine', 0.08 * lvl, { slideTo: 90 });
  noise(t, 0.05, 'bandpass', 900, 600, 1.2, 0.05 * lvl, 0.002);
}

function birdsong(t: number, peak = 0.045): void {
  const base = 2200 + Math.random() * 1400;
  const n = 3 + Math.floor(Math.random() * 5);
  const style = Math.random();
  for (let i = 0; i < n; i++) {
    const at = t + i * (style < 0.5 ? 0.09 : 0.14);
    const f = base * (style < 0.33 ? 1 + i * 0.06 : 1 + (i % 2) * 0.18);
    tone(at, f, 0.07, 'sine', peak, { slideTo: f * (style < 0.66 ? 1.25 : 0.8) });
  }
}

function cricket(t: number): void {
  const f = 4200 + Math.random() * 600;
  for (let i = 0; i < 3; i++) tone(t + i * 0.055, f, 0.035, 'sine', 0.025);
}

function snort(t: number): void {
  noise(t, 0.35, 'lowpass', 900, 300, 0.8, 0.12, 0.02);
  noise(t + 0.06, 0.25, 'bandpass', 1400, 600, 2, 0.05, 0.02); // the flutter of lips
}

function creak(t: number): void {
  tone(t, 180 + Math.random() * 60, 0.5, 'sawtooth', 0.015, { slideTo: 140 + Math.random() * 60, attack: 0.08, lowpass: 900, vibrato: 18 });
}

function strawRustle(t: number): void {
  noise(t, 0.4 + Math.random() * 0.4, 'highpass', 2500, 3500, 0.6, 0.035, 0.1);
}

/**
 * Background life for a scene. 'ranch': a breeze, birdsong (mornings) or crickets
 * (evenings). 'barn': quiet room tone, straw, creaks, snorts, and barn friends.
 */
export class SceneAmbience {
  private mode: 'ranch' | 'barn' | null = null;
  private bed: GainNode | null = null;
  private bedSrc: AudioBufferSourceNode | null = null;
  private bedFilter: BiquadFilterNode | null = null;
  private timer = 0;
  private next = 0;
  private gust = 0;
  /** 0 = sunrise … 1 = evening (ranch only). */
  tod = 0;
  /** Barn friends that might pipe up in the barn. */
  friends: string[] = [];

  set(mode: 'ranch' | 'barn' | null): void {
    if (mode === this.mode) return;
    this.stopBed();
    this.mode = mode;
    if (!mode) return;
    this.next = 0;
    this.timer = window.setInterval(() => this.tick(), 250);
    this.startBed();
  }

  private startBed(): void {
    if (!ctx || !master || !noiseBuf || !this.mode) return;
    const c = ctx;
    const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = c.createBiquadFilter();
    f.type = this.mode === 'ranch' ? 'bandpass' : 'lowpass';
    f.frequency.value = this.mode === 'ranch' ? 500 : 260;
    f.Q.value = 0.4;
    const g = c.createGain(); g.gain.value = 0.0001;
    g.gain.setTargetAtTime(this.mode === 'ranch' ? 0.05 : 0.035, c.currentTime, 0.8);
    s.connect(f).connect(g).connect(master);
    s.start(c.currentTime, Math.random());
    this.bed = g; this.bedSrc = s; this.bedFilter = f;
  }

  private stopBed(): void {
    window.clearInterval(this.timer); this.timer = 0;
    const g = this.bed; const s = this.bedSrc;
    if (g && ctx) g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    if (s) window.setTimeout(() => { try { s.stop(); } catch { /* stopped */ } }, 1500);
    this.bed = null; this.bedSrc = null; this.bedFilter = null;
  }

  private tick(): void {
    if (!ctx || ctx.state !== 'running' || !this.mode) return;
    if (!this.bed) this.startBed(); // audio got unlocked after we entered the scene
    const t = ctx.currentTime;
    // The breeze breathes: slow swells on the bed.
    if (this.mode === 'ranch' && this.bed && this.bedFilter && t > this.gust) {
      this.gust = t + 3 + Math.random() * 5;
      const peak = 0.03 + Math.random() * 0.05;
      this.bed.gain.setTargetAtTime(peak, t, 1.2);
      this.bedFilter.frequency.setTargetAtTime(350 + Math.random() * 500, t, 1.5);
    }
    if (muted || t < this.next) return;
    if (this.mode === 'ranch') {
      const eve = this.tod > 0.7;
      if (eve) {
        // Crickets chirp in little runs; the odd far-off bird.
        const at = t + 0.05;
        for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) cricket(at + i * 0.32 + Math.random() * 0.05);
        if (Math.random() < 0.15) birdsong(at + 1.5, 0.02);
        this.next = t + 1.2 + Math.random() * 2;
      } else {
        birdsong(t + 0.05, this.tod < 0.35 ? 0.05 : 0.035);
        if (Math.random() < 0.08) playSample('whinny', 0.6); // a far-off neigh
        if (Math.random() < 0.35) birdsong(t + 0.6 + Math.random() * 0.6, 0.025); // an answer
        this.next = t + (this.tod < 0.35 ? 2 : 3.5) + Math.random() * 4;
      }
    } else {
      const r = Math.random();
      const at = t + 0.05;
      if (r < 0.3) strawRustle(at);
      else if (r < 0.5) creak(at);
      else if (r < 0.7) snort(at);
      else if (r < 0.76 && playSample('whinny', 0.8)) { /* a neigh from a neighbouring stall */ }
      else if (this.friends.length) critterSound(this.friends[Math.floor(Math.random() * this.friends.length)]);
      else strawRustle(at);
      this.next = t + 2.5 + Math.random() * 4.5;
    }
  }
}

/** Victory fanfare on the results screen: 'big' for marquee races, 'regular' for everyday wins. */
export function victoryFanfare(kind: 'big' | 'regular'): void {
  if (muted) return;
  void playMusic(kind === 'big' ? 'fanfareBig' : 'fanfareRegular', { loop: false, fade: 0.05 });
}

/** A short happy jingle: an S-rank drill, or a new friend moving into the barn. */
export function achievementChime(): void {
  if (playSample('levelComplete')) return;
  if (!ready()) return;
  const t = now();
  [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(t + i * 0.09, f, 0.25, 'square', 0.05, { lowpass: 2400 }));
}

/** A coin clink for Horse Dollars changing hands. */
export function coinSound(): void {
  if (playSample('coin')) return;
  if (!ready()) return;
  const t = now();
  tone(t, 1318.5, 0.07, 'square', 0.04, { lowpass: 3000 });
  tone(t + 0.07, 1975.5, 0.22, 'square', 0.04, { lowpass: 3000 });
}
