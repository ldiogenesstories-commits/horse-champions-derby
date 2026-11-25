import { cleanName } from '../game/names';
// Breeding barn: pick a retired parent, choose a partner, see the foal outlook, name the foal.
import type { HorseDef } from '../sim/types';
import { portraitSVG } from '../game/portrait';
import type { RetiredCard } from './career';
import { tierOf } from '../sim/growth';
import { breedFoal, coatChances, homeFoalsLeft, HOME_FOAL_LIMIT, lineagePerks, outlook, sexOf, SHARED_FOAL_LIMIT, suggestName, visitingPartners, type Partner } from './breeding';
import { carriedCoat } from '../sim/genetics';
import { arcHint } from '../sim/arc';
import { hd } from '../game/money';
import { sparksOf } from '../sim/growth';

const STAT_LABEL: [keyof HorseDef['stats'], string][] = [
  ['speed', 'Speed'], ['stamina', 'Stamina'], ['accel', 'Acceleration'], ['guts', 'Guts'], ['gate', 'Gate Skill'], ['agility', 'Agility'],
];
const COAT_LABEL: Record<string, string> = { bay: 'Bay', chestnut: 'Chestnut', grey: 'Grey', black: 'Black', palomino: 'Palomino', dapple: 'Dapple', roan: 'Roan' };
const SHORT: Record<keyof HorseDef['stats'], string> = { speed: 'SPD', stamina: 'STA', accel: 'ACC', guts: 'GUT', gate: 'GTE', agility: 'AGI' };
/** Parents' stats shown as tiers (Iron → Diamond); the numbers stay underneath. */
const tierChips = (h: HorseDef) => `<span class="tiers">${STAT_LABEL.map(([k, l]) => {
  const t = tierOf(h.stats[k]);
  return `<span class="tier ${t.cls}" title="${l}: ${t.name}"><em>${SHORT[k]}</em>${t.name}</span>`;
}).join('')}</span>`;
/** "Foals: 1/3 home" for horses raised here; scanned-in horses share a limit of 4 across all ranches. */
const foalsNote = (c: RetiredCard) => (c.guest ? `Shared foals: up to ${SHARED_FOAL_LIMIT} across all ranches` : `Foals: ${c.horse.foals ?? 0}/${HOME_FOAL_LIMIT}`);
const sexIcon = (h: HorseDef) => (sexOf(h) === 'mare' ? '♀ Mare' : '♂ Stallion');

