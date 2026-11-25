// Career arc: every horse has a hidden prime. A career lasts up to 50 game weeks and
// 25 races. After its peak week a horse slowly loses a little form and trains less
// well, so weeks spent training (instead of racing) eat into its prime.
import type { HorseDef } from './types';

export type Arc = 'early' | 'steady' | 'late';
export const ARCS: Arc[] = ['early', 'steady', 'late'];
export const CAREER_WEEKS = 50;
/** The week a horse starts to decline. */
export const PEAK_WEEK: Record<Arc, number> = { early: 30, steady: 38, late: 44 };
export const ARC_LABEL: Record<Arc, string> = { early: 'Early bloomer', steady: 'Steady', late: 'Late bloomer' };
/** Total stat points a horse can lose after its peak. */
export const MAX_DECLINE = 15;
/** Past the peak, a stat point is lost every this-many weeks. */
export const DECLINE_EVERY = 1;
/** After its peak, training gains are this much smaller. */
export const PAST_PEAK_GAIN = 0.25;
/** Chance a foal breaks from its parents' arcs. */
export const ARC_SURPRISE = 0.15;

/** A horse's arc. Horses from before arcs existed get one from their name (always the same). */
export function arcOf(h: Pick<HorseDef, 'name' | 'arc'>): Arc {
  if (h.arc) return h.arc;
  let n = 0;
  for (const c of h.name) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return ARCS[n % 3];
}

export const randomArc = (rng: () => number): Arc => ARCS[Math.floor(rng() * 3)];

/** Usually one parent's arc; now and then a surprise. */
export function inheritArc(a: HorseDef, b: HorseDef, rng: () => number): Arc {
  const from = rng() < 0.5 ? arcOf(a) : arcOf(b);
  if (rng() >= ARC_SURPRISE) return from;
  const others = ARCS.filter((x) => x !== from);
  return others[Math.floor(rng() * others.length)];
}

/** The parents' average maturity, as a hint for breeding (not the foal's actual odds). */
export function arcHint(a: HorseDef, b: HorseDef): string {
  const v = (ARCS.indexOf(arcOf(a)) + ARCS.indexOf(arcOf(b))) / 2;
  if (v === 0) return 'Early';
  if (v === 0.5) return 'Early to steady';
  if (v === 1) return 'Steady';
  if (v === 1.5) return 'Steady to late';
  return 'Late';
}
