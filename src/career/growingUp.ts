// Growing up: a newly bred foal goes through three short, charming beats before its career
// begins, and each one quietly teaches a mechanic.
//   1. Birth       - the payoff for breeding (parents, coat, gifts).
//   2. Foal care   - how you raise it nudges its hidden personality (the Need system).
//   3. Gate school - a yearling learns to break clean from the gate (the start mechanic).
//   4. Ready       - it grows up, gets groomed and walks out with its rider: career begins.
// The first foal is guided with short notes; later foals play the same beats without the
// explaining, and every beat can be skipped. No career weeks are used up.
import type { HorseDef, Need } from '../sim/types';
import type { Look } from '../game/horseBody';
import type { Jockey } from '../game/jockey';
import { puppetFrames } from '../game/puppet';
import { sparksOf } from '../sim/growth';
import { NEED_INFO } from '../sim/personality';
import { curtainSwish, gateBell, victoryFanfare } from '../game/sfx';
import { playSample } from '../game/audioAssets';
import { CAREER_RACES } from './career';
import hills from '../game/scenery/hills.webp';
import sun from '../game/scenery/sun.webp';
import cloud1 from '../game/scenery/cloud1.webp';
import tree1 from '../game/scenery/tree1.webp';
import tree2 from '../game/scenery/tree2.webp';

const SEEN_KEY = 'hcd-grow-seen';
/** Has this phone already raised a foal (so later ones skip the explaining)? */
export const seenGrowingUp = (): boolean => { try { return !!localStorage.getItem(SEEN_KEY); } catch { return true; } };
const markSeen = (): void => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ } };

/** The foal-care choices: each nurtures one personality, shown as a plain activity. */
const CARE: Record<Need, { icon: string; title: string; line: string; after: string }> = {
  intense: { icon: '🏃', title: 'Race around', line: 'Zoomies and dust', after: 'tore around until it ran out of breath, then grinned' },
  lazy: { icon: '😴', title: 'Nap in the straw', line: 'A cozy snooze', after: 'flopped down in the straw and was asleep in seconds' },
  social: { icon: '🐴', title: 'Meet the herd', line: 'Sniff noses with friends', after: 'trotted from friend to friend, never leaving anyone out' },
  loner: { icon: '🌿', title: 'Quiet corner', line: 'Grass and peace', after: 'wandered off to graze, perfectly content on its own' },
  showoff: { icon: '🎪', title: 'Show off', line: 'Prance for the crowd', after: 'pranced along the fence, head high, waiting for applause' },
};
const ALL_NEEDS = Object.keys(CARE) as Need[];

