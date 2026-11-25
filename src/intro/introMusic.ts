// Original score for the opening sequence, synthesized live (no audio files).
//
// One heroic theme in D major, four bars at 100 bpm:
//   bar 1  D4 . A4 . . A4 B4      (a rising fifth: the "hero" leap)
//   bar 2  A4 . . F#4 G4
//   bar 3  A4 B4 D5 . . C#5
//   bar 4  D5 (held)
// Scene 1: the theme in full, brass and strings, timpani driving it.
// Scene 2: the same opening phrase turns minor (B-flat instead of B, a lone flute,
//          tremolo strings, hoofbeat ticks racing faster) and hangs on an unresolved
//          dominant. When the jockey calms the horse the strings warm back to D major
//          and the theme returns, gently at first, then building to the title card.
import { audioGraph } from '../game/sfx';

const BEAT = 0.6; // 100 bpm
/** Seconds from the start of the sequence. The visuals in intro.ts use the same clock. */
export const CUE = {
  curtain: 9.2,      // curtain starts to close on scene 1
  minor: 10.2,       // the uncertain phrase begins
  video2: 11.6,      // scene 2 video starts
  hoofRun: 11.8,     // hoofbeat ticks begin (frantic horse)
  calm: 16.0,        // tension resolves; the jockey reaches the horse
  theme2: 16.2,      // the theme returns in D major
  title: 23.4,       // final chord: title card
} as const;

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

interface Ctx { c: AudioContext; bus: GainNode; verb: GainNode; t0: number; noise: AudioBuffer }

interface VoiceOpts {
  type?: OscillatorType; attack?: number; release?: number; cutoff?: [number, number]; q?: number;
  detune?: number[]; vibrato?: number; vibRate?: number; tremolo?: number; tremRate?: number; send?: number;
}

function voice(x: Ctx, at: number, midi: number | number[], dur: number, vel: number, o: VoiceOpts = {}): void {
  const { c } = x;
  const t = x.t0 + at;
  const attack = o.attack ?? 0.03;
  const release = o.release ?? 0.2;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel), t + attack);
  out.gain.setValueAtTime(Math.max(0.0002, vel), t + Math.max(attack, dur - release * 0.5));
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  let tail: AudioNode = out;
  if (o.tremolo) {
    const tg = c.createGain();
    tg.gain.value = 1 - o.tremolo / 2;
    const lfo = c.createOscillator();
    const d = c.createGain();
    lfo.frequency.value = o.tremRate ?? 9;
    d.gain.value = o.tremolo / 2;
    lfo.connect(d).connect(tg.gain);
    lfo.start(t); lfo.stop(t + dur + release + 0.1);
    out.connect(tg);
    tail = tg;
  }
  tail.connect(x.bus);
  if (o.send) { const s = c.createGain(); s.gain.value = o.send; tail.connect(s).connect(x.verb); }
  let head: AudioNode = out;
  if (o.cutoff) {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = o.q ?? 0.8;
    lp.frequency.setValueAtTime(o.cutoff[0], t);
    lp.frequency.linearRampToValueAtTime(o.cutoff[1], t + Math.max(0.05, dur * 0.5));
    lp.connect(out);
    head = lp;
  }
  for (const m of Array.isArray(midi) ? midi : [midi]) {
    for (const dt of o.detune ?? [0]) {
      const osc = c.createOscillator();
      osc.type = o.type ?? 'sawtooth';
      osc.frequency.value = mtof(m);
      osc.detune.value = dt;
      if (o.vibrato) {
        const lfo = c.createOscillator();
        const d = c.createGain();
        lfo.frequency.value = o.vibRate ?? 5.2;
        d.gain.value = o.vibrato;
        lfo.connect(d).connect(osc.detune);
        lfo.start(t + 0.15); lfo.stop(t + dur + release + 0.1);
      }
      const g = c.createGain();
      g.gain.value = 1 / ((Array.isArray(midi) ? midi.length : 1) * (o.detune?.length ?? 1)) ** 0.6;
      osc.connect(g).connect(head);
      osc.start(t); osc.stop(t + dur + release + 0.1);
    }
  }
}

