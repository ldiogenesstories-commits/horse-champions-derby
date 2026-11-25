// Home menu: the felt meadow from the intro, your horse and jockey in the middle,
// and the main buttons. My Stable, Shop, How to Play and Options open as pages here.
import type { HorseDef } from '../sim/types';
import type { Jockey } from '../game/jockey';
import type { Look } from '../game/horseBody';
import { puppetFrames } from '../game/puppet';
import { portraitSVG } from '../game/portrait';
import { hd, hdCoin } from '../game/money';
import { LOGO } from '../game/transitions';
import { isMuted, setMuted } from '../game/sfx';
import {
  buyHorseSlot, buyItem, claimFreeHorse, emptySlots, freeHorseReady, getProfile, owns, wallet,
  FREE_HORSE_RACES, MAX_SLOTS, NEW_HORSE_COST, PRIZES, type HorseSummary,
} from '../profile/profile';
import { SHOP, SHOP_SECTIONS, type ShopItem } from '../profile/shop';
import { decorPreview } from '../profile/decor';
import { silksDefs } from '../game/jockey';
import { CAREER_RACES } from '../career/career';
import hills from '../game/scenery/hills.webp';
import sun from '../game/scenery/sun.webp';
import cloud1 from '../game/scenery/cloud1.webp';
import cloud2 from '../game/scenery/cloud2.webp';
import tree1 from '../game/scenery/tree1.webp';
import tree2 from '../game/scenery/tree2.webp';
import tree3 from '../game/scenery/tree3.webp';

export interface HomeOpts {
  horse: () => HorseDef;
  look: () => Look;
  jockey: () => Jockey;
  /** The active horse, for My Stable and the Continue button. */
  live: () => Omit<HorseSummary, 'id' | 'active'>;
  summaries: () => HorseSummary[];
  hallCount: () => number;
  hasHorse: () => boolean;
  /** Still breeding the first two horses (no random horses yet). */
  mustBreed: () => boolean;
  onContinue: () => void;
  onFamily: () => void;
  onBigScreen: () => void;
  onHall: () => void;
  onIntro: () => void;
  onBackup: () => void;
  onSwitch: (id: string) => void;
  /** Fill an empty stall: a random horse, or breed from the Hall. Returns an error to show, if any. */
  onNewHorse: (kind: 'random' | 'breed') => string | void;
}

