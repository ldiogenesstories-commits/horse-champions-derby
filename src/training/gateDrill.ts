// Gate Drill — tap the instant the bell rings; ignore the fidgets.
// 5 starts. Score per start comes from reaction time; a false start scores 0.
// Fiery horses fidget more (fake-outs). Lazy horses may doze: wake them first.
import type { HorseDef } from '../sim/types';
import { portraitSVG } from '../game/portrait';
import { gradeFor, type Grade } from './grades';

export interface DrillResult {
  pct: number;
  grade: Grade;
  balked: boolean;
  quit: boolean;
  starts: { rt: number | null; falseStart: boolean; score: number }[];
}

const STARTS = 5;
const FULL_MARKS_RT = 0.28; // s
const ZERO_RT = 0.98; // s

export function runGateDrill(root: HTMLElement, horse: HorseDef, opts: { exhausted: boolean }, onDone: (r: DrillResult) => void): () => void {
  const fire = horse.fire;
  const lazy = horse.need === 'lazy';
  const starts: DrillResult['starts'] = [];
  const timers: number[] = [];
  let state: 'intro' | 'waiting' | 'bell' | 'between' | 'done' = 'intro';
  let bellAt = 0;
  let dozing = false;
  let woke = false;

  root.innerHTML = `
    <div class="drill-top">
      <div><b>Gate Drill</b><span id="gd-count">Gate Skill · Acceleration</span></div>
      <button class="ghost small" id="gd-quit">Back to stable</button>
    </div>
    <div class="gd-scene" id="gd-scene">
      <svg viewBox="0 0 360 230" class="gd-gate" id="gd-gate" aria-hidden="true">
        <rect x="0" y="0" width="360" height="230" fill="#9CC3D5"/>
        <rect x="0" y="170" width="360" height="60" fill="#B98B5E"/>
        <rect x="0" y="164" width="360" height="8" fill="#FFFBF2"/>
        <g id="gd-gatebox">
          <rect x="40" y="40" width="280" height="140" rx="6" fill="#3E6B48" stroke="#24402B" stroke-width="4"/>
          <rect x="40" y="28" width="280" height="22" rx="4" fill="#E2A93B" stroke="#24402B" stroke-width="4"/>
          <text x="180" y="44" text-anchor="middle" font-size="14" font-weight="900" fill="#2B2118">STARTING GATE</text>
          <rect x="60" y="60" width="70" height="120" fill="#24402B"/>
          <rect x="230" y="60" width="70" height="120" fill="#24402B"/>
          <rect x="145" y="60" width="70" height="120" fill="#1B2E20"/>
        </g>
      </svg>
      <div class="gd-horse" id="gd-horse">${portraitSVG(horse, 92)}</div>
      <div class="gd-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="gd-lamp" id="gd-lamp"></div>
      <div class="gd-zzz" id="gd-zzz" hidden>Zzz</div>
      <div class="gd-msg" id="gd-msg" aria-live="polite">Tap when the bell rings.<br><small>Ignore the fidgets.</small></div>
    </div>
    <div class="gd-pips" id="gd-pips">${Array.from({ length: STARTS }, () => '<span></span>').join('')}</div>
    <button class="gd-go" id="gd-go">Load the gate</button>
  `;
  const $ = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  const msg = (html: string, cls = '') => { const m = $('gd-msg'); m.innerHTML = html; m.className = `gd-msg ${cls}`; };
  const lamp = (cls: string) => { $('gd-lamp').className = `gd-lamp ${cls}`; };
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { while (timers.length) clearTimeout(timers.pop()); };

  const pip = (i: number, cls: string) => { ($('gd-pips').children[i] as HTMLElement).className = cls; };

  function twitch(): void {
    if (state !== 'waiting') return;
    const h = $('gd-horse');
    h.classList.remove('twitch');
    void h.offsetWidth;
    h.classList.add('twitch');
    $('gd-scene').classList.remove('rattle');
    void $('gd-scene').offsetWidth;
    $('gd-scene').classList.add('rattle');
  }

  function loadStart(): void {
    if (starts.length >= STARTS) return finish();
    state = 'waiting';
    woke = false;
    dozing = lazy && Math.random() < 0.35;
    $('gd-zzz').hidden = !dozing;
    lamp('wait');
    msg(`Start ${starts.length + 1} of ${STARTS}<br><small>Steady…</small>`);
    $('gd-go').textContent = 'GO!';
    $('gd-count').textContent = `Start ${starts.length + 1} of ${STARTS}`;
    const wait = 1400 + Math.random() * 2000;
    // Fake-outs: fiery horses fidget more.
    const fakes = Math.round(fire * 3 + Math.random() * 1.2);
    for (let i = 0; i < fakes; i++) later(twitch, 300 + Math.random() * (wait - 450));
    later(ringBell, wait);
  }

  function ringBell(): void {
    if (state !== 'waiting') return;
    state = 'bell';
    bellAt = performance.now();
    lamp('go');
    msg(dozing ? '<b>DING!</b><br><small>Wake up! Tap twice!</small>' : '<b>DING!</b>', 'ding');
    later(() => { if (state === 'bell') record(null, false); }, 1500);
  }

  function record(rt: number | null, falseStart: boolean): void {
    clearTimers();
    let score = 0;
    if (rt !== null && !falseStart) score = Math.max(0, Math.min(1, 1 - (rt - FULL_MARKS_RT) / (ZERO_RT - FULL_MARKS_RT)));
    starts.push({ rt, falseStart, score });
    const i = starts.length - 1;
    $('gd-zzz').hidden = true;
    if (falseStart) { lamp('bad'); msg('False start!', 'bad'); pip(i, 'bad'); }
    else if (rt === null) { lamp('bad'); msg('Too slow! The gate opened without you.', 'bad'); pip(i, 'bad'); }
    else {
      const ms = Math.round(rt * 1000);
      const word = score >= 0.975 ? 'PERFECT START!' : score >= 0.85 ? 'Sharp!' : score >= 0.6 ? 'Good.' : 'A bit slow.';
      msg(`<b>${word}</b><br><small>${ms} ms</small>`, score >= 0.975 ? 'perfect' : 'ok');
      lamp('done');
      pip(i, score >= 0.975 ? 'perfect' : score >= 0.6 ? 'ok' : 'meh');
      $('gd-horse').classList.add('burst');
      later(() => $('gd-horse').classList.remove('burst'), 500);
    }
    state = 'between';
    $('gd-go').textContent = starts.length >= STARTS ? 'See results' : 'Next start';
    later(() => { if (state === 'between') { if (starts.length >= STARTS) finish(); else loadStart(); } }, 1300);
  }

  function finish(): void {
    if (state === 'done') return;
    state = 'done';
    clearTimers();
    const pct = (starts.reduce((a, s) => a + s.score, 0) / STARTS) * 100;
    onDone({ pct, grade: gradeFor(pct), balked: false, quit: false, starts });
  }

  function tap(e?: Event): void {
    e?.preventDefault();
    if (state === 'intro' || state === 'between') {
      if (state === 'between') clearTimers();
      if (state === 'between' && starts.length >= STARTS) return finish();
      return loadStart();
    }
    if (state === 'waiting') return record(null, true);
    if (state === 'bell') {
      if (dozing && !woke) {
        woke = true;
        $('gd-zzz').hidden = true;
        msg('<b>DING!</b><br><small>Awake! Go!</small>', 'ding');
        return;
      }
      record((performance.now() - bellAt) / 1000, false);
    }
  }

  // An exhausted horse may refuse to load at all.
  if (opts.exhausted && Math.random() < 0.5) {
    msg(`<b>${horse.name} refuses to enter the gate!</b><br><small>It's exhausted. Let it rest.</small>`, 'bad');
    $('gd-go').textContent = 'Back to stable';
    state = 'done';
    $('gd-go').addEventListener('click', () => onDone({ pct: 0, grade: 'D', balked: true, quit: false, starts }));
  } else {
    $('gd-go').addEventListener('pointerdown', tap);
    $('gd-scene').addEventListener('pointerdown', tap);
  }
  const key = (e: KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && state !== 'done') tap(e); };
  window.addEventListener('keydown', key);
  $('gd-quit').addEventListener('click', () => { clearTimers(); state = 'done'; onDone({ pct: 0, grade: 'D', balked: false, quit: true, starts }); });

  return () => { clearTimers(); window.removeEventListener('keydown', key); };
}
