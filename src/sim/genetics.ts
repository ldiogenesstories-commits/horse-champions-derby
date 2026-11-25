// Coat and marking genetics. Every horse carries two genes for coat and two for
// face marking; the visible look is whichever gene is "stronger" (dominant).
// Weaker genes can hide in a parent and reappear in a foal.
//
// Rare coats (dapple, roan) only arrive through a rare mutation or a special
// partner, then can be passed on and bred for like any other gene.
import type { HorseDef } from './types';

export type Coat = NonNullable<HorseDef['coat']>;
export type Marking = NonNullable<HorseDef['marking']>;
export interface Genes { coat: [Coat, Coat]; marking: [Marking, Marking] }

export const COMMON_COATS: Coat[] = ['bay', 'chestnut', 'grey', 'black', 'palomino'];
export const RARE_COATS: Coat[] = ['dapple', 'roan'];
export const MARKINGS: Marking[] = ['none', 'star', 'blaze', 'snip'];

/** Chance, per gene passed down, of a brand new rare coat gene appearing. */
export const MUTATION_CHANCE = 0.02;

// Higher = stronger. Grey masks nearly everything; palomino and dapple only show
// when both genes match. Roan is strong but rare.
const COAT_RANK: Record<Coat, number> = { grey: 7, roan: 6, bay: 5, black: 4, chestnut: 3, palomino: 2, dapple: 1 };
// Face marks are dominant: a horse with no mark carries two "none" genes.
const MARK_RANK: Record<Marking, number> = { blaze: 4, star: 3, snip: 2, none: 1 };

/** Dapple shows only with two dapple genes; otherwise the stronger gene shows. */
export function visibleCoat([a, b]: [Coat, Coat]): Coat {
  if (a === 'dapple' || b === 'dapple') return a === b ? 'dapple' : a === 'dapple' ? b : a;
  return COAT_RANK[a] >= COAT_RANK[b] ? a : b;
}
export function visibleMarking([a, b]: [Marking, Marking]): Marking {
  return MARK_RANK[a] >= MARK_RANK[b] ? a : b;
}

/** A horse's genes. Older horses without saved genes are treated as pure-bred for what they show. */
export function genesOf(h: HorseDef): Genes {
  if (h.genes) return h.genes;
  const c = h.coat ?? 'bay';
  const m = h.marking ?? 'none';
  return { coat: [c, c], marking: [m, m] };
}

/** Give a horse hidden genes (visitors and field horses) without changing how it looks. */
export function withHiddenGenes(h: HorseDef, rng: () => number): HorseDef {
  const c = h.coat ?? 'bay';
  const m = h.marking ?? 'none';
  let coatHidden: Coat = c;
  if (rng() < 0.45) {
    // A hidden gene must be weaker than the visible coat so the look doesn't change.
    const weaker = COMMON_COATS.filter((x) => COAT_RANK[x] < COAT_RANK[c]);
    if (weaker.length) coatHidden = weaker[Math.floor(rng() * weaker.length)];
  }
  const weakerMarks = MARKINGS.filter((x) => MARK_RANK[x] < MARK_RANK[m]);
  const markHidden: Marking = rng() < 0.4 && weakerMarks.length ? weakerMarks[Math.floor(rng() * weakerMarks.length)] : m;
  return { ...h, genes: { coat: [c, coatHidden], marking: [m, markHidden] } };
}

/** Hidden genes a parent carries that don't show (for the "carrier" hint). */
export function carriedCoat(h: HorseDef): Coat | null {
  const g = genesOf(h);
  const shown = h.coat ?? visibleCoat(g.coat);
  const other = g.coat.find((x) => x !== shown) ?? null;
  return other;
}

function passOn<T>(pair: [T, T], rng: () => number): T {
  return pair[rng() < 0.5 ? 0 : 1];
}

/** The genes a foal receives: one from each parent, with a rare chance of a new rare coat gene. */
export function inheritGenes(a: HorseDef, b: HorseDef, rng: () => number): Genes {
  const ga = genesOf(a);
  const gb = genesOf(b);
  const coat = (['a', 'b'] as const).map((w) => {
    const g = passOn((w === 'a' ? ga : gb).coat, rng);
    return rng() < MUTATION_CHANCE ? RARE_COATS[Math.floor(rng() * RARE_COATS.length)] : g;
  }) as [Coat, Coat];
  const marking = [passOn(ga.marking, rng), passOn(gb.marking, rng)] as [Marking, Marking];
  return { coat, marking };
}

/** Exact odds (0–1) for each visible coat the foal could show, ignoring the rare mutation. */
export function coatOdds(a: HorseDef, b: HorseDef): { coat: Coat; p: number }[] {
  const ga = genesOf(a).coat;
  const gb = genesOf(b).coat;
  const odds = new Map<Coat, number>();
  for (const x of ga) for (const y of gb) {
    const c = visibleCoat([x, y]);
    odds.set(c, (odds.get(c) ?? 0) + 0.25);
  }
  return [...odds].map(([coat, p]) => ({ coat, p })).sort((p, q) => q.p - p.p);
}

/** True when a pair of genes can produce a rare coat (a carrier pair). */
export function canShowRare(a: HorseDef, b: HorseDef): boolean {
  return coatOdds(a, b).some((o) => RARE_COATS.includes(o.coat));
}