type Page = 'menu' | 'stable' | 'shop' | 'howto' | 'options';
const esc = (t: string) => t.replace(/[<>&"]/g, '');

const BACKDROP = `
  <div class="hm-sky"></div>
  <img class="hm-pop" src="${sun}" alt="" style="left:4%;top:6%;width:min(14vw,120px)">
  <img class="hm-pop hm-drift" src="${cloud1}" alt="" style="left:22%;top:8%;width:min(18vw,170px)">
  <img class="hm-pop hm-drift slow" src="${cloud2}" alt="" style="left:64%;top:4%;width:min(16vw,150px)">
  <img class="hm-pop" src="${hills}" alt="" style="left:-4%;bottom:22%;width:108%">
  <img class="hm-pop" src="${tree3}" alt="" style="left:6%;bottom:30%;width:min(9vw,80px)">
  <img class="hm-pop" src="${tree1}" alt="" style="right:5%;bottom:28%;width:min(11vw,100px)">
  <img class="hm-pop" src="${tree2}" alt="" style="left:72%;bottom:34%;width:min(7vw,64px)">
  <div class="hm-ground"></div>`;

export function runHome(root: HTMLElement, o: HomeOpts): { refresh: () => void } {
  let page: Page = 'menu';
  let howStep = 0;
  let confirmId = '';
  let horseKey = '';
  root.innerHTML = `<div class="hm-back">${BACKDROP}</div><div class="hm-front" id="hm-front"></div>`;
  const front = root.querySelector('#hm-front') as HTMLElement;

  const walletChip = () => `<div class="hm-wallet">${hdCoin(22)}<b>${hd(wallet())}</b></div>`;

  function render(): void {
    if (page === 'menu') menu();
    else if (page === 'stable') myStable();
    else if (page === 'shop') shop();
    else if (page === 'howto') howTo();
    else options();
  }

  // ---------- Main menu ----------
  function menu(): void {
    const l = o.live();
    const status = l.retired ? 'Retired · start a new horse' : `Race ${Math.min(CAREER_RACES, l.races + 1)} of ${CAREER_RACES}`;
    front.innerHTML = `
      <div class="hm-top">
        <button class="hm-icon" id="hm-snd" aria-label="Sound">${isMuted() ? '🔇' : '🔊'}</button>
        ${walletChip()}
      </div>
      <div class="hm-logo">${LOGO}</div>
      <div class="hm-horse" id="hm-horse"></div>
      <div class="hm-panel">
        ${o.hasHorse() ? `<button class="hm-continue" id="hm-continue">
          <span class="hm-face">${portraitSVG(o.horse(), 52)}</span>
          <span><b>Continue</b><small>${esc(l.name)} · ${status}</small></span>
        </button>` : `<button class="hm-continue" id="hm-continue">
          <span class="hm-face hm-stall">🐣</span>
          <span><b>Breed your first horse</b><small>Pick a mare and a stallion to start your stable</small></span>
        </button>`}
        <div class="hm-grid">
          <button class="hm-btn" data-go="stable"><i>🐴</i>My Stable</button>
          <button class="hm-btn" data-go="family"><i>👪</i>Family Race</button>
          <button class="hm-btn" data-go="big"><i>📺</i>Big Screen</button>
          <button class="hm-btn" data-go="hall"><i>🏆</i>Hall of Fame</button>
          <button class="hm-btn" data-go="shop"><i>🛍️</i>Shop</button>
          <button class="hm-btn" data-go="howto"><i>❓</i>How to Play</button>
        </div>
        <div class="hm-foot">
          <button class="hm-link" data-go="options">⚙️ Options</button>
          <button class="hm-link" data-go="intro">▶ Play intro</button>
        </div>
      </div>`;
    front.querySelector('#hm-continue')!.addEventListener('click', o.onContinue);
    front.querySelector('#hm-snd')!.addEventListener('click', () => { setMuted(!isMuted()); menu(); });
    front.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const g = b.dataset.go!;
      if (g === 'family') o.onFamily();
      else if (g === 'big') o.onBigScreen();
      else if (g === 'hall') o.onHall();
      else if (g === 'intro') o.onIntro();
      else go(g as Page);
    }));
    horseKey = '';
    if (o.hasHorse()) void drawHorse();
  }

  async function drawHorse(): Promise<void> {
    const h = o.horse();
    const key = JSON.stringify([h.name, h.coat, h.color, o.look(), o.jockey()]);
    if (key === horseKey) return;
    horseKey = key;
    const [c] = await puppetFrames(h, o.jockey(), 1, 520, { mode: 'stand', look: o.look() });
    const box = front.querySelector('#hm-horse');
    if (!box || key !== horseKey) return;
    c.className = 'hm-horse-c';
    box.replaceChildren(c);
  }

  const pageHead = (title: string, eyebrow: string) => `
    <div class="hm-page-head">
      <button class="ghost small" id="hm-home">← Home</button>
      ${walletChip()}
    </div>
    <div class="eyebrow">${eyebrow}</div><h1>${title}</h1>`;
  function wireHome(): void { front.querySelector('#hm-home')?.addEventListener('click', () => go('menu')); }

  // ---------- My Stable ----------
  function myStable(): void {
    const p = getProfile();
    const list = o.summaries();
    const cards = list.map((h) => `
      <div class="hm-hcard${h.active ? ' active' : ''}${h.retired ? ' retired' : ''}">
        <span class="hm-face">${h.horse || h.active ? portraitSVG((h.active ? o.horse() : h.horse) as HorseDef, 56) : ''}</span>
        <span class="hm-hinfo"><b>${esc(h.name)}</b>
          <small>${h.retired ? 'Retired · ready for a new horse' : `${h.races} of ${CAREER_RACES} races · ${h.wins} win${h.wins === 1 ? '' : 's'}`}</small></span>
        ${h.active ? '<span class="hm-tag">Riding now</span>' : `<button class="big go small-btn" data-ride="${h.id}">${h.retired ? 'Open' : 'Ride'}</button>`}
      </div>`).join('');
    const empties = Array.from({ length: emptySlots() }, () => `
      <div class="hm-hcard empty">
        <span class="hm-face hm-stall">🚪</span>
        <span class="hm-hinfo"><b>Empty stall</b><small>${o.mustBreed() ? 'Breed a foal to fill it' : 'Bring in a new horse'}</small></span>
        <span class="hm-two">${o.mustBreed() ? '<button class="big go small-btn" data-new="breed">Breed a foal</button>'
          : `<button class="big go small-btn" data-new="random">Random horse</button>${o.hallCount() ? '<button class="big ghost small-btn" data-new="breed">Breed</button>' : ''}`}</span>
      </div>`).join('');
    let locked = '';
    if (p.slots < MAX_SLOTS) {
      const free = freeHorseReady();
      const freeLine = p.freeHorseClaimed ? '' : free
        ? '<button class="big go small-btn" id="hm-claim">Claim free horse!</button>'
        : `<small>Free horse after ${FREE_HORSE_RACES} races (${Math.min(p.totalRaces, FREE_HORSE_RACES)}/${FREE_HORSE_RACES})</small>`;
      const can = wallet() >= NEW_HORSE_COST;
      locked = `
      <div class="hm-hcard locked">
        <span class="hm-face hm-stall">🔒</span>
        <span class="hm-hinfo"><b>New stall</b>${freeLine}</span>
        <button class="big ${can ? 'go' : 'ghost'} small-btn" id="hm-buy" ${can ? '' : 'disabled'}>Buy ${hd(NEW_HORSE_COST)}</button>
      </div>
      <p class="muted hm-note">${p.slots} of ${MAX_SLOTS} stalls open.${can ? '' : ` A new stall costs ${hd(NEW_HORSE_COST)} (four wins).`}</p>`;
    } else locked = `<p class="muted hm-note">Your stable is full: ${MAX_SLOTS} of ${MAX_SLOTS} stalls.</p>`;
    front.innerHTML = `<div class="hm-page">${pageHead('My Stable', `${list.length} horse${list.length === 1 ? '' : 's'}`)}
      <div class="hm-list">${cards}${empties}${locked}</div><p class="br-err muted" id="hm-err"></p></div>`;
    wireHome();
    front.querySelectorAll<HTMLButtonElement>('[data-ride]').forEach((b) => b.addEventListener('click', () => o.onSwitch(b.dataset.ride!)));
    front.querySelectorAll<HTMLButtonElement>('[data-new]').forEach((b) => b.addEventListener('click', () => {
      const err = o.onNewHorse(b.dataset.new as 'random' | 'breed');
      if (err) (front.querySelector('#hm-err') as HTMLElement).textContent = err;
    }));
    front.querySelector('#hm-claim')?.addEventListener('click', () => { claimFreeHorse(); myStable(); });
    front.querySelector('#hm-buy')?.addEventListener('click', (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      if (confirmId !== 'stall') { confirmId = 'stall'; b.innerHTML = `Tap again: ${hd(NEW_HORSE_COST)}`; return; }
      confirmId = '';
      buyHorseSlot();
      myStable();
    });
  }

  // ---------- Shop ----------
  function swatch(i: ShopItem): string {
    if (i.kind === 'decor') return `<span class="hm-sw decor">${decorPreview(i.value)}</span>`;
    if (i.kind === 'silks') {
      const j = o.jockey();
      const { defs, fill } = silksDefs({ ...j, pattern: i.value as Jockey['pattern'] });
      return `<span class="hm-sw"><svg viewBox="0 0 40 40" width="40" height="40"><defs>${defs}</defs><rect x="3" y="3" width="34" height="34" rx="8" fill="${fill}" stroke="#2B2118" stroke-width="3"/></svg></span>`;
    }
    return `<span class="hm-sw"><i style="background:${i.value}"></i></span>`;
  }
  function shop(): void {
    const sections = SHOP_SECTIONS.map((s) => `
      <div class="card hm-shop-sec"><div class="card-title">${s.title}</div><p class="muted hm-note">${s.note}</p>
        <div class="hm-items">${SHOP.filter((i) => i.kind === s.kind).map((i) => {
          const have = owns(i.id);
          const can = wallet() >= i.price;
          return `<div class="hm-item${have ? ' owned' : ''}">${swatch(i)}<b>${i.label}</b>
            ${have ? '<span class="hm-tag">Owned ✓</span>'
              : `<button class="hm-buy${can ? '' : ' poor'}" data-buy="${i.id}" ${can ? '' : 'disabled'}>${confirmId === i.id ? 'Tap to confirm' : hd(i.price)}</button>`}</div>`;
        }).join('')}</div></div>`).join('');
    front.innerHTML = `<div class="hm-page">${pageHead('Shop', 'Spend your race winnings')}
      <p class="muted">Win Horse Dollars in every race: ${PRIZES.slice(0, 3).map((p, i) => `${['1st', '2nd', '3rd'][i]} ${hd(p)}`).join(' · ')}. Event races pay extra.</p>
      ${sections}</div>`;
    wireHome();
    front.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.buy!;
      const item = SHOP.find((x) => x.id === id)!;
      if (confirmId !== id) { confirmId = id; shop(); return; }
      confirmId = '';
      buyItem(id, item.price);
      const y = front.scrollTop;
      shop();
      front.scrollTop = y;
    }));
  }

  // ---------- How to Play ----------
  const STEPS: { ico: string; title: string; text: string }[] = [
    { ico: '🐴', title: 'Raise a champion', text: 'Each horse has a 25-race career. Between races you care for it in the stable or out on the ranch, then retire it into the Hall of Fame.' },
    { ico: '🌅', title: '3 actions make a game day', text: 'A game day is 3 actions (train, feed, groom or rest) followed by a race. It isn\'t a real-life day: play as many game days as you like. Watch Fatigue: a tired horse starts races with less energy.' },
    { ico: '🏋️', title: 'Training drills', text: 'Drills are quick mini-games that raise stats like Speed, Stamina and Gate. Better grades mean bigger gains, up to the max of each horse\'s individual capabilities.' },
    { ico: '💛', title: 'Trust and grooming', text: 'Brushing, hoof care, the right food and greeting your horse after a race build Trust. Every horse has a Need: learn what makes yours happy.' },
    { ico: '🏁', title: 'Race day', text: 'Pick a race plan, then ride: hold to save energy, whip in the final stretch. Prize money is paid for 1st to 5th, and events pay extra.' },
    { ico: '🏆', title: 'Hall of Fame', text: 'After 25 races your horse retires with a card. Share its code or QR so family can add it to their Hall too.' },
    { ico: '🧬', title: 'Breeding', text: 'Pair a retiree with a visiting horse or another Hall horse. Foals inherit coats, markings, stats and star traits. Champion ancestors lift hidden peaks.' },
    { ico: '🐎', title: 'Your stable', text: `You start with 2 empty stalls and breed your first 2 horses, one at a time, from visiting horses. Earn a free stall after ${FREE_HORSE_RACES} races, or buy one for ${hd(NEW_HORSE_COST)}. Up to ${MAX_SLOTS} horses.` },
    { ico: '👪', title: 'Family Race and Big Screen', text: 'Family Race: everyone races from their own phone. Big Screen: show the race on a TV or computer and steer from your phone.' },
    { ico: '🛍️', title: 'The Shop', text: 'Spend Horse Dollars on ribbon colors, saddle pads, silks patterns and barn decor.' },
  ];
  function howTo(): void {
    const s = STEPS[howStep];
    front.innerHTML = `<div class="hm-page">${pageHead('How to Play', `Step ${howStep + 1} of ${STEPS.length}`)}
      <div class="card hm-how"><div class="hm-how-ico">${s.ico}</div><h2>${s.title}</h2><p>${s.text}</p></div>
      <div class="hm-dots">${STEPS.map((_, i) => `<i class="${i === howStep ? 'on' : ''}"></i>`).join('')}</div>
      <div class="hm-how-nav">
        <button class="big ghost" id="hm-prev" ${howStep ? '' : 'disabled'}>Back</button>
        <button class="big go" id="hm-next">${howStep === STEPS.length - 1 ? 'Done' : 'Next'}</button>
      </div></div>`;
    wireHome();
    front.querySelector('#hm-prev')!.addEventListener('click', () => { howStep = Math.max(0, howStep - 1); howTo(); });
    front.querySelector('#hm-next')!.addEventListener('click', () => {
      if (howStep === STEPS.length - 1) { howStep = 0; go('menu'); } else { howStep++; howTo(); }
    });
  }

  // ---------- Options ----------
  function options(): void {
    front.innerHTML = `<div class="hm-page">${pageHead('Options', 'Settings')}
      <div class="card hm-opts">
        <button class="big ghost" id="hm-o-snd">${isMuted() ? '🔇 Sound is off' : '🔊 Sound is on'}</button>
        <button class="big ghost" id="hm-o-intro">▶ Replay the intro</button>
        <button class="big ghost" id="hm-o-backup">☁️ Backup &amp; restore</button>
      </div>
      <div class="card"><div class="card-title">Credits</div>
        <p>Horse Champions Derby: a family game by J.O., inspired by the arcade horse-racing games he loves.</p>
        <p class="muted">Built with Claude. Music and sound effects are original and made live in the browser.</p></div></div>`;
    wireHome();
    front.querySelector('#hm-o-snd')!.addEventListener('click', () => { setMuted(!isMuted()); options(); });
    front.querySelector('#hm-o-intro')!.addEventListener('click', o.onIntro);
    front.querySelector('#hm-o-backup')!.addEventListener('click', o.onBackup);
  }

  function go(p: Page): void {
    page = p;
    confirmId = '';
    front.scrollTop = 0;
    root.classList.toggle('hm-paged', p !== 'menu');
    render();
  }

  return { refresh: () => go('menu') };
}
