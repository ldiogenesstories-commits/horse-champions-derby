// Opening sequence: tap to begin -> scene 1 (the jockey assembles and rides) -> curtain ->
// scenery pops up -> scene 2 (the frantic horse, calmed) -> title card -> touch anywhere.
// The score (introMusic.ts) and the visuals share one clock, so they stay in step.
import { isMuted, setMuted, unlockAudio, logoChime } from '../game/sfx';
import { LOGO, playTransition } from '../game/transitions';
import { CUE, playScore, playTitleLoop, type MusicHandle } from './introMusic';
import hills from '../game/scenery/hills.webp';
import sun from '../game/scenery/sun.webp';
import cloud1 from '../game/scenery/cloud1.webp';
import cloud2 from '../game/scenery/cloud2.webp';
import tree1 from '../game/scenery/tree1.webp';
import tree2 from '../game/scenery/tree2.webp';
import tree3 from '../game/scenery/tree3.webp';

const V1 = `${import.meta.env.BASE_URL}intro/scene1.mp4`;
const V2 = `${import.meta.env.BASE_URL}intro/scene2.mp4`;
const START_LAG = 120; // the score starts ~0.12s after we ask; keep the visuals on the same beat

/** Skip the opening for deep links (a scanned card or backup code) and ?nointro. */
export function shouldPlayIntro(): boolean {
  const q = new URLSearchParams(location.search);
  return !(q.has('card') || q.has('restore') || q.has('screen') || q.has('nointro'));
}

// Pieces that pop up when the curtain opens on scene 2: [image, left%, bottom%, width%, delay ms]
const POPS: [string, number, number, number, number][] = [
  [hills, -2, 14, 104, 0],
  [hills, 0, 0, 104, 80],
  [tree1, 6, 16, 9, 220],
  [tree3, 36, 27, 6.5, 280],
  [tree2, 62, 24, 8, 340],
  [tree1, 86, 14, 10, 400],
  [sun, 2, 66, 10, 520],
  [cloud1, 20, 76, 14, 620],
  [cloud2, 50, 80, 13, 700],
  [cloud1, 76, 68, 11, 780],
];

