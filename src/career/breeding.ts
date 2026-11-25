// Breeding: pair a retired horse with a visiting partner (or another retiree)
// and raise the foal. Foals inherit looks, talents and personality from both
// parents, with a little surprise mixed in.
import { makeRng } from '../sim/rng';
import { NEEDS } from '../sim/field';
import type { HorseDef } from '../sim/types';
import { BAND_HI, BAND_LO, POT_HI, POT_LO, potentialOf, rollIn, rollSparks, settlePotential, sparksOf } from '../sim/growth';
import { coatOdds, inheritGenes, RARE_COATS, visibleCoat, visibleMarking, withHiddenGenes } from '../sim/genetics';

type StatKey = keyof HorseDef['stats'];
const STATS: StatKey[] = ['speed', 'stamina', 'accel', 'guts', 'gate', 'agility'];
const COATS = ['bay', 'chestnut', 'grey', 'black', 'palomino'] as const;

/** How many foals one horse can have: on its own ranch, and across everyone else who uses its card code. */
export const HOME_FOAL_LIMIT = 3;
export const SHARED_FOAL_LIMIT = 4;
/** Placeholder price in Horse Dollars; tune against race prizes once the wallet exists. */
export const PREMIER_COST = 500;

/** Foals a card has left on this ranch. Guest cards (scanned in) use the shared limit instead. */
export const homeFoalsLeft = (h: HorseDef): number => Math.max(0, HOME_FOAL_LIMIT - (h.foals ?? 0));
const MARKS = ['none', 'star', 'blaze', 'snip'] as const;

export const sexOf = (h: HorseDef): 'mare' | 'stallion' => h.sex ?? (h.name.length % 2 ? 'mare' : 'stallion');

const VISITOR_NAMES = {
  stallion: ['Captain Tumbleweed', 'Lord Buttonwood', 'Thunderclap Jr.', 'Sir Pepperpot', 'Duke of Marmalade', 'Admiral Kettle', 'Copper Crown', 'Midnight Mailman'],
  mare: ['Lady Lantern', 'Duchess Dandelion', 'Queen Biscotti', 'Miss Moonbeam', 'Clover Countess', 'Velvet Sparrow', 'Honeycomb Belle', 'Polka Dot Pearl'],
};
const PREMIER_NAMES = {
  stallion: ['Grand Marshal Gold', 'Emperor Starfall', 'Sovereign Skyline', 'Royal Thunderbolt'],
  mare: ['Empress Stardust', 'Golden Meadowlark', 'Sovereign Aurora', 'Royal Moonstone'],
};
const BLURBS: Record<StatKey, string> = {
  speed: 'blazing speed', stamina: 'endless stamina', accel: 'a lightning kick', guts: 'pure grit', gate: 'rocket starts', agility: 'nimble feet',
};

export interface Partner { horse: HorseDef; note: string; record: string; premier?: boolean; cost?: number }