const brass = (x: Ctx, at: number, m: number, dur: number, vel: number) =>
  voice(x, at, m, dur, vel, { attack: 0.07, release: 0.25, cutoff: [500, 2600], q: 1.2, detune: [-7, 7], send: 0.35 });
const horn = (x: Ctx, at: number, m: number, dur: number, vel: number) =>
  voice(x, at, m, dur, vel, { type: 'sawtooth', attack: 0.16, release: 0.4, cutoff: [380, 1200], q: 0.6, detune: [-4, 4], vibrato: 7, send: 0.5 });
const strings = (x: Ctx, at: number, m: number | number[], dur: number, vel: number, o: VoiceOpts = {}) =>
  voice(x, at, m, dur, vel, { attack: 0.5, release: 0.7, cutoff: [700, 1700], detune: [-9, 0, 9], vibrato: 6, send: 0.55, ...o });
const spiccato = (x: Ctx, at: number, m: number, vel: number) =>
  voice(x, at, m, 0.17, vel, { attack: 0.01, release: 0.12, cutoff: [1800, 900], detune: [-5, 5], send: 0.25 });
const flute = (x: Ctx, at: number, m: number, dur: number, vel: number) =>
  voice(x, at, m, dur, vel, { type: 'triangle', attack: 0.12, release: 0.3, vibrato: 12, vibRate: 5.5, send: 0.6, cutoff: [1500, 3200] });
const cello = (x: Ctx, at: number, m: number, dur: number, vel: number) =>
  voice(x, at, m, dur, vel, { attack: 0.08, release: 0.3, cutoff: [300, 700], detune: [-5, 5], send: 0.2 });

function timpani(x: Ctx, at: number, m: number, vel: number): void {
  const { c } = x;
  const t = x.t0 + at;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(mtof(m) * 1.5, t);
  o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  o.connect(g).connect(x.bus);
  const s = c.createGain(); s.gain.value = 0.3; g.connect(s).connect(x.verb);
  o.start(t); o.stop(t + 1);
  hit(x, at, 'lowpass', 600, 0.12, vel * 0.6);
}

function hit(x: Ctx, at: number, type: BiquadFilterType, f: number, dur: number, vel: number, send = 0): void {
  const { c } = x;
  const t = x.t0 + at;
  const s = c.createBufferSource();
  s.buffer = x.noise;
  const bq = c.createBiquadFilter();
  bq.type = type; bq.frequency.value = f; bq.Q.value = 0.9;
  const g = c.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bq).connect(g).connect(x.bus);
  if (send) { const v = c.createGain(); v.gain.value = send; g.connect(v).connect(x.verb); }
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

/** A swelling cymbal. */
function cymbal(x: Ctx, at: number, dur: number, vel: number, swell = 0): void {
  const { c } = x;
  const t = x.t0 + at;
  const s = c.createBufferSource();
  s.buffer = x.noise;
  const bq = c.createBiquadFilter();
  bq.type = 'highpass'; bq.frequency.value = 5200;
  const g = c.createGain();
  if (swell) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + swell); }
  else g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + swell + dur);
  s.connect(bq).connect(g).connect(x.bus);
  const v = c.createGain(); v.gain.value = 0.3; g.connect(v).connect(x.verb);
  s.start(t, Math.random()); s.stop(t + swell + dur + 0.05);
}

function bell(x: Ctx, at: number, m: number, vel: number): void {
  const t = x.t0 + at;
  [[1, 1], [2.76, 0.4], [5.4, 0.2]].forEach(([r, a]) => {
    const o = x.c.createOscillator();
    o.type = 'sine'; o.frequency.value = mtof(m) * r;
    const g = x.c.createGain();
    g.gain.setValueAtTime(vel * a, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2 / r ** 0.5);
    o.connect(g).connect(x.bus);
    const v = x.c.createGain(); v.gain.value = 0.5; g.connect(v).connect(x.verb);
    o.start(t); o.stop(t + 2.4);
  });
}

