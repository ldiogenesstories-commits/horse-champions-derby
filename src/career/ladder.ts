// The class ladder: every horse starts in Maiden races and moves up by winning.
// Rivals get stronger each class, and prizes and career points grow with them.
import type { CareerLog } from './career';

export interface RaceClass {
  name: string;
  /** Rival horses roll each stat in this range. */
  rivals: [number, number];
  /** Prize money multiplier. */
  prize: number;
  /** Career points multiplier. */
  points: number;
  /** Wins in this class needed to move up. */
  winsToMove: number;
  /** Entry fee in Horse Dollars. */
  fee: number;
}

export const CLASSES: RaceClass[] = [
  { name: 'Maiden', rivals: [40, 64], prize: 1, points: 1, winsToMove: 1, fee: 0 },
  { name: 'Novice', rivals: [48, 70], prize: 1.25, points: 1.15, winsToMove: 2, fee: 25 },
  { name: 'Graded', rivals: [54, 76], prize: 1.6, points: 1.3, winsToMove: 3, fee: 50 },
  { name: 'Stakes', rivals: [60, 82], prize: 2.2, points: 1.5, winsToMove: 3, fee: 100 },
  { name: 'Grand Prix', rivals: [66, 88], prize: 3, points: 1.8, winsToMove: Infinity, fee: 150 },
];
/** Base career points for 1st, 2nd and 3rd (before the class multiplier). */
export const PLACE_POINTS = [10, 6, 3];

export const classOf = (log: CareerLog): number => Math.min(CLASSES.length - 1, log.cls ?? 0);
export const currentClass = (log: CareerLog): RaceClass => CLASSES[classOf(log)];

/** "Novice · 1 of 2 wins to move up" */
export function ladderLine(log: CareerLog): string {
  const c = currentClass(log);
  if (!Number.isFinite(c.winsToMove)) return `${c.name} class (top of the ladder)`;
  const n = c.winsToMove - (log.clsWins ?? 0);
  return `${c.name} class · ${n} more win${n === 1 ? '' : 's'} to move up`;
}

/**
 * Record a finish in the current class. Returns the new class name if the horse was promoted.
 * Mutates the career log (class, wins in class, ladder points, Grand Prix wins).
 */
export function recordFinish(log: CareerLog, place: number, o: { points?: number; winBonus?: number; winsWorth?: number } = {}): string | null {
  const i = classOf(log);
  const c = CLASSES[i];
  log.ladderPts = (log.ladderPts ?? 0) + (PLACE_POINTS[place - 1] ?? 0) * (o.points ?? c.points) + (place === 1 ? o.winBonus ?? 0 : 0);
  log.topClass = Math.max(log.topClass ?? 0, i);
  if (place !== 1) return null;
  if (i === CLASSES.length - 1) log.gpWins = (log.gpWins ?? 0) + 1;
  log.clsWins = (log.clsWins ?? 0) + (o.winsWorth ?? 1);
  if (log.clsWins < c.winsToMove) return null;
  log.cls = i + 1;
  log.clsWins = 0;
  log.topClass = Math.max(log.topClass ?? 0, i + 1);
  return CLASSES[i + 1].name;
}

/** How much stronger a big race's field is than your current class. */
export const BIG_RACE_BUMP = 5;
/** Big-race fields never get stronger than this, so the best horses can still win them. */
export const BIG_RACE_CAP: [number, number] = [74, 94];

/** What kind of race this is: a regular class race, one class up, or a big race. */
export interface RaceTerms { rivals: [number, number]; prize: number; points: number; fee: number; winsWorth: number; winBonus: number; label: string }
export function termsFor(log: CareerLog, o: { up?: boolean; big?: import('./bigRaces').BigRace | null } = {}): RaceTerms {
  if (o.big) {
    // Always tougher than your own class: about one class up, and never below the race's floor.
    const c = CLASSES[classOf(log)];
    // The cap keeps top-class fields winnable, but a big race is never easier than your own class.
    const rivals: [number, number] = [Math.max(c.rivals[0], Math.min(BIG_RACE_CAP[0], Math.max(o.big.rivals[0], c.rivals[0] + BIG_RACE_BUMP))), Math.max(c.rivals[1], Math.min(BIG_RACE_CAP[1], Math.max(o.big.rivals[1], c.rivals[1] + BIG_RACE_BUMP)))];
    return { rivals, prize: o.big.prize, points: o.big.points, fee: o.big.fee, winsWorth: 2, winBonus: o.big.winBonus, label: o.big.name };
  }
  const i = classOf(log);
  const c = CLASSES[Math.min(CLASSES.length - 1, i + (o.up ? 1 : 0))];
  return { rivals: c.rivals, prize: c.prize, points: c.points, fee: c.fee, winsWorth: o.up ? 2 : 1, winBonus: 0, label: `${c.name}${o.up ? ' (entered up)' : ''}` };
}
export const canEnterUp = (log: CareerLog): boolean => classOf(log) < CLASSES.length - 1;
