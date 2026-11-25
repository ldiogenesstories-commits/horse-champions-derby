// Scene transitions: a puppet-stage curtain (three styles that take turns) and a
// "nature springs up" wipe for walking out of the barn onto the ranch.
// Each one covers the screen, calls `swap()` while fully covered, then uncovers.

import { crowdRoar, curtainSwish, finishHit, logoChime, naturePops } from './sfx';

export type TransitionKind = 'curtain' | 'nature';

const CURTAINS = ['split', 'drop', 'swag'] as const;
let nextCurtain = 0;
let busy = false;
let current: Promise<void> = Promise.resolve();
/** Resolves when the transition that's playing (if any) has fully uncovered the screen. */
export const transitionDone = (): Promise<void> => current;

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const run = (el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) =>
  el.animate(frames, { fill: 'forwards', ...opts }).finished.catch(() => undefined);

const LOGO = `
<div class="tx-logo">
  <svg viewBox="0 0 120 110" aria-hidden="true">
    <path d="M24 96 C6 70 8 30 34 14 C48 5 72 5 86 14 C112 30 114 70 96 96"
      fill="none" stroke="#2B2118" stroke-width="30" stroke-linecap="round"/>
    <path d="M24 96 C6 70 8 30 34 14 C48 5 72 5 86 14 C112 30 114 70 96 96"
      fill="none" stroke="#E2A93B" stroke-width="22" stroke-linecap="round"/>
    <g fill="#2B2118">
      <circle cx="20" cy="74" r="3"/><circle cx="17" cy="52" r="3"/><circle cx="26" cy="32" r="3"/><circle cx="44" cy="19" r="3"/>
      <circle cx="100" cy="74" r="3"/><circle cx="103" cy="52" r="3"/><circle cx="94" cy="32" r="3"/><circle cx="76" cy="19" r="3"/>
    </g>
  </svg>
  <b>Horse Champions</b><span>Derby</span>
</div>`;

/** Cover the screen, run `swap` while hidden, then reveal. Ignored if one is already playing. */
export function playTransition(kind: TransitionKind, swap: () => void): Promise<void> {
  if (busy) { swap(); return current; }
  current = playIt(kind, swap);
  return current;
}