export function runBreeding(root: HTMLElement, o: {
  hall: RetiredCard[];
  /** First horses: no Hall yet, so the mother is a visiting mare too. */
  starter?: boolean;
  preselect?: string; // card code
  seed: number;
  /** Called with the new foal. Return an error message to stay on this screen (e.g. a shared-limit refusal). */
  /** Horse Dollars on hand, for the Premier Partner's price. */
  wallet?: () => number;
  onDone: (foal: HorseDef, used: { parent: RetiredCard; partnerCard?: RetiredCard; premier: boolean }) => void | string | Promise<void | string>;
  onBack: () => void;
}): void {
  let parent: RetiredCard | undefined = o.hall.find((c) => c.code === o.preselect);
  let partner: HorseDef | undefined;
  let premier = false;
  let partnerRank: string | undefined;
  let partnerCard: RetiredCard | undefined;
  let partners: Partner[] = [];
  let name = '';
  const $ = (id: string) => root.querySelector(`#${id}`) as HTMLElement;

  const top = (title: string, sub: string) => `
    <button class="ghost small back" id="br-back">← Back</button>
    <div class="eyebrow">Breeding barn</div><h1>${title}</h1><p class="sub">${sub}</p>`;

  const row = (h: HorseDef, data: string, extra: string, opts: { off?: boolean; premier?: boolean } = {}) => `
    <button class="br-row${opts.premier ? ' br-premier' : ''}${opts.off ? ' br-off' : ''}" ${data}${opts.off ? ' disabled' : ''}>
      ${opts.premier ? '<span class="br-ribbon">PREMIER</span>' : ''}
      <span class="br-face">${portraitSVG(h, 56)}</span>
      <span class="br-info"><b>${h.name}</b><small>${sexIcon(h)} · ${COAT_LABEL[h.coat ?? 'bay']}${h.generation && h.generation > 1 ? ` · Gen ${h.generation}` : ''}</small><span>${extra}</span>${tierChips(h)}</span>
    </button>`;

  function stepParent(): void {
    if (o.starter) { stepStarterMare(); return; }
    root.innerHTML = top('Choose a parent', 'Retired horses can pass their talents on to a foal.')
      + `<div class="br-list">${o.hall.map((c) => row(c.horse, `data-code="${c.code}"`, `${c.rank} · ${c.record.w}–${c.record.p}–${c.record.s} · ${foalsNote(c)}`, { off: !c.guest && homeFoalsLeft(c.horse) === 0 })).join('')}</div>`;
    $('br-back').addEventListener('click', o.onBack);
    root.querySelectorAll<HTMLButtonElement>('[data-code]:not([disabled])').forEach((b) => b.addEventListener('click', () => {
      parent = o.hall.find((c) => c.code === b.dataset.code);
      stepPartner();
    }));
  }

  /** Starter breeding: pick one of three visiting mares as the mother. */
  function stepStarterMare(): void {
    const mares = visitingPartners(o.seed + 101, 'mare').filter((v) => !v.premier);
    const cards = mares.map((v, i) => ({ code: `STARTER${i}`, horse: v.horse, rank: v.rank, record: { w: 0, p: 0, s: 0 }, starterNote: v.note } as unknown as RetiredCard & { starterNote: string }));
    root.innerHTML = top('Breed your horse', 'Your first horses come from visiting horses. Pick a mother, then a father.')
      + `<div class="br-list">${cards.map((c) => row(c.horse, `data-code="${c.code}"`, `${c.starterNote} Free.`)).join('')}</div>`;
    $('br-back').addEventListener('click', o.onBack);
    root.querySelectorAll<HTMLButtonElement>('[data-code]').forEach((b) => b.addEventListener('click', () => {
      parent = cards.find((c) => c.code === b.dataset.code);
      stepPartner();
    }));
  }

  function stepPartner(): void {
    const p = parent!.horse;
    const want = sexOf(p) === 'mare' ? 'stallion' : 'mare';
    partners = visitingPartners(o.seed, want);
    const fromHall = o.hall.filter((c) => c.code !== parent!.code && sexOf(c.horse) === want);
    root.innerHTML = top(`A partner for ${p.name}`, `${p.name} is a ${sexOf(p)}. Pick a ${want} to be the foal's other parent.`)
      + '<div class="gr-sub">Visiting ' + (want === 'mare' ? 'mares' : 'stallions') + '</div>'
      + `<div class="br-list">${partners.map((v, i) => row(v.horse, `data-visit="${i}"`, v.premier ? `${v.note} ${v.record}. <b class="br-cost">${hd(v.cost ?? 0)}</b> <small>${(o.wallet?.() ?? 0) >= (v.cost ?? 0) ? 'Paid when you name the foal.' : `You have ${hd(o.wallet?.() ?? 0)}. Win more races to afford it.`}</small>` : `${v.note} ${v.record}. Free.`, { premier: v.premier, off: v.premier && (o.wallet?.() ?? 0) < (v.cost ?? 0) })).join('')}</div>`
      + (fromHall.length ? '<div class="gr-sub">From your Hall of Fame</div>' + `<div class="br-list">${fromHall.map((c) => row(c.horse, `data-hall="${c.code}"`, `${c.rank} · ${c.record.w}–${c.record.p}–${c.record.s} · ${foalsNote(c)}${c.guest ? ' · from another ranch' : ''}`, { off: !c.guest && homeFoalsLeft(c.horse) === 0 })).join('')}</div>` : '');
    $('br-back').addEventListener('click', () => (o.preselect ? o.onBack() : stepParent()));
    root.querySelectorAll<HTMLButtonElement>('[data-visit]:not([disabled])').forEach((b) => b.addEventListener('click', () => {
      const v = partners[Number(b.dataset.visit)];
      partner = v.horse; premier = !!v.premier; partnerCard = undefined; partnerRank = v.rank; stepOutlook();
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-hall]:not([disabled])').forEach((b) => b.addEventListener('click', () => {
      partnerCard = o.hall.find((c) => c.code === b.dataset.hall)!;
      partner = partnerCard.horse; premier = false; partnerRank = partnerCard.rank; stepOutlook();
    }));
  }

  /** Coat odds, plus a hint when a parent hides a gene that could show up in the foal. */
  function coatBlock(a: HorseDef, b: HorseDef): string {
    const odds = coatChances(a, b);
    const chips = odds.map((o) => `<span class="coat-chip${o.coat === 'dapple' || o.coat === 'roan' ? ' rare' : ''}">${COAT_LABEL[o.coat] ?? o.coat} ${Math.round(o.p * 100)}%</span>`).join('');
    const hidden = [a, b].map((h) => ({ h, c: carriedCoat(h) })).filter((x) => x.c);
    const hints = hidden.map((x) => `${x.h.name} carries a hidden ${COAT_LABEL[x.c!] ?? x.c} gene.`).join(' ');
    const stars = premier ? `<div class="br-star">★ Star trait guaranteed${sparksOf(b).length ? ` (${sparksOf(b).map((k) => STAT_LABEL.find(([x]) => x === k)![1]).join(', ')} runs in the family)` : ''}</div>` : '';
    const perks = lineagePerks(a, b, { a: parent!.rank, b: partnerRank });
    const perkHTML = perks.length ? `<div class="card-title">Family perks</div><ul class="br-perks">${perks.map((n) => `<li>${n} lifts a hidden peak</li>`).join('')}</ul>` : '';
    return `${stars}${perkHTML}<div class="card-title">Coat chances</div><div class="coat-chips">${chips}</div><p class="muted br-note">${hints ? hints + ' ' : ''}A very rare surprise coat (dapple or roan) can appear out of nowhere, then be bred on.</p>`;
  }

  function stepOutlook(): void {
    const a = parent!.horse;
    const b = partner!;
    const range = outlook(a, b);
    name = name || suggestName(a, b, o.seed);
    root.innerHTML = top('Foal outlook', `${a.name} × ${b.name}`)
      + `<div class="br-pair"><span>${portraitSVG(a, 84)}</span><b>+</b><span>${portraitSVG(b, 84)}</span><b>=</b><span class="br-egg">?</span></div>`
      + `<div class="card"><div class="card-title">Likely starting stats</div>${STAT_LABEL.map(([k, l]) => {
        const [lo, hi] = range[k];
        // Most foals land near the middle of the range; the top end is the ceiling.
        const typ = tierOf(Math.round((lo + hi) / 2));
        const top = tierOf(hi);
        return `<div class="stat"><span>${l}</span><span class="num"><small>Typical</small><span class="tier ${typ.cls}">${typ.name}</span>${top.name !== typ.name ? `<small>up to</small><span class="tier ${top.cls}">${top.name}</span>` : ''}</span></div>`;
      }).join('')}
        ${coatBlock(a, b)}
        <p class="muted br-note"><b>Maturity (parents' average): ${arcHint(a, b)}.</b> Foals usually take after one parent, but not always. You'll only know for sure when the horse retires.</p>
        <p class="muted br-note">${premier ? 'A Premier Partner guarantees <b>at least one shining star</b> (a standout stat), with about a 1 in 4 chance of two.' : 'About 1 in 10 foals is a <b>shining star</b>, born with a standout stat (often a parent\'s best), and now and then two.'} Personality and favourite things come from one parent or the other. Every foal also inherits hidden <b>peaks</b> (how high each stat can ever be trained), and parents with high peaks pass on higher ones.</p></div>`
      + `<label class="jr-name">Name your foal <input id="br-name" maxlength="18" autocomplete="off" spellcheck="false" value="${name.replace(/"/g, '')}"></label>`
      + '<button class="big go br-go" id="br-go">Welcome the foal!</button>';
    $('br-back').addEventListener('click', stepPartner);
    const input = $('br-name') as HTMLInputElement;
    input.addEventListener('input', () => {
      const clean = cleanName(input.value, 18);
      if (clean !== input.value) input.value = clean;
      name = clean;
    });
    $('br-go').addEventListener('click', async () => {
      const n = name.trim() || suggestName(a, b, o.seed);
      const go = $('br-go') as HTMLButtonElement;
      go.disabled = true;
      const err = await o.onDone(breedFoal(a, b, n, o.seed + 7, premier, { a: parent!.rank, b: partnerRank }), { parent: parent!, partnerCard, premier });
      if (typeof err === 'string') {
        go.disabled = false;
        let msg = root.querySelector('.br-err') as HTMLElement | null;
        if (!msg) { msg = document.createElement('p'); msg.className = 'br-err muted'; go.after(msg); }
        msg.textContent = err;
      }
    });
  }

  if (parent) stepPartner(); else stepParent();
}
