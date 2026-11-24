// Swim Session — pool work. A marker sweeps back and forth across the
// stroke bar; tap when it crosses the sweet spot to kick. 10 strokes.
// Swimming is gentle: it builds Stamina and eases fatigue.
// Fiery horses swing faster; lazy horses swing slower but the spot is smaller.
import type { HorseDef } from '../sim/types';
import { portraitSVG } from '../game/portrait';
import { gradeFor } from './grades';
import type { DrillResult } from './gateDrill';

const STROKES = 10;

export function runSwimSession(root: HTMLElement, horse: HorseDef, opts: { exhausted: boolean }, onDone: (r: DrillResult & { margin: string }) => void): () => void {
  const lazy = horse.need === 'lazy';
  const baseSweep = (lazy ? 1.25 : 1.05) - horse.fire * 0.3; // seconds per side-to-side pass
  const zoneBase = lazy ? 0.16 : 0.2; // sweet-spot width (fraction of bar)
  let state: 'intro' | 'running' | 'done' = 'intro';
  let phase = 0; // 0..1 across, then back
  let dir = 1;
  let zoneCenter = 0.5;
  let zoneW = zoneBase;
  let sweep = baseSweep;
  let lockUntil = 0;
  let t = 0;
  let last = 0;
  let raf = 0;
  let progress = 0;
  let passesSinceStroke = 0;
  const scores: number[] = [];
  const timers: number[] = [];

  root.innerHTML = `
    <div class="drill-top">
      <div><b>Swim Session</b><span id="sw-count">Stamina · eases fatigue</span></div>
      <button class="ghost small" id="sw-quit">Back to stable</button>
    </div>
    <div class="sw-scene" id="sw-scene">
      <div class="sw-water" id="sw-water"></div>
      <div class="sw-rope" style="top:22%"></div><div class="sw-rope" style="top:78%"></div>
      <div class="sw-wall"></div>
      <div class="sw-horse" id="sw-horse">${portraitSVG(horse, 64)}<div class="sw-wake" id="sw-wake"></div></div>
      <div class="gd-msg sw-msg" id="sw-msg" aria-live="polite">Tap as the marker crosses the gold spot.<br><small>Each good kick moves ${horse.name} across the pool.</small></div>
    </div>
    <div class="sw-bar" id="sw-bar"><div class="sw-zone" id="sw-zone"></div><div class="sw-mark" id="sw-mark"></div></div>
    <div class="gd-pips" id="sw-pips">${Array.from({ length: STROKES }, () => '<span></span>').join('')}</div>
    <button class="gd-go sw-go" id="sw-go">Into the pool</button>
  `;
  const $ = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  const msg = (html: string, cls = '') => { const m = $('sw-msg'); m.innerHTML = html; m.className = `gd-msg sw-msg ${cls}`; };
  const pip = (i: number, cls: string) => { ($('sw-pips').children[i] as HTMLElement).className = cls; };

  function placeZone(): void {
    const k = scores.length / (STROKES - 1);
    zoneW = zoneBase * (1 - 0.35 * k);
    sweep = baseSweep * (1 - 0.3 * k);
    zoneCenter = zoneW / 2 + 0.08 + Math.random() * (1 - zoneW - 0.16);
    $('sw-zone').style.left = `${(zoneCenter - zoneW / 2) * 100}%`;
    $('sw-zone').style.width = `${zoneW * 100}%`;
  }

  function stroke(s: number, word: string, cls: string): void {
    scores.push(s);
    pip(scores.length - 1, cls);
    progress += s;
    msg(`<b>${word}</b>`, cls === 'perfect' ? 'perfect' : cls === 'bad' ? 'bad' : '');
    const h = $('sw-horse');
    h.classList.remove('kick', 'splash'); void h.offsetWidth; h.classList.add(s > 0 ? 'kick' : 'splash');
    $('sw-count').textContent = `Stroke ${scores.length} of ${STROKES}`;
    passesSinceStroke = 0;
    lockUntil = t + 0.35;
    if (scores.length >= STROKES) { timers.push(window.setTimeout(finish, 700)); state = 'done'; return; }
    placeZone();
  }

  function frame(now: number): void {
    if (state !== 'running') return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    t += dt;
    phase += (dir * dt) / sweep;
    if (phase >= 1) { phase = 1; dir = -1; passesSinceStroke++; }
    if (phase <= 0) { phase = 0; dir = 1; passesSinceStroke++; }
    // Three sweeps without a tap counts as a missed stroke.
    if (passesSinceStroke >= 3) stroke(0, 'Missed the stroke', 'bad');
    $('sw-mark').style.left = `${phase * 100}%`;
    $('sw-horse').style.left = `${12 + (progress / STROKES) * 72}%`;
    $('sw-water').style.backgroundPositionX = `${-t * 30}px`;
    if (state === 'running') raf = requestAnimationFrame(frame);
  }

  function tap(e?: Event): void {
    e?.preventDefault();
    if (state === 'intro') return start();
    if (state !== 'running' || t < lockUntil) return;
    const d = Math.abs(phase - zoneCenter);
    const half = zoneW / 2;
    if (d <= half * 0.4) stroke(1, 'Perfect kick!', 'perfect');
    else if (d <= half) stroke(0.7, 'Good stroke', 'ok');
    else if (d <= half + 0.06) stroke(0.3, 'Bit off', 'meh');
    else stroke(0, 'Splash!', 'bad');
  }

  function start(): void {
    state = 'running';
    $('sw-go').textContent = 'KICK';
    placeZone();
    msg('<b>Find the rhythm…</b>');
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function finish(): void {
    cancelAnimationFrame(raf);
    const pct = (scores.reduce((a, b) => a + b, 0) / STROKES) * 100;
    const perfect = scores.filter((s) => s === 1).length;
    const margin = pct >= 90 ? `Smooth laps. ${perfect} perfect kicks.` : pct >= 55 ? `A good swim. ${perfect} perfect kicks.` : 'Lots of splashing, but the water still helped.';
    $('sw-go').textContent = 'Finished';
    onDone({ pct, grade: gradeFor(pct), balked: false, quit: false, starts: [], margin });
  }

  if (opts.exhausted && Math.random() < 0.25) {
    // Swimming is gentle, so exhausted horses refuse less often.
    msg(`<b>${horse.name} won't go in the water.</b><br><small>It's exhausted. Let it rest.</small>`, 'bad');
    $('sw-go').textContent = 'Back to stable';
    state = 'done';
    $('sw-go').addEventListener('click', () => onDone({ pct: 0, grade: 'D', balked: true, quit: false, starts: [], margin: '' }));
  } else {
    $('sw-go').addEventListener('pointerdown', tap);
    $('sw-scene').addEventListener('pointerdown', tap);
  }
  const key = (e: KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && state !== 'done') tap(e); };
  window.addEventListener('keydown', key);
  $('sw-quit').addEventListener('click', () => {
    cancelAnimationFrame(raf);
    state = 'done';
    onDone({ pct: 0, grade: 'D', balked: false, quit: true, starts: [], margin: '' });
  });
  return () => { cancelAnimationFrame(raf); while (timers.length) clearTimeout(timers.pop()); window.removeEventListener('keydown', key); };
}