async function playIt(kind: TransitionKind, swap: () => void): Promise<void> {
  busy = true;
  const root = document.createElement('div');
  root.className = 'tx';
  document.body.append(root);
  try {
    if (reduced()) {
      root.classList.add('tx-fade');
      await run(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
      swap();
      await run(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
    } else if (kind === 'nature') {
      await nature(root, swap);
    } else {
      const style = CURTAINS[nextCurtain];
      nextCurtain = (nextCurtain + 1) % CURTAINS.length;
      await curtain(root, style, swap);
    }
  } finally {
    root.remove();
    busy = false;
  }
}

async function curtain(root: HTMLElement, style: (typeof CURTAINS)[number], swap: () => void): Promise<void> {
  root.classList.add('tx-curtain', `tx-${style}`);
  const panels = style === 'split'
    ? [mk(root, 'tx-panel tx-left'), mk(root, 'tx-panel tx-right')]
    : [mk(root, 'tx-panel tx-full')];
  root.insertAdjacentHTML('beforeend', LOGO);
  const logo = root.querySelector('.tx-logo')!;
  const ease = 'cubic-bezier(.55,0,.35,1)';

  // Close.
  curtainSwish();
  if (style === 'split') {
    await Promise.all([
      run(panels[0], [{ transform: 'translateX(-102%)' }, { transform: 'translateX(2%)', offset: 0.85 }, { transform: 'translateX(0)' }], { duration: 620, easing: ease }),
      run(panels[1], [{ transform: 'translateX(102%)' }, { transform: 'translateX(-2%)', offset: 0.85 }, { transform: 'translateX(0)' }], { duration: 620, easing: ease }),
    ]);
  } else {
    await run(panels[0], [{ transform: 'translateY(calc(-100% - 40px))' }, { transform: 'translateY(1.5%)', offset: 0.8 }, { transform: 'translateY(0)' }], { duration: 620, easing: ease });
  }

  // Logo pops while the curtain is shut; swap the scene behind it.
  logoChime();
  run(logo, [{ opacity: 0, transform: 'scale(.6) rotate(-6deg)' }, { opacity: 1, transform: 'scale(1.08) rotate(2deg)', offset: 0.7 }, { opacity: 1, transform: 'scale(1) rotate(0)' }], { duration: 320, easing: 'ease-out' });
  swap();
  await wait(650);
  await run(logo, [{ opacity: 1 }, { opacity: 0, transform: 'scale(.9)' }], { duration: 160 });

  // Open.
  curtainSwish(true);
  if (style === 'split') {
    await Promise.all([
      run(panels[0], [{ transform: 'translateX(0)' }, { transform: 'translateX(-102%)' }], { duration: 600, easing: ease }),
      run(panels[1], [{ transform: 'translateX(0)' }, { transform: 'translateX(102%)' }], { duration: 600, easing: ease }),
    ]);
  } else if (style === 'drop') {
    await run(panels[0], [{ transform: 'translateY(0)' }, { transform: 'translateY(calc(-100% - 40px))' }], { duration: 600, easing: ease });
  } else {
    // Swag: gathers upward into scallops, folds bunching as it rises.
    await run(panels[0], [
      { transform: 'scaleY(1)', backgroundSize: '64px 100%' },
      { transform: 'scaleY(0.04)', backgroundSize: '40px 100%' },
    ], { duration: 700, easing: ease });
  }
}

async function nature(root: HTMLElement, swap: () => void): Promise<void> {
  root.classList.add('tx-nature');
  const ground = mk(root, 'tx-ground');
  const W = window.innerWidth;
  const H = window.innerHeight;
  const bits: HTMLElement[] = [];
  const cols = Math.max(6, Math.round(W / 70));
  const rows = Math.max(5, Math.round(H / 80));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const roll = Math.random();
      const kind = roll < 0.12 ? 'tree' : roll < 0.45 ? 'flower' : 'tuft';
      const el = mk(root, `tx-bit tx-${kind}`);
      el.innerHTML = SPRITES[kind](Math.random());
      const x = ((c + 0.2 + Math.random() * 0.6) / cols) * W;
      const y = H - ((r + Math.random() * 0.8) / rows) * H; // bottom rows first
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.dataset.row = String(r);
      bits.push(el);
    }
  }
  naturePops();
  // Ground sweeps up from the bottom while plants pop up row by row behind it.
  const grow = run(ground, [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 700, easing: 'cubic-bezier(.3,.6,.4,1)' });
  const pops = bits.map((el) => run(el, [
    { transform: 'translate(-50%,-100%) scale(0)', opacity: 0 },
    { transform: 'translate(-50%,-100%) scale(1.2)', opacity: 1, offset: 0.65 },
    { transform: 'translate(-50%,-100%) scale(1)', opacity: 1 },
  ], { duration: 380, delay: Number(el.dataset.row) * (520 / rows) + Math.random() * 120, easing: 'ease-out' }));
  await Promise.all([grow, ...pops]);
  swap();
  await wait(200);
  // Settle away: plants shrink back into the grass as the ranch fades in.
  bits.forEach((el) => run(el, [{ transform: 'translate(-50%,-100%) scale(1)', opacity: 1 }, { transform: 'translate(-50%,-100%) scale(0)', opacity: 0 }], { duration: 300, delay: Math.random() * 150, easing: 'ease-in' }));
  await run(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 480, delay: 120, easing: 'ease-in' });
}

function mk(parent: HTMLElement, cls: string): HTMLElement {
  const el = document.createElement('div');
  el.className = cls;
  parent.append(el);
  return el;
}