function tick(x: Ctx, at: number, vel: number): void {
  const { c } = x;
  const t = x.t0 + at;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(1100 + Math.random() * 200, t);
  o.frequency.exponentialRampToValueAtTime(520, t + 0.05);
  const g = c.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g).connect(x.bus);
  o.start(t); o.stop(t + 0.1);
}

/** Keeps the big final chord from clipping. */
function limiter(c: AudioContext): DynamicsCompressorNode {
  const k = c.createDynamicsCompressor();
  k.threshold.value = -9; k.knee.value = 6; k.ratio.value = 8; k.attack.value = 0.004; k.release.value = 0.2;
  return k;
}

function reverbIR(c: AudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * 2.4);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  return buf;
}

// ---- The theme: [beat within the 4-bar phrase, midi, beats] ----
const D4 = 62, E4 = 64, F4 = 65, Fs4 = 66, G4 = 67, A4 = 69, Bb4 = 70, B4 = 71, Cs5 = 73, D5 = 74;
const THEME: [number, number, number][] = [
  [0, D4, 1], [1, A4, 1.5], [2.5, A4, 0.5], [3, B4, 1],
  [4, A4, 2], [6, Fs4, 1], [7, G4, 1],
  [8, A4, 1], [9, B4, 1], [10, D5, 1.5], [11.5, Cs5, 0.5],
  [12, D5, 3.5],
];
// Chord roots (bass) and triads per bar: D, Bm, G, A -> D
const BARS: { bass: number; chord: number[] }[] = [
  { bass: 38, chord: [50, 57, 62, 66] },   // D
  { bass: 35, chord: [47, 54, 59, 62] },   // Bm
  { bass: 43, chord: [47, 55, 59, 62] },   // G
  { bass: 45, chord: [49, 52, 57, 61] },   // A
];

export interface MusicHandle { stop: (fadeSec?: number) => void }

