// Stretch Duel — neck-and-neck with a sparring partner down the stretch.
// Tap WHIP on the stride beat (when the shrinking ring meets the target).
// 12 scored strides; the tempo quickens toward the line. Off-beat whips
// sour the horse's next stride. Fiery horses have a less even rhythm.
import type { HorseDef } from '../sim/types';
import { portraitSVG } from '../game/portrait';
import { gradeFor } from './grades';
import type { DrillResult } from './gateDrill';

const STRIDES = 12;
const COUNT_IN = 3;
const FIRST_MS = 720;
const LAST_MS = 500;
const PERFECT_MS = 60;
const GOOD_MS = 130;
const WINDOW_MS = 220;
const RIVAL_PER_STRIDE = 0.72;
const RING_LEAD_MS = 600; // ring starts shrinking this long before a beat

interface Beat { at: number; score: number | null; penalty: number }

export function runStretchDuel(root: HTMLElement, horse: HorseDef, opts: { exhausted: boolean }, onDone: (r: DrillResult & { margin: string; overWhips: number }) => void): () => void {
  const rival: HorseDef = { ...horse, name: 'Sparring partner', color: '#2F5D9E', coat: horse.coat === 'grey' ? 'chestnut' : 'grey', marking: 'star' };
  let state: 'intro' | 'running' | 'done' = 'intro';
  let beats: Beat[] = [];
  let t0 = 0;
  let raf = 0;
  let overWhips = 0;
  let scroll = 0;
  let lastFrame = 0;
  const timers: number[] = [];

  root.innerHTML = `
    <div class="drill-top">
      <div><b>Stretch Duel</b><span id="sd-count">Speed · Guts</span></div>
      <button class="ghost small" id="sd-quit">Back to stable</button>
    </div>
    <div class="sd-scene" id="sd-scene">
      <div class="sd-sky"></div>
      <div class="sd-rail" id="sd-rail"></div>
      <div class="sd-turf" id="sd-turf"></div>
      <div class="sd-post" id="sd-post"><span>FINISH</span></div>
      <div class="sd-horse sd-rival" id="sd-rival">${portraitSVG(rival, 64)}</div>
      <div class="sd-horse sd-you" id="sd-you">${portraitSVG(horse, 72)}</div>
      <div class="sd-gap" id="sd-gap">Level</div>
      <div class="gd-msg" id="sd-msg" aria-live="polite">Whip on the stride beat.<br><small>When the ring meets the circle. Off-beat whips upset your horse.</small></div>
    </div>
    <div class="sd-beat" id="sd-beat"><div class="sd-target"></div><div class="sd-ring" id="sd-ring"></div></div>
    <div class="gd-pips sd-pips" id="sd-pips">${Array.from({ length: STRIDES }, () => '<span></span>').join('')}</div>
    <button class="gd-go sd-whip" id="sd-go">Start the duel</button>
  `;
  const $ = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  const msg = (html: string, cls = '') => { const m = $('sd-msg'); m.innerHTML = html; m.className = `gd-msg ${cls}`; };
  const pip = (i: number, cls: string) => { ($('sd-pips').children[i] as HTMLElement).className = cls; };
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };

  function schedule(): void {
    beats = [];
    let t = 900; // first count-in beat
    const total = COUNT_IN + STRIDES;
    for (let i = 0; i < total; i++) {
      beats.push({ at: t, score: i < COUNT_IN ? -1 : null, penalty: 0 });
      const k = Math.max(0, i - COUNT_IN) / (STRIDES - 1);
      const base = FIRST_MS + (LAST_MS - FIRST_MS) * k;
      const jitter = i >= COUNT_IN ? (Math.random() * 2 - 1) * horse.fire * 45 : 0;
      t += base + jitter;
    }
  }

  const scored = () => beats.slice(COUNT_IN);
  const sumScore = () => scored().reduce((a, b) => a + (b.score ?? 0), 0);
  const doneCount = () => scored().filter((b) => b.score !== null).length;

  function gapWord(d: number): string {
    const a = Math.abs(d);
    if (a < 0.25) return 'Level';
    const w = a < 0.7 ? 'a nose' : a < 1.3 ? 'a head' : a < 2 ? 'a neck' : a < 3 ? 'a length' : 'lengths';
    return d > 0 ? `Up by ${w}` : `Down ${w}`;
  }

  function judge(b: Beat, i: number, dt: number | null): void {
    let s = 0;
    let word = 'Missed stride';
    let cls = 'bad';
    if (dt !== null) {
      const a = Math.abs(dt);
      if (a <= PERFECT_MS) { s = 1; word = 'PERFECT!'; cls = 'perfect'; }
      else if (a <= GOOD_MS) { s = 0.7; word = dt < 0 ? 'Good (early)' : 'Good (late)'; cls = 'ok'; }
      else { s = 0.35; word = dt < 0 ? 'Early' : 'Late'; cls = 'meh'; }
    }
    s = Math.max(0, s - b.penalty);
    b.score = s;
    const idx = i - COUNT_IN;
    pip(idx, s >= 0.95 ? 'perfect' : s >= 0.6 ? 'ok' : s > 0 ? 'meh' : 'bad');
    msg(`<b>${word}</b>${b.penalty ? '<br><small>Still sore from that extra whip</small>' : ''}`, cls === 'perfect' ? 'perfect' : cls === 'bad' ? 'bad' : '');
    if (s > 0) { const y = $('sd-you'); y.classList.remove('surge'); void y.offsetWidth; y.classList.add('surge'); }
    $('sd-count').textContent = `Stride ${Math.min(STRIDES, idx + 1)} of ${STRIDES}`;
  }

  function frame(now: number): void {
    if (state !== 'running') return;
    const t = now - t0;
    const dt = lastFrame ? now - lastFrame : 16;
    lastFrame = now;
    // Expire beats nobody whipped.
    beats.forEach((b, i) => { if (b.score === null && t > b.at + WINDOW_MS) judge(b, i, null); });
    // Ring: shrink toward the next upcoming beat.
    // Current beat stays on screen until it is whipped or its window closes.
    const next = beats.find((b) => t <= b.at + WINDOW_MS && (b.score === null || b.score === -1));
    const ring = $('sd-ring');
    if (next) {
      const k = (next.at - t) / RING_LEAD_MS;
      if (k >= 0) {
        // Shrinking toward the circle.
        const kk = Math.min(1, k);
        ring.style.transform = `translate(-50%, -50%) scale(${1 + kk * 1.6})`;
        ring.style.opacity = k >= 1 ? '0' : String(0.35 + (1 - kk) * 0.65);
      } else {
        // Past the beat: keep shrinking a little inside the circle and fade out.
        const late = Math.min(1, (t - next.at) / WINDOW_MS);
        ring.style.transform = `translate(-50%, -50%) scale(${1 - late * 0.3})`;
        ring.style.opacity = String(1 - late * 0.85);
      }
      const ci = beats.indexOf(next);
      if (ci < COUNT_IN) { $('sd-go').textContent = ['Ready…', 'Set…', 'Whip on the beat!'][ci]; }
      else $('sd-go').textContent = 'WHIP';
    } else ring.style.opacity = '0';
    // Positions: you vs a rival who averages RIVAL_PER_STRIDE per stride.
    const n = doneCount();
    const diff = sumScore() - RIVAL_PER_STRIDE * n;
    const px = Math.max(-70, Math.min(70, diff * 26));
    $('sd-you').style.setProperty('--dx', `${px}px`);
    $('sd-gap').textContent = gapWord(diff);
    // Scenery scroll, faster as tempo rises.
    scroll += dt * (0.35 + 0.25 * (n / STRIDES));
    $('sd-rail').style.backgroundPositionX = `${-scroll}px`;
    $('sd-turf').style.backgroundPositionX = `${-scroll * 1.4}px`;
    const end = beats[beats.length - 1].at;
    const postK = Math.max(0, Math.min(1, (t - (end - 2600)) / 2600));
    $('sd-post').style.left = `${100 - postK * 72}%`;
    $('sd-post').style.opacity = postK > 0 ? '1' : '0';
    if (t > end + WINDOW_MS + 50) return finish();
    raf = requestAnimationFrame(frame);
  }

  function whip(e?: Event): void {
    e?.preventDefault();
    if (state === 'intro') return start();
    if (state !== 'running') return;
    const t = performance.now() - t0;
    // Nearest open beat within the window.
    let best = -1;
    let bestDt = Infinity;
    beats.forEach((b, i) => {
      if (b.score !== null) return;
      const d = t - b.at;
      if (Math.abs(d) <= WINDOW_MS && Math.abs(d) < Math.abs(bestDt)) { best = i; bestDt = d; }
    });
    if (best >= 0) return judge(beats[best], best, bestDt);
    // Off-beat: count-in taps are free; otherwise it's an extra whip.
    if (t < beats[COUNT_IN].at - WINDOW_MS) return;
    overWhips++;
    const nextOpen = beats.find((b) => b.score === null);
    if (nextOpen) nextOpen.penalty = Math.min(0.6, nextOpen.penalty + 0.3);
    msg('<b>Easy on the whip!</b><br><small>Off the beat. Next stride will suffer.</small>', 'bad');
    const s = $('sd-scene'); s.classList.remove('rattle'); void s.offsetWidth; s.classList.add('rattle');
  }

  function start(): void {
    state = 'running';
    schedule();
    msg('Find the rhythm…');
    t0 = performance.now();
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  }

  function finish(): void {
    if (state === 'done') return;
    state = 'done';
    cancelAnimationFrame(raf);
    const pct = (sumScore() / STRIDES) * 100;
    const diff = sumScore() - RIVAL_PER_STRIDE * STRIDES;
    const margin = diff > 2 ? 'Pulled away by lengths!' : diff > 0.25 ? `Won the duel by ${gapWord(diff).replace('Up by ', '')}.` : diff > -0.25 ? 'Dead heat at the post!' : 'The sparring partner held on.';
    $('sd-go').textContent = 'Finished';
    msg(`<b>${margin}</b>`, diff > 0.25 ? 'perfect' : '');
    later(() => onDone({ pct, grade: gradeFor(pct), balked: false, quit: false, starts: [], margin, overWhips }), 900);
  }

  if (opts.exhausted && Math.random() < 0.5) {
    msg(`<b>${horse.name} won't gallop today.</b><br><small>It's exhausted. Let it rest.</small>`, 'bad');
    $('sd-go').textContent = 'Back to stable';
    state = 'done';
    $('sd-go').addEventListener('click', () => onDone({ pct: 0, grade: 'D', balked: true, quit: false, starts: [], margin: '', overWhips: 0 }));
  } else {
    $('sd-go').addEventListener('pointerdown', whip);
  }
  const key = (e: KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && state !== 'done') whip(e); };
  window.addEventListener('keydown', key);
  $('sd-quit').addEventListener('click', () => {
    cancelAnimationFrame(raf);
    state = 'done';
    onDone({ pct: 0, grade: 'D', balked: false, quit: true, starts: [], margin: '', overWhips });
  });

  return () => { cancelAnimationFrame(raf); while (timers.length) clearTimeout(timers.pop()); window.removeEventListener('keydown', key); };
}
