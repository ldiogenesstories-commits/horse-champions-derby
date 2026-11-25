// Sound effects, all synthesized live with the Web Audio API: no audio files, so
// nothing to license or download. Each effect is a small recipe of oscillators,
// filtered noise and envelopes.

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
  }
  if (ctx.state === 'suspended') void ctx.resume();
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
  if (!ready()) return;
  const t = now();
  noise(t, 0.65, 'bandpass', opening ? 1800 : 500, opening ? 500 : 1800, 0.9, 0.35, 0.12);
  noise(t + 0.05, 0.5, 'highpass', 3000, 5000, 0.5, 0.06, 0.08); // rustle
  if (!opening) tone(t + 0.6, 70, 0.18, 'sine', 0.35, { slideTo: 45 }); // soft thud as the halves meet
}

/** A little music-box chime when the logo appears. */
export function logoChime(): void {
  if (!ready()) return;
  const t = now();
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
    tone(t + i * 0.07, f, 0.6, 'sine', 0.12);
    tone(t + i * 0.07, f * 2.01, 0.25, 'sine', 0.03);
  });
}

/** Grass and flowers popping up, with a couple of birds. */
export function naturePops(): void {
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
  if (!ready()) return;
  const t = now();
  tone(t, 160, 0.3, 'sine', 0.6, { slideTo: 40 });
  noise(t, 0.25, 'lowpass', 6000, 800, 0.5, 0.35, 0.003);
}

/** The crowd: a roar that swells and fades; bigger, with whistles and a fanfare, for a win. */
export function crowdRoar(win = false, top3 = false): void {
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