/** Start the whole score now. Returns null if audio isn't unlocked. */
export function playScore(): MusicHandle | null {
  const g = audioGraph();
  if (!g) return null;
  const { ctx: c, out } = g;
  const bus = c.createGain();
  bus.gain.value = 0.85;
  const verb = c.createGain();
  verb.gain.value = 0.8;
  const conv = c.createConvolver();
  conv.buffer = reverbIR(c);
  verb.connect(conv).connect(bus);
  bus.connect(limiter(c)).connect(out);
  const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const x: Ctx = { c, bus, verb, t0: c.currentTime + 0.12, noise };
  const B = BEAT;

  // ===== Scene 1 (0 - 9.6s): the heroic theme =====
  for (let bar = 0; bar < 4; bar++) {
    const t = bar * 4 * B;
    const { bass, chord } = BARS[bar];
    cello(x, t, bass, 4 * B - 0.1, 0.16);
    strings(x, t, chord, 4 * B, 0.07, { attack: 0.35 });
    // Driving eighth-note arpeggio
    for (let i = 0; i < 8; i++) spiccato(x, t + i * B / 2, chord[[0, 1, 2, 1, 0, 1, 3, 2][i]] + (i % 2 ? 12 : 0), 0.045);
    timpani(x, t, bass, 0.5);
    timpani(x, t + 2 * B, bass, 0.32);
    if (bar === 1 || bar === 3) { timpani(x, t + 3 * B, bass + 7, 0.3); timpani(x, t + 3.5 * B, bass + 7, 0.34); }
  }
  cymbal(x, 0, 1.6, 0.1);
  for (const [b, m, d] of THEME) {
    brass(x, b * B, m, d * B - 0.04, 0.17);
    strings(x, b * B, m + 12, d * B, 0.045, { attack: 0.08, release: 0.3, cutoff: [1600, 2600] });
  }
  brass(x, 12 * B, D4 - 12, 3.5 * B, 0.1);
  cymbal(x, 12 * B, 1.8, 0.09);
  timpani(x, 12 * B, 38, 0.6);

  // ===== Scene 2, uncertainty (10.2 - 16.0s): the phrase turns minor =====
  const m0 = CUE.minor;
  const lead: [number, number, number][] = [
    [0, D4, 1], [1, A4, 1.5], [2.5, A4, 0.5], [3, Bb4, 1],   // bar 1: B-flat instead of B
    [4, A4, 2], [6, F4, 1], [7, E4, 1],                      // bar 2: falls to F and E, uncertain
    [8, A4, 1], [9, Bb4, 1], [10, 72, 1.2],                  // bar 3 climbs, stops short on C
  ];
  for (const [b, m, d] of lead) flute(x, m0 + b * B, m, d * B, 0.12);
  // Low drone and uneasy tremolo strings: D minor with a flat sixth, then diminished
  cello(x, m0, 38, 8 * B + 0.5, 0.15);
  strings(x, m0, [50, 57, 58, 65], 4 * B, 0.07, { tremolo: 0.8, tremRate: 9, attack: 0.6 });
  strings(x, m0 + 4 * B, [50, 56, 59, 65], 4.2 * B, 0.08, { tremolo: 0.9, tremRate: 11, attack: 0.3 }); // D dim7
  strings(x, m0 + 8 * B, [45, 49, 52, 58], 2.4 * B, 0.085, { tremolo: 1, tremRate: 13, attack: 0.3 });   // A7 flat nine
  strings(x, m0 + 4 * B, [64, 68, 71], 6 * B, 0.03, { tremolo: 1, tremRate: 14, attack: 1.6, cutoff: [1200, 2800] });
  // Heartbeat, uneven, that tightens
  [0.2, 0.9, 1.35, 2.2, 2.6, 3.3, 3.6, 4.2, 4.5, 4.9, 5.2].forEach((t, i) => timpani(x, m0 + t, 38 + (i % 3 ? 0 : 1), 0.14 + i * 0.012));
  // Hoofbeats racing: the gaps shrink as the horse gets more frantic
  let ht = CUE.hoofRun;
  let gap = 0.42;
  while (ht < CUE.calm - 0.2) {
    tick(x, ht, 0.07 + (ht - CUE.hoofRun) * 0.006);
    if (gap > 0.16) tick(x, ht + gap * 0.5, 0.04);
    ht += gap;
    gap = Math.max(0.12, gap * 0.93);
  }
  cymbal(x, CUE.calm - 1.8, 1.4, 0.07, 1.4);

  // ===== The calm (16.0s): shift back to D major; the theme returns =====
  const c0 = CUE.theme2;
  strings(x, CUE.calm, [50, 57, 62, 66], 2.4 * B + 0.4, 0.11, { attack: 1.0 });
  hit(x, CUE.calm, 'bandpass', 3000, 0.4, 0.015, 0.4);
  const soft: [number, number, number][] = [
    [0, D4, 1], [1, A4, 1.5], [2.5, A4, 0.5], [3, B4, 1],      // bar 1: B natural again
    [4, A4, 2], [6, Fs4, 1], [7, G4, 1],                        // bar 2
    [8, A4, 1], [9, B4, 1], [10, D5, 1.5], [11.5, Cs5, 0.5],    // bar 3
  ];
  soft.forEach(([b, m, d], i) => {
    const t = c0 + b * B;
    const swell = Math.min(1, 0.32 + i * 0.075);
    horn(x, t, m, d * B, 0.2 * swell);
    if (b >= 4) brass(x, t, m, d * B - 0.04, 0.12 * swell);
  });
  for (let bar = 0; bar < 3; bar++) {
    const t = c0 + bar * 4 * B;
    const { bass, chord } = BARS[bar];
    cello(x, t, bass, 4 * B - 0.1, 0.14 + bar * 0.03);
    strings(x, t, chord, 4 * B, 0.09 + bar * 0.025, { attack: 0.7 });
    if (bar >= 1) for (let i = 0; i < 4; i++) spiccato(x, t + i * B, chord[[0, 2, 1, 3][i]] + 12, 0.03 + bar * 0.01);
  }
  // Build into the title: timpani roll under the last bar and a rising cymbal
  for (let i = 0; i < 18; i++) timpani(x, CUE.title - 1.9 + i * 0.105, 38, 0.1 + i * 0.022);
  cymbal(x, CUE.title - 2.0, 2.4, 0.12, 2.0);

  // ===== Title (23.4s): the full hero chord and a sparkle =====
  const T = CUE.title;
  for (const m of [D4 - 12, D4, D5]) brass(x, T, m, 5, 0.2);
  strings(x, T, [50, 57, 62, 66, 69, 74], 5.5, 0.1, { attack: 0.15, release: 1.4 });
  timpani(x, T, 38, 0.75);
  cymbal(x, T, 2.8, 0.16);
  [74, 78, 81, 86, 90].forEach((m, i) => bell(x, T + 0.1 + i * 0.09, m, 0.09));

  return {
    stop: (fade = 0.35) => {
      bus.gain.cancelScheduledValues(c.currentTime);
      bus.gain.setValueAtTime(bus.gain.value, c.currentTime);
      bus.gain.linearRampToValueAtTime(0.0001, c.currentTime + fade);
      window.setTimeout(() => { try { bus.disconnect(); } catch { /* gone */ } }, (fade + 0.2) * 1000);
    },
  };
}