const STYLE_ID = 'intro-style';
export function playIntro(onEnter: () => void): void {
  const root = document.createElement('div');
  root.className = 'intro';
  root.innerHTML = `
    <div class="intro-box">
      <video class="intro-v v1" src="${V1}" muted playsinline preload="auto" disablepictureinpicture></video>
      <div class="intro-scene2">
        <div class="intro-ground"></div>
        ${POPS.map(([src, l, b, w]) => `<img class="intro-pop" src="${src}" alt="" style="left:${l}%;bottom:${b}%;width:${w}%">`).join('')}
        <video class="intro-v v2" src="${V2}" muted playsinline preload="auto" disablepictureinpicture></video>
      </div>
    </div>
    <div class="intro-title" hidden>
      <div class="intro-flash"></div>
      ${LOGO}
      <p class="intro-touch">Touch anywhere to start</p>
    </div>
    <div class="intro-gate">${LOGO}<p class="intro-touch">Tap to play</p></div>
    <button class="intro-skip" type="button" hidden>Skip ›</button>
    <button class="intro-snd" type="button" aria-label="Sound"></button>`;
  document.body.append(root);
  void STYLE_ID;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const v1 = $<HTMLVideoElement>('.v1');
  const v2 = $<HTMLVideoElement>('.v2');
  const scene2 = $<HTMLElement>('.intro-scene2');
  const title = $<HTMLElement>('.intro-title');
  const gate = $<HTMLElement>('.intro-gate');
  const skip = $<HTMLButtonElement>('.intro-skip');
  const snd = $<HTMLButtonElement>('.intro-snd');
  const renderSnd = () => { snd.textContent = isMuted() ? '🔇' : '🔊'; };
  renderSnd();
  snd.addEventListener('click', (e) => { e.stopPropagation(); setMuted(!isMuted()); renderSnd(); });

  const timers: number[] = [];
  const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms + START_LAG)); };
  let music: MusicHandle | null = null;
  let titleLoop: MusicHandle | null = null;
  let ended = false;
  let titleShown = false;

  function popUp(): void {
    scene2.querySelectorAll<HTMLElement>('.intro-ground, .intro-pop').forEach((el, i) => {
      const delay = i === 0 ? 0 : POPS[i - 1][4];
      el.animate([
        { transform: 'scale(0.05)', opacity: 0 },
        { transform: 'scale(1.18)', opacity: 1, offset: 0.62 },
        { transform: 'scale(1)', opacity: 1 },
      ], { duration: 520, delay, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' });
    });
  }

  function swapToScene2(): void {
    if (ended) return;
    v1.pause();
    v1.style.visibility = 'hidden';
    scene2.classList.add('on');
    later(480, popUp);
  }

  function startV2(): void {
    v2.play().catch(() => undefined);
    v2.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, fill: 'forwards' });
  }

  function showTitle(): void {
    if (titleShown) return;
    titleShown = true;
    skip.hidden = true;
    title.hidden = false;
    title.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'forwards' });
    $('.intro-flash').animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 900, easing: 'ease-out', fill: 'forwards' });
    const logo = title.querySelector('.tx-logo') as HTMLElement;
    logo.animate([
      { opacity: 0, transform: 'scale(.55) rotate(-6deg)' },
      { opacity: 1, transform: 'scale(1.1) rotate(2deg)', offset: 0.7 },
      { opacity: 1, transform: 'scale(1) rotate(0)' },
    ], { duration: 650, easing: 'ease-out', fill: 'forwards' });
    confetti();
    const touch = title.querySelector('.intro-touch') as HTMLElement;
    touch.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 1100, fill: 'forwards' });
    later(900 - START_LAG, () => title.addEventListener('pointerdown', enter, { once: true }));
    title.classList.add('live');
    titleLoop ??= playTitleLoop(music ? 2.2 : 0.2);
  }

  function confetti(): void {
    const colors = ['#FFD23F', '#E2A93B', '#FFFBF2', '#C8452D', '#4F8A5B'];
    for (let i = 0; i < 46; i++) {
      const p = document.createElement('i');
      p.className = 'intro-conf';
      const a = Math.random() * Math.PI * 2;
      const r = 120 + Math.random() * 320;
      p.style.background = colors[i % colors.length];
      title.append(p);
      p.animate([
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r * 0.7 + 160}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ], { duration: 1400 + Math.random() * 900, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).finished.then(() => p.remove(), () => p.remove());
    }
  }

  function enter(): void {
    if (ended) return;
    ended = true;
    unlockAudio();
    logoChime();
    titleLoop?.stop(0.7);
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, fill: 'forwards' }).finished.then(() => { root.remove(); onEnter(); }, () => { root.remove(); onEnter(); });
  }

  function skipToTitle(): void {
    if (titleShown) return;
    timers.forEach(clearTimeout);
    timers.length = 0;
    music?.stop(0.25);
    music = null;
    v1.pause(); v2.pause();
    v1.style.visibility = 'hidden';
    scene2.classList.add('on');
    scene2.querySelectorAll<HTMLElement>('.intro-ground, .intro-pop').forEach((el) => { el.style.opacity = '1'; });
    showTitle();
  }
  skip.addEventListener('click', (e) => { e.stopPropagation(); skipToTitle(); });

  // The first tap unlocks audio (browsers require it) and starts everything together.
  gate.addEventListener('pointerdown', () => {
    unlockAudio();
    gate.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished.then(() => gate.remove(), () => gate.remove());
    skip.hidden = false;
    v1.play().catch(() => undefined);
    music = playScore();
    later(CUE.curtain * 1000, () => { if (!ended && !titleShown) void playTransition('curtain', swapToScene2); });
    later(CUE.video2 * 1000, () => { if (!titleShown) startV2(); });
    later(CUE.title * 1000, showTitle);
  }, { once: true });
}
