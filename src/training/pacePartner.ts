// Pace Partner — gallop alongside a stablemate whose pace keeps changing.
// HOLD to rein in, let go to move up. Stay level the whole way and finish
// in a dead heat. Teaches the race's Hold button. Builds Stamina and Trust.
// Intense horses fight the hold (slow to settle); lazy horses are slow to move up.
import type { HorseDef } from '../sim/types';
import { portraitSVG } from '../game/portrait';
import { gradeFor } from './grades';
import type { DrillResult } from './gateDrill';

const LAP = 22; // distance units; partner averages 1 unit/s
const LEVEL = 0.35; // |gap| for full credit
const NEAR = 0.85; // |gap| for half credit

export function runPacePartner(root: HTMLElement, horse: HorseDef, opts: { exhausted: boolean }, onDone: (r: DrillResult & { margin: string }) => void): () => void {
  const intense = horse.need === 'intense';
  const lazy = horse.need === 'lazy';
  const settle = intense ? 0.55 : 1.1; // how fast HOLD slows you
  const surge = lazy ? 0.55 : 1.0; // how fast you move up when released
  const partner: HorseDef = { ...horse, name: 'Stablemate', color: '#3E6B48', coat: horse.coat === 'palomino' ? 'bay' : 'palomino', marking: 'snip' };
  let state: 'intro' | 'running' | 'done' = 'intro';
  let holding = false;
  let you = 0;
  let mate = 0;
  let v = 1;
  let mv = 1;
  let t = 0;
  let last = 0;
  let raf = 0;
  let credit = 0;
  let scroll = 0;
  const seed = Math.random() * 10;
  const timers: number[] = [];

  root.innerHTML = `
    <div class="drill-top">
      <div><b>Pace Partner</b><span id="pp-count">Stamina · Trust</span></div>
      <button class="ghost small" id="pp-quit">Back to stable</button>
    </div>
    <div class="sd-scene pp-scene" id="pp-scene">
      <div class="sd-sky"></div>
      <div class="sd-rail" id="pp-rail"></div>
      <div class="sd-turf" id="pp-turf"></div>
      <div class="sd-post" id="pp-post"><span>FINISH</span></div>
      <div class="pp-band" id="pp-band"></div>
      <div class="sd-horse pp-mate" id="pp-mate">${portraitSVG(partner, 60)}</div>
      <div class="sd-horse pp-you" id="pp-you">${portraitSVG(horse, 68)}</div>
      <div class="sd-gap" id="pp-gap">Level</div>
      <div class="gd-msg" id="pp-msg" aria-live="polite">Stay level with your stablemate.<br><small>Hold to rein in. Let go to move up.</small></div>
    </div>
    <div class="pp-meter"><div class="pp-meter-band"></div><div class="pp-meter-dot" id="pp-dot"></div><span class="l">Behind</span><span class="c">Level</span><span class="r">Ahead</span></div>
    <button class="gd-go pp-hold" id="pp-hold">Start</button>
  `;
  const $ = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  const msg = (html: string, cls = '') => { const m = $('pp-msg'); m.innerHTML = html; m.className = `gd-msg ${cls}`; };
  let lastWord = '';

  // Partner pace drifts smoothly between ~0.82 and ~1.18.
  const matePace = (time: number) => 1 + 0.12 * Math.sin(time * 0.55 + seed) + 0.06 * Math.sin(time * 1.3 + seed * 2);

  function frame(now: number): void {
    if (state !== 'running') return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    t += dt;
    mv = matePace(t);
    const target = holding ? 0.72 : 1.3;
    const rate = holding ? settle : surge;
    v += (target - v) * Math.min(1, rate * dt * 2);
    you += v * dt;
    mate += mv * dt;
    const gap = you - mate;
    const a = Math.abs(gap);
    credit += dt * (a <= LEVEL ? 1 : a <= NEAR ? 0.5 : 0);
    const word = a <= LEVEL ? 'level' : gap > 0 ? 'ahead' : 'behind';
    if (word !== lastWord) {
      lastWord = word;
      if (word === 'level') msg('<b>Side by side.</b> <small>Nice and steady.</small>', 'ok');
      else if (word === 'ahead') msg('<b>Too far ahead!</b> <small>Hold to rein in.</small>', 'bad');
      else msg('<b>Falling behind.</b> <small>Let go to move up.</small>');
    }
    $('pp-you').style.setProperty('--dx', `${Math.max(-90, Math.min(90, gap * 60))}px`);
    $('pp-dot').style.left = `${50 + Math.max(-48, Math.min(48, gap * 30))}%`;
    $('pp-gap').textContent = a <= LEVEL ? 'Level' : `${a < 1 ? 'Half a length' : a < 2 ? 'A length' : 'Lengths'} ${gap > 0 ? 'ahead' : 'behind'}`;
    scroll += dt * mv * 220;
    $('pp-rail').style.backgroundPositionX = `${-scroll}px`;
    $('pp-turf').style.backgroundPositionX = `${-scroll * 1.4}px`;
    const left = LAP - mate;
    const postK = Math.max(0, Math.min(1, 1 - left / 3));
    $('pp-post').style.left = `${100 - postK * 60}%`;
    $('pp-post').style.opacity = postK > 0 ? '1' : '0';
    $('pp-count').textContent = `${Math.max(0, Math.ceil(left))} to go`;
    if (mate >= LAP) return finish(gap);
    raf = requestAnimationFrame(frame);
  }

  function setHold(h: boolean): void {
    if (state !== 'running') return;
    holding = h;
    $('pp-hold').classList.toggle('pressed', h);
    $('pp-you').classList.toggle('held', h);
  }

  function start(): void {
    state = 'running';
    $('pp-hold').textContent = 'HOLD';
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function finish(gap: number): void {
    state = 'done';
    cancelAnimationFrame(raf);
    const level = credit / t;
    const dead = Math.abs(gap) <= 0.2;
    const finishBonus = Math.abs(gap) <= 0.2 ? 1 : Math.abs(gap) <= LEVEL ? 0.6 : Math.abs(gap) <= NEAR ? 0.3 : 0;
    const pct = 100 * (0.85 * level + 0.15 * finishBonus);
    const margin = dead ? 'Dead heat at the post!' : Math.abs(gap) <= NEAR ? `Finished just ${gap > 0 ? 'ahead' : 'behind'}.` : `Finished well ${gap > 0 ? 'ahead' : 'behind'}.`;
    const extra = `Side by side for ${Math.round(level * 100)}% of the lap.`;
    $('pp-hold').textContent = 'Finished';
    $('pp-hold').classList.remove('pressed');
    msg(`<b>${margin}</b><br><small>${extra}</small>`, dead ? 'perfect' : '');
    timers.push(window.setTimeout(() => onDone({ pct, grade: gradeFor(pct), balked: false, quit: false, starts: [], margin: `${margin} ${extra}` }), 1000));
  }

  const btn = $('pp-hold');
  if (opts.exhausted && Math.random() < 0.5) {
    msg(`<b>${horse.name} won't keep up today.</b><br><small>It's exhausted. Let it rest.</small>`, 'bad');
    btn.textContent = 'Back to stable';
    state = 'done';
    btn.addEventListener('click', () => onDone({ pct: 0, grade: 'D', balked: true, quit: false, starts: [], margin: '' }));
  } else {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (state === 'intro') { start(); return; }
      btn.setPointerCapture(e.pointerId);
      setHold(true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => setHold(false));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  const down = (e: KeyboardEvent) => {
    if (e.repeat || (e.key !== ' ' && e.key !== 'z' && e.key !== 'Enter')) return;
    e.preventDefault();
    if (state === 'intro') start(); else setHold(true);
  };
  const up = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'z' || e.key === 'Enter') setHold(false); };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  $('pp-quit').addEventListener('click', () => {
    cancelAnimationFrame(raf);
    state = 'done';
    onDone({ pct: 0, grade: 'D', balked: false, quit: true, starts: [], margin: '' });
  });
  return () => { cancelAnimationFrame(raf); while (timers.length) clearTimeout(timers.pop()); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
}
