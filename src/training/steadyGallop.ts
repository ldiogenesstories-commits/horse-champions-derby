// Steady Gallop — tap to keep the breath gauge in the green for one lap,
// and try to hit the target time. Teaches the even pacing Hold is for.
// Too hard → the horse gasps and loses pace; too soft → it drifts.
// Lazy horses fade faster; intense horses surge more per tap; fiery
// horses have a narrower green zone.
import type { HorseDef } from '../sim/types';
import { portraitSVG } from '../game/portrait';
import { gradeFor } from './grades';
import type { DrillResult } from './gateDrill';

const TARGET_S = 20;
const MAX_S = 32;
const ZONE_MID = 52;
const LAP = ZONE_MID * TARGET_S; // distance units
const GASP_AT = 82;

export function runSteadyGallop(root: HTMLElement, horse: HorseDef, opts: { exhausted: boolean }, onDone: (r: DrillResult & { margin: string }) => void): () => void {
  const lazy = horse.need === 'lazy';
  const intense = horse.need === 'intense';
  const push = intense ? 12 : 9;
  const decay = lazy ? 0.45 : 0.35;
  const half = 12 - horse.fire * 5; // green zone half-width
  const zoneLo = ZONE_MID - half;
  const zoneHi = ZONE_MID + half;

  let state: 'intro' | 'running' | 'done' = 'intro';
  let pace = 0;
  let dist = 0;
  let t = 0;
  let zoneT = 0;
  let gasps = 0;
  let gaspUntil = 0;
  let raf = 0;
  let last = 0;
  let scroll = 0;
  let lastWord = '';
  const timers: number[] = [];

  root.innerHTML = `
    <div class="drill-top">
      <div><b>Steady Gallop</b><span id="sg-count">Stamina</span></div>
      <button class="ghost small" id="sg-quit">Back to stable</button>
    </div>
    <div class="sd-scene sg-scene" id="sg-scene">
      <div class="sd-sky"></div>
      <div class="sd-rail" id="sg-rail"></div>
      <div class="sd-turf" id="sg-turf"></div>
      <div class="sd-horse sg-horse" id="sg-horse">${portraitSVG(horse, 72)}</div>
      <div class="sg-puff" id="sg-puff" hidden>huff!</div>
      <div class="sd-gap" id="sg-clock">0.0s · target ${TARGET_S}.0s</div>
      <div class="gd-msg" id="sg-msg" aria-live="polite">Tap to gallop. Keep the needle in the green.<br><small>Too hard and ${horse.name} gasps. Too soft and it drifts.</small></div>
    </div>
    <div class="sg-track" aria-hidden="true">
      <div class="sg-ghost" id="sg-ghost" title="Target pace"></div>
      <div class="sg-me" id="sg-me" style="background:${horse.color}"></div>
      <div class="sg-flag">🏁</div>
    </div>
    <div class="sg-gauge" aria-label="Breath gauge">
      <div class="sg-zone" style="left:${zoneLo}%;width:${zoneHi - zoneLo}%"></div>
      <div class="sg-hot" style="left:${zoneHi}%;width:${GASP_AT - zoneHi}%"></div>
      <div class="sg-red" style="left:${GASP_AT}%"></div>
      <div class="sg-needle" id="sg-needle"></div>
      <span class="sg-lbl l">Drifting</span><span class="sg-lbl c" style="left:${ZONE_MID}%">Steady</span><span class="sg-lbl r">Gasping</span>
    </div>
    <button class="gd-go sg-go" id="sg-go">Start the lap</button>
  `;
  const $ = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  const msg = (html: string, cls = '') => { const m = $('sg-msg'); m.innerHTML = html; m.className = `gd-msg ${cls}`; };

  function frame(now: number): void {
    if (state !== 'running') return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    t += dt;
    pace = Math.max(0, pace - pace * decay * dt);
    dist += pace * dt;
    // Zone credit: full inside, half in a narrow band just outside.
    const edge = pace < zoneLo ? zoneLo - pace : pace > zoneHi ? pace - zoneHi : 0;
    zoneT += dt * (edge === 0 ? 1 : edge < 6 ? 0.5 : 0);
    // Coaching line, only when it changes.
    const word = t < gaspUntil ? 'gasp' : edge === 0 ? 'steady' : pace < zoneLo ? 'slow' : 'fast';
    if (word !== lastWord) {
      lastWord = word;
      if (word === 'steady') msg('<b>Steady…</b>', 'ok');
      else if (word === 'slow') msg('<b>Drifting.</b> <small>Tap a little more.</small>');
      else if (word === 'fast') msg('<b>Easy!</b> <small>Ease off before it gasps.</small>', 'bad');
    }
    $('sg-needle').style.left = `${Math.min(100, pace)}%`;
    $('sg-me').style.left = `${Math.min(100, (dist / LAP) * 100)}%`;
    $('sg-ghost').style.left = `${Math.min(100, (t / TARGET_S) * 100)}%`;
    $('sg-clock').textContent = `${t.toFixed(1)}s · target ${TARGET_S}.0s`;
    scroll += dt * pace * 6;
    $('sg-rail').style.backgroundPositionX = `${-scroll}px`;
    $('sg-turf').style.backgroundPositionX = `${-scroll * 1.4}px`;
    $('sg-horse').style.animationDuration = `${Math.max(0.25, 0.9 - pace / 120)}s`;
    if (dist >= LAP || t >= MAX_S) return finish();
    raf = requestAnimationFrame(frame);
  }

  function tap(e?: Event): void {
    e?.preventDefault();
    if (state === 'intro') return start();
    if (state !== 'running' || t < gaspUntil) return;
    pace += push;
    if (pace >= GASP_AT) {
      gasps++;
      pace = 28;
      gaspUntil = t + 0.8;
      lastWord = 'gasp';
      msg(`<b>${horse.name} gasps!</b><br><small>Too hard. Settle into a rhythm.</small>`, 'bad');
      const p = $('sg-puff'); p.hidden = false;
      timers.push(window.setTimeout(() => { p.hidden = true; }, 800));
      const s = $('sg-scene'); s.classList.remove('rattle'); void s.offsetWidth; s.classList.add('rattle');
    }
  }

  function start(): void {
    state = 'running';
    pace = ZONE_MID * 0.7;
    $('sg-go').textContent = 'GALLOP';
    $('sg-count').textContent = 'One lap';
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function finish(): void {
    if (state === 'done') return;
    state = 'done';
    cancelAnimationFrame(raf);
    const finished = dist >= LAP;
    const zone = zoneT / t;
    const off = finished ? Math.abs(t - TARGET_S) : 99;
    const timeAcc = Math.max(0, Math.min(1, 1 - (off - 0.3) / 2.7));
    const pct = Math.max(0, 100 * (0.75 * zone + 0.25 * timeAcc) - gasps * 4);
    const margin = !finished ? `Ran out of time: ${Math.round((dist / LAP) * 100)}% of the lap.`
      : off <= 0.3 ? `Lap in ${t.toFixed(1)}s. Right on target!`
      : `Lap in ${t.toFixed(1)}s, ${off.toFixed(1)}s ${t < TARGET_S ? 'fast' : 'slow'}.`;
    const extra = `${Math.round(zone * 100)}% of the lap in the green${gasps ? ` · ${gasps} gasp${gasps > 1 ? 's' : ''}` : ''}.`;
    $('sg-go').textContent = 'Finished';
    msg(`<b>${margin}</b><br><small>${extra}</small>`, off <= 0.3 ? 'perfect' : '');
    timers.push(window.setTimeout(() => onDone({ pct, grade: gradeFor(pct), balked: false, quit: false, starts: [], margin: `${margin} ${extra}` }), 1100));
  }

  if (opts.exhausted && Math.random() < 0.5) {
    msg(`<b>${horse.name} won't gallop today.</b><br><small>It's exhausted. Let it rest.</small>`, 'bad');
    $('sg-go').textContent = 'Back to stable';
    state = 'done';
    $('sg-go').addEventListener('click', () => onDone({ pct: 0, grade: 'D', balked: true, quit: false, starts: [], margin: '' }));
  } else {
    $('sg-go').addEventListener('pointerdown', tap);
  }
  const key = (e: KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && state !== 'done') tap(e); };
  window.addEventListener('keydown', key);
  $('sg-quit').addEventListener('click', () => {
    cancelAnimationFrame(raf);
    state = 'done';
    onDone({ pct: 0, grade: 'D', balked: false, quit: true, starts: [], margin: '' });
  });

  return () => { cancelAnimationFrame(raf); while (timers.length) clearTimeout(timers.pop()); window.removeEventListener('keydown', key); };
}
