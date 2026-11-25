// Shared growth rules: the starting band every foal rolls in, hidden potential
// (how high each stat can ever be trained), shining-star talents, and tier names.
import type { HorseDef } from './types';

export type StatKey = keyof HorseDef['stats'];
export const STAT_KEYS: StatKey[] = ['speed', 'stamina', 'accel', 'guts', 'gate', 'agility'];

/** Every foal rolls each stat in this band; middle values are most common. */
export const BAND_LO = 52;
export const BAND_HI = 72;
/** A typical horse's peak; potential above this is a gift. */
export const POT_LO = 76;
export const POT_HI = 92;

/** Roll within a range; middle values are most common (average of two rolls). */
export const rollIn = ([lo, hi]: [number, number], rng: () => number): number => Math.round(lo + ((rng() + rng()) / 2) * (hi - lo));

/** Shining stars: ~1 in 10 foals gets a standout stat; ~1 in 5 of those gets a second. */
export const SPARK_CHANCE = 0.1;
export const SECOND_SPARK_CHANCE = 0.2;

/** Premier partners guarantee a first star and give a better chance of a second. */
export const PREMIER_SECOND_SPARK_CHANCE = 0.25;

/** Give a foal its shining-star talents (mutates stats and potential). */
export function rollSparks(stats: HorseDef['stats'], potential: HorseDef['stats'], rng: () => number, favour?: StatKey, premier = false): StatKey[] {
  if (!premier && rng() >= SPARK_CHANCE) return [];
  const sparks: StatKey[] = [];
  const pickOne = (): StatKey => {
    const pool = STAT_KEYS.filter((k) => !sparks.includes(k));
    if (favour && !sparks.includes(favour) && (premier || rng() < 0.6)) return favour;
    return pool[Math.floor(rng() * pool.length)];
  };
  const add = (k: StatKey) => {
    sparks.push(k);
    stats[k] = Math.min(90, stats[k] + 8 + Math.round(rng() * 6));
    potential[k] = Math.min(100, Math.max(potential[k] + 5, stats[k] + 10));
  };
  add(pickOne());
  if (rng() < (premier ? PREMIER_SECOND_SPARK_CHANCE : SECOND_SPARK_CHANCE)) add(pickOne());
  return sparks;
}

/** Make sure every stat has room to grow above where it starts. */
export function settlePotential(stats: HorseDef['stats'], potential: HorseDef['stats']): void {
  for (const k of STAT_KEYS) potential[k] = Math.min(100, Math.max(potential[k], stats[k] + 10));
}

/** Tier names shown instead of raw numbers (the numbers stay underneath). */
export const TIERS = [
  { name: 'Iron', min: 0, cls: 'iron' },
  { name: 'Bronze', min: 58, cls: 'bronze' },
  { name: 'Silver', min: 70, cls: 'silver' },
  { name: 'Gold', min: 82, cls: 'gold' },
  { name: 'Diamond', min: 92, cls: 'diamond' },
] as const;
export function tierOf(v: number): (typeof TIERS)[number] {
  let t: (typeof TIERS)[number] = TIERS[0];
  for (const x of TIERS) if (v >= x.min) t = x;
  return t;
}

/** A horse's shining-star stats (supports older saves with a single `spark`). */
export const sparksOf = (h: HorseDef): StatKey[] => h.sparks ?? (h.spark ? [h.spark] : []);
/** Potential for a stat; horses from before potential existed get a fair default. */
export const potentialOf = (h: HorseDef, k: StatKey): number => h.potential?.[k] ?? Math.min(100, Math.max(88, h.stats[k] + 10));