/** Four visiting partners of the opposite sex, each with a standout talent. */
export function visitingPartners(seed: number, sex: 'mare' | 'stallion'): Partner[] {
  const rng = makeRng(seed);
  const shuffle = <T,>(xs: readonly T[]) => [...xs].map((x) => [rng(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  const names = shuffle(VISITOR_NAMES[sex]).slice(0, 4);
  // Each visitor has a different talent and coat, so the choice matters.
  const stars = shuffle(STATS);
  const coats = shuffle(COATS);
  const silks = shuffle(['#2F5D9E', '#7A3E8E', '#3E8E8A', '#D96C2C', '#B83A6B', '#3E6B48']);
  const list: Partner[] = names.map((name, i) => {
    const star = stars[i];
    const stats = Object.fromEntries(STATS.map((k) => [k, Math.round(58 + rng() * 16)])) as unknown as HorseDef['stats'];
    stats[star] = Math.round(84 + rng() * 10);
    const dIdx = Math.max(0, Math.min(3, Math.round(1.5 + (stats.stamina - stats.speed) / 10)));
    const w = Math.round(3 + rng() * 9);
    return {
      horse: withHiddenGenes({
        id: `visitor${i}`, number: 0, name, color: silks[i], stats,
        style: (['front', 'stalker', 'mid', 'closer'] as const)[Math.floor(rng() * 4)],
        fire: Math.round(rng() * 100) / 100, boldness: Math.round(45 + rng() * 35),
        need: NEEDS[Math.floor(rng() * NEEDS.length)],
        coat: coats[i], marking: MARKS[Math.floor(rng() * MARKS.length)],
        distancePref: (['sprint', 'mile', 'classic', 'endurance'] as const)[dIdx], sex,
      }, rng),
      note: `Known for ${BLURBS[star]}.`,
      record: `${w} career wins`,
    };
  });
  // The fourth visitor is the Premier Partner: costs Horse Dollars, carries 1-2 star
  // traits, and guarantees the foal at least one star trait. 30% carry a hidden rare coat gene.
  const prem = list[3];
  const ph = prem.horse;
  const pStars = shuffle(STATS).slice(0, rng() < 0.4 ? 2 : 1);
  for (const k of pStars) ph.stats[k] = Math.round(92 + rng() * 5);
  ph.sparks = pStars;
  ph.name = shuffle(PREMIER_NAMES[sex])[0];
  if (rng() < 0.3 && ph.genes) ph.genes = { ...ph.genes, coat: [ph.genes.coat[0], RARE_COATS[Math.floor(rng() * RARE_COATS.length)]] };
  prem.premier = true;
  prem.cost = PREMIER_COST;
  prem.note = `Star trait guaranteed: ${pStars.map((k) => BLURBS[k]).join(' and ')}.`;
  prem.record = `${Math.round(14 + rng() * 8)} career wins`;
  return list;
}

// Every foal starts in a general band with lots of room to grow. Strong parents
// lift the ceiling a lot and the floor a little; the stronger parent counts more.
const AVERAGE_PARENT = 70;

/** Starting range for one stat, from the two parents' values. */
export function statRange(x: number, y: number): [number, number] {
  const strong = 0.6 * Math.max(x, y) + 0.4 * Math.min(x, y);
  const edge = strong - AVERAGE_PARENT;
  const lo = Math.max(42, BAND_LO + 0.2 * edge);
  const hi = Math.min(84, BAND_HI + 0.5 * edge);
  return [Math.round(lo), Math.round(Math.max(lo + 4, hi))];
}

/** Hidden potential range for one stat: parents with high peaks pass on higher peaks. */
export function potentialRange(px: number, py: number): [number, number] {
  const strong = 0.6 * Math.max(px, py) + 0.4 * Math.min(px, py);
  const edge = strong - 85;
  const lo = Math.max(66, Math.min(96, POT_LO + 0.35 * edge));
  // A foal can outgrow its better parent's peak, as long as the other parent is
  // decent in this stat (up to +5 when the other parent's peak is 85 or more).
  // With a weak partner (peak 70 or less) the ceiling is exactly the better parent's peak.
  const bonus = Math.max(0, Math.min(5, (Math.min(px, py) - 70) / 3));
  const hi = Math.max(lo + 4, Math.min(100, Math.max(POT_HI, Math.max(px, py) + bonus)));
  return [Math.round(lo), Math.round(hi)];
}

/** Expected starting stat range for a foal of these parents. */
export function outlook(a: HorseDef, b: HorseDef): Record<StatKey, [number, number]> {
  return Object.fromEntries(STATS.map((k) => [k, statRange(a.stats[k], b.stats[k])])) as unknown as Record<StatKey, [number, number]>;
}

/** Every coat the foal could show, with its chance (0-1). A rare surprise gene is possible on top. */
export function coatChances(a: HorseDef, b: HorseDef): { coat: string; p: number }[] {
  return coatOdds(a, b);
}

/** A name built from the parents' names, e.g. "Gale" + "Moonbeam". */
export function suggestName(a: HorseDef, b: HorseDef, seed: number): string {
  const rng = makeRng(seed);
  const words = (h: HorseDef) => h.name.replace(/^(Sir|Lord|Lady|Miss|Queen|Duke|Duchess|Captain|Admiral) (of )?/, '').split(' ').filter((w) => w.length > 2);
  const wa = words(a);
  const wb = words(b);
  const first = wa[Math.floor(rng() * wa.length)] ?? 'Little';
  const second = wb[Math.floor(rng() * wb.length)] ?? 'Star';
  return first === second ? `${first} Junior` : `${first} ${second}`;
}

/** `premier`: partner `b` is a Premier Partner, so the foal is guaranteed at least one star trait. */
export function breedFoal(a: HorseDef, b: HorseDef, name: string, seed: number, premier = false): HorseDef {
  const rng = makeRng(seed);
  const pick = <T,>(x: T, y: T): T => (rng() < 0.5 ? x : y);
  const stats = Object.fromEntries(STATS.map((k) => [k, rollIn(statRange(a.stats[k], b.stats[k]), rng)])) as unknown as HorseDef['stats'];
  // Hidden potential: how high each stat can ever be trained, inherited from the parents' peaks.
  const potential = Object.fromEntries(STATS.map((k) => [k, rollIn(potentialRange(potentialOf(a, k), potentialOf(b, k)), rng)])) as unknown as HorseDef['stats'];
  // Shining star: now and then a foal is born with a standout stat (rarely two),
  // usually in whatever its parents were best at.
  const best = [...STATS].sort((p, q) => Math.max(a.stats[q], b.stats[q]) - Math.max(a.stats[p], b.stats[p]))[0];
  const favour = premier ? sparksOf(b)[0] ?? best : best;
  const sparks = rollSparks(stats, potential, rng, favour, premier);
  settlePotential(stats, potential);
  // Coat and markings come from genes: one from each parent, so hidden genes can reappear.
  const genes = inheritGenes(a, b, rng);
  const coat = visibleCoat(genes.coat);
  const marking = visibleMarking(genes.marking);
  const need = rng() < 0.2 ? NEEDS[Math.floor(rng() * NEEDS.length)] : pick(a.need ?? 'social', b.need ?? 'social');
  const dIdx = Math.max(0, Math.min(3, Math.round(1.5 + (stats.stamina - stats.speed) / 10 + (rng() - 0.5))));
  const sire = sexOf(a) === 'stallion' ? a : b;
  const dam = sire === a ? b : a;
  return {
    id: 'player', number: 7, name, color: a.color,
    stats,
    style: pick(a.style, b.style),
    fire: Math.round(Math.max(0, Math.min(1, (a.fire + b.fire) / 2 + (rng() - 0.5) * 0.3)) * 100) / 100,
    boldness: Math.round(Math.max(30, Math.min(85, (a.boldness + b.boldness) / 2 + (rng() - 0.5) * 16))),
    need, coat, marking, genes,
    distancePref: (['sprint', 'mile', 'classic', 'endurance'] as const)[dIdx],
    sex: rng() < 0.5 ? 'mare' : 'stallion',
    sire: sire.name, dam: dam.name,
    generation: Math.max(a.generation ?? 1, b.generation ?? 1) + 1,
    potential,
    sparks,
  };
}
