// Grooming kit — a full-body view of the horse.
// Care (once a day each): rub the dust off the coat, pick out all four hooves.
// Style (any time, free): mane, tail, forelock, bows and extras show on the horse.
import type { HorseDef } from '../sim/types';
import type { Look, ManeStyle, TailStyle, ForelockStyle, BowSpot } from '../game/horseBody';
import { puppetFrames, puppetHoofPoints } from '../game/puppet';

export type CareKind = 'brush' | 'hooves';

interface Opts {
  horse: HorseDef;
  look: Look;
  done: Record<CareKind, boolean>;
  onLook: (look: Look) => void;
  onCare: (kind: CareKind) => string; // returns the message to show
  onBack: () => void;
}

// Dust spots on the barrel, in the puppet image's pixels (it is baked at PW wide).
const PW = 640;
const PH = Math.round(PW * 290 / 320);
const DUST = [
  { x: 180, y: 250 }, { x: 270, y: 290 }, { x: 350, y: 245 }, { x: 220, y: 300 },
  { x: 420, y: 215 }, { x: 140, y: 280 },
];
const HOOVES = puppetHoofPoints(PW);
const RUBS_PER_SPOT = 5;

type Tab = 'mane' | 'tail' | 'forelock' | 'bows' | 'extras';
const TABS: { id: Tab; label: string }[] = [
  { id: 'mane', label: 'Mane' }, { id: 'tail', label: 'Tail' }, { id: 'forelock', label: 'Forelock' },
  { id: 'bows', label: 'Bows' }, { id: 'extras', label: 'Extras' },
];
const MANE: [ManeStyle, string][] = [['loose', 'Loose'], ['running', 'Running braid'], ['buttons', 'Button braids'], ['locs', 'Locs']];
const TAIL: [TailStyle, string][] = [['loose', 'Loose'], ['braid', 'Braided'], ['bun', 'Tail bun']];
const FORELOCK: [ForelockStyle, string][] = [['loose', 'Loose'], ['braid', 'Braided']];
const BOWS: [BowSpot, string][] = [['none', 'No bows'], ['mane', 'Mane'], ['tail', 'Tail'], ['both', 'Both']];
const BOW_COLORS: [string, string][] = [['', 'Silks'], ['#F7A8B8', 'Pink'], ['#FFD23F', 'Gold'], ['#9CC3D5', 'Sky'], ['#FFFBF2', 'White']];
const EXTRAS: [keyof Pick<Look, 'pad' | 'wraps' | 'crown' | 'polish'>, string][] = [
  ['pad', 'Saddle pad'], ['wraps', 'Leg wraps'], ['crown', 'Flower crown'], ['polish', 'Hoof polish'],
];

