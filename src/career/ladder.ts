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
}

export const CLASSES: RaceClass[] = [
  { name: 'Maiden', rivals: [40, 64], prize: 1, points: 1, winsToMove: 1 },
  { name: 'Novice', rivals: [50, 73], prize: 1.25, points: 1.15, winsToMove: 2 },
  { name: 'Graded', rivals: [60, 82], prize: 1.6, points: 1.3, winsToMove: 3 },
  { name: 'Stakes', rivals: [68, 90], prize: 2.2, points: 1.5, winsToMove: 3 },
  { name: 'Grand Prix', rivals: [77, 97], prize: 3, points: 1.8, winsToMove: Infinity },
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
export function recordFinish(log: CareerLog, place: number): string | null {
  const i = classOf(log);
  const c = CLASSES[i];
  log.ladderPts = (log.ladderPts ?? 0) + (PLACE_POINTS[place - 1] ?? 0) * c.points;
  log.topClass = Math.max(log.topClass ?? 0, i);
  if (place !== 1) return null;
  if (i === CLASSES.length - 1) log.gpWins = (log.gpWins ?? 0) + 1;
  log.clsWins = (log.clsWins ?? 0) + 1;
  if (log.clsWins < c.winsToMove) return null;
  log.cls = i + 1;
  log.clsWins = 0;
  log.topClass = Math.max(log.topClass ?? 0, i + 1);
  return CLASSES[i + 1].name;
}