export interface GrowOpts {
  horse: HorseDef;
  look: Look;
  jockey: Jockey | null;
  /** Called with the horse's new state at each step so it can be saved. */
  onChange: (patch: { stage?: HorseDef['stage']; need?: Need; gateBonus?: number }) => void;
  onDone: () => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

async function sprite(o: GrowOpts, grow: number, mode: 'stand' | 'walk' | 'lie' | 'graze', rider: Jockey | null = null, frames = 1, width = 560): Promise<string[]> {
  const cs = await puppetFrames(o.horse, rider, frames, width, { mode, look: o.look, grow });
  return cs.map((c) => c.toDataURL('image/png'));
}

export async function runGrowingUp(o: GrowOpts): Promise<void> {
  const first = !seenGrowingUp();
  const h = o.horse;
  const root = document.createElement('div');
  root.className = 'grow';
  root.innerHTML = `
    <div class="grow-bg">
      <img class="grow-sun" src="${sun}" alt="">
      <img class="grow-cloud" src="${cloud1}" alt="">
      <img class="grow-hills" src="${hills}" alt="">
      <img class="grow-tree t1" src="${tree1}" alt="">
      <img class="grow-tree t2" src="${tree2}" alt="">
      <div class="grow-floor"></div>
      <div class="grow-glow"></div>
    </div>
    <div class="grow-stage"><img class="grow-horse" alt=""></div>
    <div class="grow-fx"></div>
    <div class="grow-panel" hidden></div>
    <button class="grow-skip" type="button" hidden>Skip ›</button>`;
  document.body.append(root);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const horseImg = $<HTMLImageElement>('.grow-horse');
  const panel = $<HTMLElement>('.grow-panel');
  const skipBtn = $<HTMLButtonElement>('.grow-skip');
  const fx = $<HTMLElement>('.grow-fx');
  let skipping = false;
  skipBtn.addEventListener('click', () => { skipping = true; skipBtn.hidden = true; });
  const wait = (ms: number) => (skipping ? Promise.resolve() : sleep(ms));

  /** Keep the horse standing on the ground just above the caption panel. */
  const fit = (): void => { root.style.setProperty('--ph', `${panel.hidden ? 150 : panel.offsetHeight}px`); };
  const say = (html: string, buttons: [string, string][] = []): Promise<string> => new Promise((res) => {
    panel.hidden = false;
    panel.innerHTML = `${html}${buttons.length ? `<div class="grow-btns">${buttons.map(([id, label]) => `<button type="button" class="big" data-b="${id}">${label}</button>`).join('')}</div>` : ''}`;
    panel.classList.remove('pop'); void panel.offsetWidth; panel.classList.add('pop');
    fit();
    panel.querySelectorAll<HTMLButtonElement>('[data-b]').forEach((b) => b.addEventListener('click', () => res(b.dataset.b!), { once: true }));
    if (!buttons.length) res('');
  });
  const note = (t: string) => (first ? `<p class="grow-note">${t}</p>` : '');
  const sparkle = (n = 22) => {
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      s.className = 'grow-spark';
      s.style.cssText = `left:${35 + Math.random() * 30}%;top:${45 + Math.random() * 20}%;--dx:${(Math.random() - 0.5) * 260}px;--dy:${-60 - Math.random() * 200}px;background:${['#FFD23F', '#FFFBF2', '#F7A8B8', '#9CD3EE'][i % 4]}`;
      fx.append(s);
      setTimeout(() => s.remove(), 1400);
    }
  };
  const setHorse = (src: string, cls = '') => { horseImg.src = src; horseImg.className = `grow-horse ${cls}`; };

  const close = () => { root.classList.add('out'); setTimeout(() => root.remove(), 500); };

  // Sprites (foal proportions at 0, a lanky yearling at 0.55).
  const [foalStand] = await sprite(o, 0, 'stand');
  const [foalGraze] = await sprite(o, 0, 'graze');
  const [yearStand] = await sprite(o, 0.55, 'stand');
  root.classList.add('on');

  // ---- 1. Birth ----
  root.dataset.scene = 'barn';
  skipBtn.hidden = first; // first-time players watch the whole thing the first time
  curtainSwish(true);
  await say('<p class="grow-big">A new foal is on the way…</p>');
  await sleep(first ? 1800 : 1100);
  setHorse(foalStand, 'born');
  playSample('whinny', 0.7);
  sparkle(30);
  await wait(900);
  const gifts = sparksOf(h);
  const lineLine = h.sire && h.dam ? `${esc(h.sire)} × ${esc(h.dam)}` : '';
  await say(`
    <p class="grow-eyebrow">It's a ${h.sex === 'mare' ? 'filly' : 'colt'}!</p>
    <p class="grow-big">${esc(h.name)}</p>
    ${lineLine ? `<p class="grow-sub">${lineLine}</p>` : ''}
    ${gifts.length ? `<p class="grow-gift">✨ Born gifted: ${gifts.map((g) => ({ speed: 'Speed', stamina: 'Stamina', accel: 'Acceleration', guts: 'Guts', gate: 'Gate Skill', agility: 'Agility' })[g]).join(' & ')}</p>` : ''}
    ${note(`${esc(h.name)} can't race yet. Raise it through two quick stages first. It costs no weeks on your career clock.`)}`,
  [['go', first ? 'Raise ' + esc(h.name) : 'Next ›']]);
  skipBtn.hidden = false;
  o.onChange({ stage: 'foal' });

