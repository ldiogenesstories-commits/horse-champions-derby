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

/** Weeks before its peak that a horse starts to look close to its best. */
export const NEAR_PEAK_WEEKS = 6;
/** The week the trainer gives a first read on how a horse is growing up. */
export const FIRST_READ_WEEK = 10;

export type Form = 'rising' | 'peak' | 'past';
/** Where a horse is on its arc this week (shown as a badge in the stable). */
export function formOf(arc: Arc, day: number): Form {
  const peak = PEAK_WEEK[arc];
  return day > peak ? 'past' : day > peak - NEAR_PEAK_WEEKS ? 'peak' : 'rising';
}
export const FORM_LABEL: Record<Form, string> = { rising: '📈 Still improving', peak: '⭐ Near its best', past: '📉 Past its prime' };

/**
 * The trainer's read for a week, if there is one. Clues, not labels: they never name the arc, but
 * a watchful owner can tell early, steady and late bloomers apart, and plan races around them.
 * `day` is the week that has just begun.
 */
export function trainerTell(arc: Arc, day: number, name: string): string | null {
  const peak = PEAK_WEEK[arc];
  if (day === FIRST_READ_WEEK) {
    return {
      early: `Trainer: ${name} is quick and eager, growing up fast. Horses like this tend to peak early.`,
      steady: `Trainer: ${name} is calm and growing at an even pace. A horse like this holds its form a good while.`,
      late: `Trainer: ${name} is still a gangly kid, slow to fill out. It may take a while to reach its best.`,
    }[arc];
  }
  if (day === peak - NEAR_PEAK_WEEKS + 1) {
    return {
      early: `Trainer: ${name} looks nearly grown and as sharp as it will get. The best weeks are close, so make them count.`,
      steady: `Trainer: ${name} has settled into a strong, even stride. A good run of form is coming.`,
      late: `Trainer: ${name} is only now growing into its frame. The best is still ahead.`,
    }[arc];
  }
  if (day === peak) return `Trainer: this is ${name}'s peak week. It doesn't get better than this.`;
  // Late and steady horses keep going while others fade: a tell for the ones who are not done yet.
  if (arc !== 'early' && day === PEAK_WEEK.early + 1) return `Trainer: ${name} shows no sign of slowing down yet. Still going strong.`;
  if (arc === 'late' && day === PEAK_WEEK.steady + 1) return `Trainer: ${name} has plenty left in the tank. The late bloomer's time is now.`;
  return null;
}