/**
 * The soft title-screen loop: a warm D major pad with a slow bell arpeggio.
 * `lead` is how long to wait before starting, so it can follow the big final chord.
 */
export function playTitleLoop(lead = 0): MusicHandle | null {
  const g = audioGraph();
  if (!g) return null;
  const { ctx: c, out } = g;
  const bus = c.createGain();
  bus.gain.value = 0.0001;
  bus.gain.linearRampToValueAtTime(0.4, c.currentTime + lead + 1.5);
  const verb = c.createGain();
  verb.gain.value = 0.8;
  const conv = c.createConvolver();
  conv.buffer = reverbIR(c);
  verb.connect(conv).connect(bus);
  bus.connect(limiter(c)).connect(out);
  const noise = c.createBuffer(1, 1, c.sampleRate);
  const x: Ctx = { c, bus, verb, t0: c.currentTime + lead, noise };
  const bar = 8 * BEAT;
  const prog = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]];
  const arp = [74, 78, 81, 78, 83, 81, 78, 74];
  // Schedule 8 bars ahead each time; refresh before it runs out.
  let bars = 0;
  const lay = () => {
    for (let i = 0; i < 8; i++) {
      const at = (bars + i) * bar;
      const ch = prog[(bars + i) % 4];
      strings(x, at, ch, bar + 0.3, 0.06, { attack: 1.4, release: 1.4, cutoff: [600, 1300] });
      cello(x, at, ch[0] - 12, bar, 0.07);
      for (let j = 0; j < 8; j++) if (j % 2 === 0 || (bars + i) % 2) bell(x, at + j * BEAT, arp[j] + ((bars + i) % 4 === 1 ? -3 : 0), 0.035);
    }
    bars += 8;
  };
  lay();
  const iv = window.setInterval(lay, bar * 7 * 1000);
  return {
    stop: (fade = 0.5) => {
      window.clearInterval(iv);
      bus.gain.cancelScheduledValues(c.currentTime);
      bus.gain.setValueAtTime(bus.gain.value, c.currentTime);
      bus.gain.linearRampToValueAtTime(0.0001, c.currentTime + fade);
      window.setTimeout(() => { try { bus.disconnect(); } catch { /* gone */ } }, (fade + 0.2) * 1000);
    },
  };
}