const FLOWER_COLORS = ['#FFFBF2', '#F7A8B8', '#FFD23F', '#9CC3D5'];
const SPRITES: Record<'tree' | 'flower' | 'tuft', (r: number) => string> = {
  tuft: (r) => `<svg width="34" height="26" viewBox="0 0 34 26"><path d="M3 25 L9 6 L13 25 L17 2 L21 25 L26 8 L31 25 Z" fill="${r < 0.5 ? '#5E9B5A' : '#6FAE66'}" stroke="#2B2118" stroke-width="2" stroke-linejoin="round"/></svg>`,
  flower: (r) => `<svg width="26" height="36" viewBox="0 0 26 36"><path d="M13 35 V16" stroke="#3E6B48" stroke-width="3"/><path d="M13 28 q-7 -2 -8 -7 q6 0 8 5" fill="#6FAE66" stroke="#2B2118" stroke-width="1.5"/>
    <g fill="${FLOWER_COLORS[Math.floor(r * FLOWER_COLORS.length)]}" stroke="#2B2118" stroke-width="1.6"><circle cx="13" cy="6" r="5"/><circle cx="19" cy="11" r="5"/><circle cx="7" cy="11" r="5"/><circle cx="16" cy="17" r="5"/><circle cx="10" cy="17" r="5"/></g><circle cx="13" cy="12" r="3.5" fill="#E2A93B" stroke="#2B2118" stroke-width="1.5"/></svg>`,
  tree: (r) => `<svg width="70" height="92" viewBox="0 0 70 92"><rect x="29" y="54" width="12" height="36" rx="3" fill="#8A5A3B" stroke="#2B2118" stroke-width="2.5"/>
    <g fill="${r < 0.5 ? '#4F8A4E' : '#5E9B5A'}" stroke="#2B2118" stroke-width="2.5"><circle cx="35" cy="22" r="19"/><circle cx="18" cy="42" r="16"/><circle cx="52" cy="42" r="16"/><circle cx="35" cy="48" r="16"/></g></svg>`,
};

// ---------- Finish splash ----------
// A Viewtiful Joe-style comic beat when your horse crosses the line: colour drains
// from the race, a slanted panel slams in with your placing, then it clears.
export async function playFinishSplash(o: { place: number; ord: string; name: string; color: string; hold?: number }): Promise<void> {
  const root = document.createElement('div');
  const big = o.place === 1;
  const top3 = o.place <= 3;
  const ord = o.ord;
  const line = big ? 'WINNER!' : top3 ? 'WHAT A RUN!' : 'FINISHED!';
  root.className = `fx-finish${big ? ' win' : top3 ? ' top3' : ''}`;
  root.style.setProperty('--silk', o.color);
  root.innerHTML = `<div class="fx-flash"></div><div class="fx-burst"></div><div class="fx-lines"></div>
    <div class="fx-band"><div class="fx-place">${ord.toUpperCase()}${top3 ? '!' : ''}</div><div class="fx-line">${line}</div><div class="fx-name">${o.name.replace(/[<>&]/g, '')}</div></div>`;
  document.body.append(root);
  const race = document.getElementById('race');
  race?.classList.add('fx-frozen');
  try {
    if (reduced()) {
      await run(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
      await wait(o.hold ?? 1300);
    } else {
      finishHit();
      crowdRoar(big, top3);
      const band = root.querySelector('.fx-band')!;
      const place = root.querySelector('.fx-place')!;
      run(root.querySelector('.fx-flash')!, [{ opacity: 0.95 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
      run(root.querySelector('.fx-burst')!, [{ transform: 'scale(.2) rotate(-20deg)', opacity: 0 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,1.4,.4,1)' });
      run(root.querySelector('.fx-lines')!, [{ transform: 'rotate(0)' }, { transform: 'rotate(8deg)' }], { duration: 1800, easing: 'linear' });
      run(band, [{ transform: 'translateX(-120%) skewY(-8deg)' }, { transform: 'translateX(4%) skewY(-8deg)', offset: 0.75 }, { transform: 'translateX(0) skewY(-8deg)' }], { duration: 300, easing: 'ease-out' });
      await run(place, [{ transform: 'scale(2.6)', opacity: 0 }, { transform: 'scale(.92)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 360, delay: 140, easing: 'ease-out' });
      if (big) run(root, [{ transform: 'translate(0,0)' }, { transform: 'translate(-6px,4px)' }, { transform: 'translate(5px,-3px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }], { duration: 260 });
      await wait(o.hold ?? 1100);
      await run(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in' });
    }
  } finally {
    root.remove();
    race?.classList.remove('fx-frozen');
  }
}
