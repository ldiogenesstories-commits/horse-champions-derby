// Marquee races on fixed weeks of every career. Bigger fields, bigger prizes, a trophy,
// and every named rival turns up. They make the bloomer arc a timing puzzle:
// peak an early bloomer for the Derby, or save a late bloomer for the Championship.
import type { DistanceKey } from '../sim/track';

export interface BigRace {
  id: string;
  name: string;
  week: number;
  dist: DistanceKey;
  /** Rival stat range. */
  rivals: [number, number];
  /** Prize money multiplier (on the base prize table). */
  prize: number;
  /** Career points multiplier for placings. */
  points: number;
  /** Extra career points for winning. */
  winBonus: number;
  fee: number;
  blurb: string;
}

export const BIG_RACES: BigRace[] = [
  { id: 'spring', name: 'Spring Classic', week: 12, dist: 'mile', rivals: [54, 76], prize: 4, points: 1.6, winBonus: 15, fee: 10_000, blurb: 'The first big test of the season, over a mile.' },
  { id: 'derby', name: 'Royal Derby', week: 24, dist: 'classic', rivals: [60, 82], prize: 6, points: 2, winBonus: 25, fee: 15_000, blurb: 'The race every owner dreams of. Two laps of the Classic course.' },
  { id: 'sprint', name: 'Autumn Sprint Cup', week: 34, dist: 'sprint', rivals: [64, 86], prize: 6, points: 2, winBonus: 25, fee: 15_000, blurb: 'Six furlongs of pure speed. Blink and it\'s over.' },
  { id: 'champ', name: 'Grand Championship', week: 45, dist: 'classic', rivals: [70, 92], prize: 10, points: 2.5, winBonus: 40, fee: 25_000, blurb: 'The season finale. Only the best are still in form by now.' },
];

export const bigRaceOn = (week: number): BigRace | null => BIG_RACES.find((b) => b.week === week) ?? null;
/** The next big race from this week on. */
export const nextBigRace = (week: number): BigRace | null => BIG_RACES.find((b) => b.week >= week) ?? null;
