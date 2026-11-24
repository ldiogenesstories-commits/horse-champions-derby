// Shared grading for all training mini-games.
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export function gradeFor(pct: number): Grade {
  if (pct >= 97.5) return 'S';
  if (pct >= 90) return 'A';
  if (pct >= 75) return 'B';
  if (pct >= 55) return 'C';
  return 'D';
}

/** Base stat points earned for the drill's main stat, by grade. */
export const GRADE_GAIN: Record<Grade, number> = { S: 3, A: 2.2, B: 1.5, C: 1, D: 0.5 };

export type TreatId = 'treatA' | 'treatB' | 'starfruit';
/** Placeholder S-tier drops; the real item list comes later. */
export const TREATS: Record<TreatId, { name: string; effect: string }> = {
  treatA: { name: 'Special Treat A', effect: 'Trust +5' },
  treatB: { name: 'Special Treat B', effect: 'Confidence +8 for the next race' },
  starfruit: { name: 'Starfruit ⭐', effect: "Raises a stat's hidden peak by 3" },
};