  // ---- 2. Foal care (personality) ----
  root.dataset.scene = 'field';
  curtainSwish(false);
  setHorse(foalStand, 'idle');
  const inherited = h.need ?? 'social';
  const others = ALL_NEEDS.filter((n) => n !== inherited).sort(() => Math.random() - 0.5).slice(0, 2);
  const options = [inherited, ...others].sort(() => Math.random() - 0.5);
  await say(`
    <p class="grow-eyebrow">Foal days</p>
    <p class="grow-big">How should ${esc(h.name)} spend the day?</p>
    ${note('Every horse has a hidden personality that changes how it trains and races. How you raise a foal nudges it. You\'ll learn the real thing as your trust grows.')}
    <div class="grow-cards">${options.map((n) => `<button type="button" class="grow-card" data-b="${n}"><span class="gc-i">${CARE[n].icon}</span><b>${CARE[n].title}</b><small>${CARE[n].line}</small></button>`).join('')}</div>`,
  []);
  const picked = await new Promise<Need>((res) => {
    panel.querySelectorAll<HTMLButtonElement>('.grow-card').forEach((b) => b.addEventListener('click', () => res(b.dataset.b as Need), { once: true }));
  });
  // A stay-the-course day reinforces what it is; a different day has a good chance to nudge it.
  const nudged = picked !== inherited && Math.random() < 0.45;
  const finalNeed: Need = nudged ? picked : inherited;
  o.onChange({ need: finalNeed });
  setHorse(picked === 'loner' ? foalGraze : foalStand, picked === 'intense' ? 'zoom' : picked === 'showoff' ? 'prance' : picked === 'lazy' ? 'nap' : 'idle');
  if (picked === 'lazy') fx.insertAdjacentHTML('beforeend', '<b class="grow-zzz">💤</b>');
  sparkle(12);
  await say(`
    <p class="grow-big">${esc(h.name)} ${CARE[picked].after}.</p>
    ${note(nudged ? `That day left a mark. ${esc(h.name)}'s personality shifted a little. What you do with a young horse shapes it for good.` : 'Some days just confirm who a horse already is. Trust grows with every kind moment, and trust is what reveals the hidden personality.')}`,
  [['go', 'Next ›']]);
  o.onChange({ stage: 'yearling' });

  // ---- 3. Gate school (the start mechanic) ----
  root.dataset.scene = 'gate';
  curtainSwish(false);
  setHorse(yearStand, 'idle');
  const gateOk = await gateSchool(root, panel, h.name, first, wait, () => skipping, fit);
  o.onChange({ gateBonus: gateOk });

  // ---- 4. Ready: grown up, groomed, out with a rider ----
  root.dataset.scene = 'ready';
  skipBtn.hidden = true;
  curtainSwish(true);
  await say('<p class="grow-big">Time flies when you\'re growing…</p>');
  setHorse(yearStand, 'idle');
  await sleep(900);
  const walk = await sprite(o, 1, 'walk', o.jockey, 8, 620);
  playSample('whinny', 0.8);
  sparkle(40);
  victoryFanfare('regular');
  panel.hidden = true;
  fit();
  const strip = document.createElement('div');
  strip.className = 'grow-walk';
  strip.innerHTML = `<img alt="">`;
  fx.append(strip);
  const wimg = strip.querySelector('img')!;
  horseImg.className = 'grow-horse gone';
  let f = 0;
  const timer = setInterval(() => { wimg.src = walk[f++ % walk.length]; }, 110);
  await sleep(2600);
  clearInterval(timer);
  strip.remove();
  setHorse(walk[2], 'idle ready');
  await say(`
    <p class="grow-eyebrow">All grown up</p>
    <p class="grow-big">${esc(h.name)} is ready to race!</p>
    <p class="grow-sub">Your career begins: ${CAREER_RACES} races${first ? ', 50 weeks to make them count' : ''}.</p>
    ${note('From here: train in the stable, groom and feed, then enter races. Make every week count.')}`,
  [['go', 'To the stable']]);
  o.onChange({ stage: 'racer' });
  markSeen();
  close();
  o.onDone();
}