export function runGrooming(root: HTMLElement, o: Opts): () => void {
  let look: Look = { ...o.look };
  let tab: Tab = 'mane';
  let mode: 'style' | CareKind = 'style';
  const dust = DUST.map(() => RUBS_PER_SPOT);
  const picked = [false, false, false, false];
  const done = { ...o.done };

  root.innerHTML = `
    <div class="drill-top">
      <div><b>Grooming kit</b><span>${o.horse.name}</span></div>
      <button class="ghost small" id="gr-back">Back to stable</button>
    </div>
    <div class="gr-stage" id="gr-stage"></div>
    <div class="gr-msg" id="gr-msg" aria-live="polite">Pick a care task, or style ${o.horse.name} below.</div>
    <div class="gr-care">
      <button class="gr-care-btn" id="gr-brush"></button>
      <button class="gr-care-btn" id="gr-hooves"></button>
    </div>
    <div class="gr-tabs" id="gr-tabs" role="tablist">${TABS.map((t) => `<button role="tab" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
    <div class="gr-chips" id="gr-chips"></div>
  `;
  const $ = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  const msg = (t: string) => { $('gr-msg').textContent = t; };

  // The felt puppet in the current look (baked once per look), with dust and hoof targets drawn over it.
  let artKey = '';
  let artUrl = '';
  function art(): void {
    const key = JSON.stringify(look);
    if (key === artKey) return;
    artKey = key;
    void puppetFrames(o.horse, null, 1, PW, { mode: 'stand', look }).then(([c]) => {
      if (key !== artKey) return;
      artUrl = c.toDataURL('image/png');
      const img = root.querySelector<HTMLImageElement>('#gr-art');
      if (img) img.src = artUrl;
    });
  }

  function draw(): void {
    art();
    const dustSVG = mode === 'brush'
      ? DUST.map((d, i) => (dust[i] > 0 ? `<g class="dust" data-i="${i}"><circle cx="${d.x}" cy="${d.y}" r="26" fill="#A98F6E" opacity="0.75"/><circle cx="${d.x + 12}" cy="${d.y - 10}" r="12" fill="#A98F6E" opacity="0.7"/><circle cx="${d.x - 14}" cy="${d.y + 10}" r="10" fill="#8C7556" opacity="0.6"/></g>` : '')).join('')
      : '';
    const hoofSVG = HOOVES.map(([x, y], i) => `<circle class="hoof" data-i="${i}" cx="${x.toFixed(0)}" cy="${(y - 8).toFixed(0)}" r="20" fill="${mode === 'hooves' && picked[i] ? '#5FB36F' : 'transparent'}" opacity="0.8" ${mode === 'hooves' && !picked[i] ? 'stroke="#FFD23F" stroke-width="4" stroke-dasharray="6 5"' : ''}/>`).join('');
    const gleam = done.brush ? `<path d="M${PW * 0.3} ${PH * 0.31} Q${PW * 0.43} ${PH * 0.26} ${PW * 0.6} ${PH * 0.29}" stroke="#FFFBF2" stroke-width="10" stroke-linecap="round" fill="none" opacity="0.5"/>` : '';
    $('gr-stage').innerHTML = `<div class="gr-art"><img id="gr-art" alt="${o.horse.name.replace(/[<>&"]/g, '')}" ${artUrl ? `src="${artUrl}"` : ''}><svg viewBox="0 0 ${PW} ${PH}" aria-hidden="true">${gleam}${dustSVG}${hoofSVG}</svg></div>`;
    $('gr-stage').classList.toggle('working', mode !== 'style');
    // Fade dust by how much it has been rubbed.
    root.querySelectorAll<SVGGElement>('.dust').forEach((g) => {
      const i = Number(g.dataset.i);
      g.style.opacity = String(dust[i] / RUBS_PER_SPOT);
    });
  }

  function careButtons(): void {
    const b = $('gr-brush');
    const h = $('gr-hooves');
    b.innerHTML = done.brush ? '<b>Brush coat ✓</b><span>Shiny for today</span>' : mode === 'brush' ? '<b>Brushing…</b><span>Rub the dust spots</span>' : '<b>Brush coat</b><span>Rub off the dust · Trust</span>';
    h.innerHTML = done.hooves ? '<b>Pick hooves ✓</b><span>All clean today</span>' : mode === 'hooves' ? '<b>Picking…</b><span>Tap each hoof</span>' : '<b>Pick hooves</b><span>Tap all four · Trust</span>';
    b.toggleAttribute('disabled', done.brush);
    h.toggleAttribute('disabled', done.hooves);
    b.classList.toggle('on', mode === 'brush');
    h.classList.toggle('on', mode === 'hooves');
  }

  function chip(label: string, on: boolean, data: string, swatch?: string): string {
    return `<button class="gr-chip${on ? ' on' : ''}" data-v="${data}" aria-pressed="${on}">${swatch !== undefined ? `<i style="background:${swatch || o.horse.color}"></i>` : ''}${label}</button>`;
  }

  function chips(): void {
    let html = '';
    if (tab === 'mane') html = MANE.map(([v, l]) => chip(l, look.mane === v, `mane:${v}`)).join('');
    if (tab === 'tail') html = TAIL.map(([v, l]) => chip(l, look.tail === v, `tail:${v}`)).join('');
    if (tab === 'forelock') html = FORELOCK.map(([v, l]) => chip(l, look.forelock === v, `forelock:${v}`)).join('');
    if (tab === 'bows') {
      html = BOWS.map(([v, l]) => chip(l, look.bow === v, `bow:${v}`)).join('')
        + '<div class="gr-sub">Ribbon color</div>'
        + BOW_COLORS.map(([v, l]) => chip(l, look.bowColor === v, `bowColor:${v}`, v)).join('');
    }
    if (tab === 'extras') html = EXTRAS.map(([k, l]) => chip(l, look[k], `toggle:${k}`)).join('');
    $('gr-chips').innerHTML = html;
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  }

  function setMode(m: typeof mode): void {
    mode = m;
    if (m === 'brush') msg('Rub over the dust spots to brush them off.');
    if (m === 'hooves') msg('Tap each hoof to pick it clean.');
    careButtons();
    draw();
  }

  function finishCare(kind: CareKind): void {
    done[kind] = true;
    mode = 'style';
    msg(o.onCare(kind));
    careButtons();
    draw();
  }

  function rubAt(x: number, y: number): void {
    const el = document.elementFromPoint(x, y)?.closest<SVGGElement>('.dust');
    if (!el) return;
    const i = Number(el.dataset.i);
    if (dust[i] <= 0) return;
    dust[i]--;
    el.style.opacity = String(dust[i] / RUBS_PER_SPOT);
    if (dust[i] <= 0) el.remove();
    if (dust.every((d) => d <= 0)) finishCare('brush');
  }

  function pickAt(x: number, y: number): void {
    // Hooves are small, so accept taps a little around them.
    const box = $('gr-stage').getBoundingClientRect();
    let best = -1;
    let bestD = Infinity;
    root.querySelectorAll<SVGCircleElement>('.hoof').forEach((h) => {
      const r = h.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
      if (d < bestD && !picked[Number(h.dataset.i)]) { bestD = d; best = Number(h.dataset.i); }
    });
    if (best < 0 || bestD > box.width * 0.09 || picked[best]) return;
    picked[best] = true;
    const left = picked.filter((p) => !p).length;
    msg(left ? `Clean! ${left} to go.` : '');
    draw();
    if (!left) finishCare('hooves');
  }

  const stage = $('gr-stage');
  stage.addEventListener('pointerdown', (e) => {
    if (mode === 'brush') { e.preventDefault(); rubAt(e.clientX, e.clientY); }
    if (mode === 'hooves') { e.preventDefault(); pickAt(e.clientX, e.clientY); }
  });
  stage.addEventListener('pointermove', (e) => {
    if (mode === 'brush' && (e.buttons || e.pointerType === 'mouse')) rubAt(e.clientX, e.clientY);
  });
  $('gr-brush').addEventListener('click', () => { if (!done.brush) setMode(mode === 'brush' ? 'style' : 'brush'); });
  $('gr-hooves').addEventListener('click', () => { if (!done.hooves) setMode(mode === 'hooves' ? 'style' : 'hooves'); });
  $('gr-tabs').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');
    if (b) { tab = b.dataset.tab as Tab; chips(); }
  });
  $('gr-chips').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-v]');
    if (!b) return;
    const [k, v] = b.dataset.v!.split(':');
    if (k === 'toggle') { const key = v as keyof Pick<Look, 'pad' | 'wraps' | 'crown' | 'polish'>; look = { ...look, [key]: !look[key] }; }
    else look = { ...look, [k]: v };
    if (k === 'bowColor' && look.bow === 'none') look.bow = 'mane';
    o.onLook(look);
    chips();
    draw();
  });
  $('gr-back').addEventListener('click', o.onBack);

  careButtons();
  chips();
  draw();
  return () => { /* listeners live on elements that are replaced next time */ };
}
