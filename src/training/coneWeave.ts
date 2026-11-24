// Cone Weave — rows of cones roll toward your horse; drag left/right to
// thread each gap. 12 rows, gaps narrow and speed rises as you go.
// The horse follows your finger with its own feel: lazy horses lag,
// fiery horses respond fast but overshoot.
import type { HorseDef } from '../sim/types';
import { portraitSVG } from '../game/portrait';
import { gradeFor } from './grades';
import type { DrillResult } from './gateDrill';

const ROWS = 12;
const HORSE_Y = 0.72; // fraction of scene height
const HORSE_HALF = 0.075; // fraction of lane width (portrait is round, so a little overlap is forgiven)
const LANE_INSET = 0.08; // lane starts 8% in from each side of the scene
const CONES_PER_ROW = 9;

interface Row { el: HTMLElement; gap: number; width: number; spawn: number; travel: number; done: boolean }

export function runConeWeave(root: HTMLElement, horse: HorseDef, opts: { exhausted: boolean }, onDone: (r: DrillResult & { margin: string }) => void): () => void {
  const lazy = horse.need === 'lazy';
  const stiffness = lazy ? 26 : 48 + horse.fire * 40; // spring pull toward the finger
  const damping = (lazy ? 9 : 12) - horse.fire * 4.5; // low damping = overshoot
  let state: 'intro' | 'running' | 'done' = 'intro';
  let x = 0.5;
  let v = 0;
  let target = 0.5;
  let t = 0;
  let last = 0;
  let raf = 0;
  let rows: Row[] = [];
  const scores: number[] = [];
  const timers: number[] = [];

  root.innerHTML = `
    <div class="drill-top">
      <div><b>Cone Weave</b><span id="cw-count">Agility</span></div>
      <button class="ghost small" id="cw-quit">Back to stable</button>
    </div>
    <div class="cw-scene" id="cw-scene">
      <div class="cw-lane" id="cw-lane"></div>
      <div class="cw-rows" id="cw-rows"></div>
      <div class="cw-horse" id="cw-horse">${portraitSVG(horse, 56)}</div>
      <div class="gd-msg cw-msg" id="cw-msg" aria-live="polite">Drag left and right to thread each gap.<br><small>${lazy ? `${horse.name} is a little slow to turn. Move early.` : horse.fire > 0.6 ? `${horse.name} turns sharp and overshoots. Small moves.` : 'Line up early and hold steady.'}</small></div>
    </div>
    <div class="gd-pips sd-pips" id="cw-pips">${Array.from({ length: ROWS }, () => '<span></span>').join('')}</div>
    <button class="gd-go cw-go" id="cw-go">Start the weave</button>
  `;
  const $ = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  const msg = (html: string, cls = '') => { const m = $('cw-msg'); m.innerHTML = html; m.className = `gd-msg cw-msg ${cls}`; };
  const pip = (i: number, cls: string) => { ($('cw-pips').children[i] as HTMLElement).className = cls; };
  const scene = $('cw-scene');

  function makeRow(i: number, at: number): Row {
    const k = i / (ROWS - 1);
    const width = 0.38 - 0.12 * k; // gap narrows from 38% to 26% of the lane
    const prev = rows.length ? rows[rows.length - 1].gap : 0.5;
    // Keep consecutive gaps reachable but make them move.
    let gap = 0.5;
    for (let tries = 0; tries < 8; tries++) {
      gap = width / 2 + 0.04 + Math.random() * (1 - width - 0.08);
      if (Math.abs(gap - prev) > 0.18 && Math.abs(gap - prev) < 0.6) break;
    }
    const el = document.createElement('div');
    el.className = 'cw-row';
    el.dataset.gap = String(gap);
    let html = '';
    for (let c = 0; c < CONES_PER_ROW; c++) {
      const cx = (c + 0.5) / CONES_PER_ROW;
      if (Math.abs(cx - gap) < width / 2 + 0.045) continue; // keep cones clear of the posts
      html += `<i style="left:${cx * 100}%"></i>`;
    }
    // Gap posts mark the opening exactly.
    html += `<b style="left:${(gap - width / 2) * 100}%"></b><b style="left:${(gap + width / 2) * 100}%"></b>`;
    el.innerHTML = html;
    $('cw-rows').appendChild(el);
    return { el, gap, width, spawn: at, travel: 2.3 - 0.8 * k, done: false };
  }

  function judge(r: Row, i: number): void {
    r.done = true;
    const dx = Math.abs(x - r.gap);
    const room = r.width / 2 - HORSE_HALF;
    let s: number; let word: string; let cls: string;
    if (dx <= Math.max(0.02, room * 0.35)) { s = 1; word = 'Threaded it!'; cls = 'perfect'; }
    else if (dx <= room) { s = 0.7; word = 'Clean'; cls = 'ok'; }
    else if (dx <= room + 0.035) { s = 0.3; word = 'Brushed a cone'; cls = 'meh'; }
    else { s = 0; word = 'Knocked a cone!'; cls = 'bad'; }
    scores.push(s);
    pip(i, cls);
    msg(`<b>${word}</b>`, cls === 'perfect' ? 'perfect' : cls === 'bad' ? 'bad' : '');
    if (s === 0) {
      r.el.classList.add('hit');
      scene.classList.remove('rattle'); void scene.offsetWidth; scene.classList.add('rattle');
    } else r.el.classList.add('passed');
    $('cw-count').textContent = `Row ${i + 1} of ${ROWS}`;
  }

  function frame(now: number): void {
    if (state !== 'running') return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    t += dt;
    // Spring toward the finger.
    const a = stiffness * (target - x) - damping * v;
    v += a * dt;
    x = Math.max(HORSE_HALF, Math.min(1 - HORSE_HALF, x + v * dt));
    $('cw-horse').style.left = `${(LANE_INSET + x * (1 - 2 * LANE_INSET)) * 100}%`;
    $('cw-horse').style.transform = `translateX(-50%) rotate(${Math.max(-18, Math.min(18, v * 30))}deg)`;
    rows.forEach((r, i) => {
      const p = (t - r.spawn) / r.travel; // 0 at top, 1 at the horse
      r.el.style.top = `${Math.max(-10, p * HORSE_Y * 100)}%`;
      r.el.style.opacity = p < 0 ? '0' : '1';
      if (!r.done && p >= 1) judge(r, i);
      if (p > 1.35) r.el.style.opacity = '0';
    });
    $('cw-lane').style.backgroundPositionY = `${t * 160}px`;
    if (rows.every((r) => r.done) && t > rows[rows.length - 1].spawn + rows[rows.length - 1].travel + 0.5) return finish();
    raf = requestAnimationFrame(frame);
  }

  function setTarget(e: PointerEvent): void {
    if (state !== 'running') return;
    const box = scene.getBoundingClientRect();
    const sx = (e.clientX - box.left) / box.width;
    target = Math.max(0, Math.min(1, (sx - LANE_INSET) / (1 - 2 * LANE_INSET)));
  }

  function start(): void {
    state = 'running';
    msg('<b>Here they come…</b>');
    $('cw-go').textContent = 'Drag on the track ↔';
    $('cw-go').classList.add('hint');
    let at = 0.6;
    for (let i = 0; i < ROWS; i++) {
      rows.push(makeRow(i, at));
      at += 1.35 - 0.45 * (i / (ROWS - 1));
    }
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function finish(): void {
    if (state === 'done') return;
    state = 'done';
    cancelAnimationFrame(raf);
    const pct = (scores.reduce((a, b) => a + b, 0) / ROWS) * 100;
    const hits = scores.filter((s) => s === 0).length;
    const threaded = scores.filter((s) => s === 1).length;
    const margin = hits === 0 ? `Clean run! ${threaded} of ${ROWS} rows threaded.` : `${hits} cone${hits > 1 ? 's' : ''} knocked · ${threaded} of ${ROWS} threaded.`;
    $('cw-go').textContent = 'Finished';
    msg(`<b>${margin}</b>`, hits === 0 ? 'perfect' : '');
    timers.push(window.setTimeout(() => onDone({ pct, grade: gradeFor(pct), balked: false, quit: false, starts: [], margin }), 1000));
  }

  if (opts.exhausted && Math.random() < 0.5) {
    msg(`<b>${horse.name} won't run the cones today.</b><br><small>It's exhausted. Let it rest.</small>`, 'bad');
    $('cw-go').textContent = 'Back to stable';
    state = 'done';
    $('cw-go').addEventListener('click', () => onDone({ pct: 0, grade: 'D', balked: true, quit: false, starts: [], margin: '' }));
  } else {
    $('cw-go').addEventListener('click', () => { if (state === 'intro') start(); });
    // Drag anywhere on the track (or the button strip) to steer.
    for (const el of [scene, $('cw-go')]) {
      el.addEventListener('pointerdown', (e) => { if (state === 'running') { e.preventDefault(); setTarget(e); } });
      el.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') setTarget(e); });
    }
  }
  const key = (e: KeyboardEvent) => {
    if (state === 'intro' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); start(); }
    if (state !== 'running') return;
    if (e.key === 'ArrowLeft' || e.key === 'a') target = Math.max(0, target - 0.1);
    if (e.key === 'ArrowRight' || e.key === 'd') target = Math.min(1, target + 0.1);
  };
  window.addEventListener('keydown', key);
  $('cw-quit').addEventListener('click', () => {
    cancelAnimationFrame(raf);
    state = 'done';
    onDone({ pct: 0, grade: 'D', balked: false, quit: true, starts: [], margin: '' });
  });

  return () => { cancelAnimationFrame(raf); while (timers.length) clearTimeout(timers.pop()); window.removeEventListener('keydown', key); };
}
