import { cleanName } from '../game/names';
// Breeding barn: pick a retired parent, choose a partner, see the foal outlook, name the foal.
import type { HorseDef } from '../sim/types';
import { portraitSVG } from '../game/portrait';
import type { RetiredCard } from './career';
import { tierOf } from '../sim/growth';
import { breedFoal, outlook, possibleCoats, sexOf, suggestName, visitingPartners, type Partner } from './breeding';

const STAT_LABEL: [keyof HorseDef['stats'], string][] = [
  ['speed', 'Speed'], ['stamina', 'Stamina'], ['accel', 'Acceleration'], ['guts', 'Guts'], ['gate', 'Gate Skill'], ['agility', 'Agility'],
];
const COAT_LABEL: Record<string, string> = { bay: 'Bay', chestnut: 'Chestnut', grey: 'Grey', black: 'Black', palomino: 'Palomino' };
const SHORT: Record<keyof HorseDef['stats'], string> = { speed: 'SPD', stamina: 'STA', accel: 'ACC', guts: 'GUT', gate: 'GTE', agility: 'AGI' };
/** Parents' stats shown as tiers (Iron → Diamond); the numbers stay underneath. */
const tierChips = (h: HorseDef) => `<span class="tiers">${STAT_LABEL.map(([k, l]) => {
  const t = tierOf(h.stats[k]);
  return `<span class="tier ${t.cls}" title="${l}: ${t.name}"><em>${SHORT[k]}</em>${t.name}</span>`;
}).join('')}</span>`;
const sexIcon = (h: HorseDef) => (sexOf(h) === 'mare' ? '♀ Mare' : '♂ Stallion');

export function runBreeding(root: HTMLElement, o: {
  hall: RetiredCard[];
  preselect?: string; // card code
  seed: number;
  onDone: (foal: HorseDef) => void;
  onBack: () => void;
}): void {
  let parent: RetiredCard | undefined = o.hall.find((c) => c.code === o.preselect);
  let partner: HorseDef | undefined;
  let partners: Partner[] = [];
  let name = '';
  const $ = (id: string) => root.querySelector(`#${id}`) as HTMLElement;

  const top = (title: string, sub: string) => `
    <button class="ghost small back" id="br-back">← Back</button>
    <div class="eyebrow">Breeding barn</div><h1>${title}</h1><p class="sub">${sub}</p>`;

  const row = (h: HorseDef, data: string, extra: string, on = false) => `
    <button class="br-row${on ? ' on' : ''}" ${data}>
      <span class="br-face">${portraitSVG(h, 56)}</span>
      <span class="br-info"><b>${h.name}</b><small>${sexIcon(h)} · ${COAT_LABEL[h.coat ?? 'bay']}${h.generation && h.generation > 1 ? ` · Gen ${h.generation}` : ''}</small><span>${extra}</span>${tierChips(h)}</span>
    </button>`;

  function stepParent(): void {
    root.innerHTML = top('Choose a parent', 'Retired horses can pass their talents on to a foal.')
      + `<div class="br-list">${o.hall.map((c) => row(c.horse, `data-code="${c.code}"`, `${c.rank} · ${c.record.w}–${c.record.p}–${c.record.s}`)).join('')}</div>`;
    $('br-back').addEventListener('click', o.onBack);
    root.querySelectorAll<HTMLButtonElement>('[data-code]').forEach((b) => b.addEventListener('click', () => {
      parent = o.hall.find((c) => c.code === b.dataset.code);
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
      + `<div class="br-list">${partners.map((v, i) => row(v.horse, `data-visit="${i}"`, `${v.note} ${v.record}.`)).join('')}</div>`
      + (fromHall.length ? '<div class="gr-sub">From your Hall of Fame</div>' + `<div class="br-list">${fromHall.map((c) => row(c.horse, `data-hall="${c.code}"`, `${c.rank} · ${c.record.w}–${c.record.p}–${c.record.s}`)).join('')}</div>` : '');
    $('br-back').addEventListener('click', () => (o.preselect ? o.onBack() : stepParent()));
    root.querySelectorAll<HTMLButtonElement>('[data-visit]').forEach((b) => b.addEventListener('click', () => { partner = partners[Number(b.dataset.visit)].horse; stepOutlook(); }));
    root.querySelectorAll<HTMLButtonElement>('[data-hall]').forEach((b) => b.addEventListener('click', () => { partner = o.hall.find((c) => c.code === b.dataset.hall)!.horse; stepOutlook(); }));
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
        <p class="muted br-note">Coat: probably ${possibleCoats(a, b).map((c) => COAT_LABEL[c]).join(' or ')}, with a small chance of a surprise. Personality and favourite things come from one parent or the other. About 1 in 10 foals is a <b>shining star</b>, born with a standout stat (often a parent's best), and now and then two. Every foal also inherits hidden <b>peaks</b> (how high each stat can ever be trained), and parents with high peaks pass on higher ones.</p></div>`
      + `<label class="jr-name">Name your foal <input id="br-name" maxlength="18" autocomplete="off" spellcheck="false" value="${name.replace(/"/g, '')}"></label>`
      + '<button class="big go br-go" id="br-go">Welcome the foal!</button>';
    $('br-back').addEventListener('click', stepPartner);
    const input = $('br-name') as HTMLInputElement;
    input.addEventListener('input', () => {
      const clean = cleanName(input.value, 18);
      if (clean !== input.value) input.value = clean;
      name = clean;
    });
    $('br-go').addEventListener('click', () => {
      const n = name.trim() || suggestName(a, b, o.seed);
      o.onDone(breedFoal(a, b, n, o.seed + 7));
    });
  }

  if (parent) stepPartner(); else stepParent();
}