/** Tap when the bell rings. Returns the stat bonus earned (0-4) for the gate skill. */
async function gateSchool(
  root: HTMLElement, panel: HTMLElement, name: string, first: boolean,
  wait: (ms: number) => Promise<void>, skipped: () => boolean, fit: () => void,
): Promise<number> {
  void wait;
  const note = (t: string) => (first ? `<p class="grow-note">${t}</p>` : '');
  const gate = document.createElement('div');
  gate.className = 'grow-gate';
  gate.innerHTML = '<i class="gd l"></i><i class="gd r"></i>';
  root.querySelector('.grow-stage')!.append(gate);
  const ask = (html: string, buttons: [string, string][]) => new Promise<string>((res) => {
    panel.hidden = false;
    panel.innerHTML = `${html}<div class="grow-btns">${buttons.map(([id, l]) => `<button type="button" class="big" data-b="${id}">${l}</button>`).join('')}</div>`;
    panel.classList.remove('pop'); void panel.offsetWidth; panel.classList.add('pop');
    fit();
    panel.querySelectorAll<HTMLButtonElement>('[data-b]').forEach((b) => b.addEventListener('click', () => res(b.dataset.b!), { once: true }));
  });
  const start = await ask(`
    <p class="grow-eyebrow">Gate school</p>
    <p class="grow-big">Break clean from the gate</p>
    ${note(`Every race starts at the gate. Good gate skill means a fast, clean break. Watch the bell, then tap GO the instant it rings. Don't jump early!`)}`,
  [['go', 'Line up'], ['skip', 'Skip (easy start)']]);
  if (start === 'skip' || skipped()) { gate.remove(); return 1; }

  let best = 0;
  let label = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await new Promise<{ ms: number; early: boolean }>((res) => {
      panel.innerHTML = `<p class="grow-big">${attempt ? 'One more try…' : 'Steady…'}</p><button type="button" class="big grow-tap">GO!</button>`;
      panel.classList.remove('pop'); void panel.offsetWidth; panel.classList.add('pop');
      fit();
      const btn = panel.querySelector<HTMLButtonElement>('.grow-tap')!;
      let rang = 0;
      const delay = 1100 + Math.random() * 1900;
      const t = setTimeout(() => { rang = performance.now(); gateBell(); gate.classList.add('ring'); btn.classList.add('now'); }, delay);
      btn.addEventListener('pointerdown', () => {
        clearTimeout(t);
        res(rang ? { ms: performance.now() - rang, early: false } : { ms: 0, early: true });
      }, { once: true });
    });
    gate.classList.remove('ring');
    if (result.early) {
      label = 'Jumped the gate!';
      best = Math.max(best, 0);
    } else {
      gate.classList.add('open');
      const g = result.ms < 380 ? 4 : result.ms < 600 ? 3 : result.ms < 900 ? 2 : 1;
      if (g >= best) { best = g; label = `${['', 'Slow start', 'Decent break', 'Great break!', 'Perfect break!'][g]} (${Math.round(result.ms)} ms)`; }
      await sleep(900);
      gate.classList.remove('open');
      if (g >= 3) break;
    }
  }
  gate.remove();
  await ask(`
    <p class="grow-big">${label}</p>
    <p class="grow-sub">${best ? `${esc(name)} picked up +${best} Gate Skill.` : `${esc(name)} needs a little practice, but no harm done.`}</p>
    ${note('You\'ll meet this again at the start of every race. The better the gate skill, the better the break.')}`,
  [['go', 'Next ›']]);
  return best;
}
