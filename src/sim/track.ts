// Stadium-shaped oval, 1,200 m per lap. Races run 1 to 2⅔ laps.
// Coordinates are meters with the track centered on (0, 0); +y is down
// (screen space). Horses run counterclockwise: up the right straight,
// across the top turn, down the left straight, around the bottom turn,
// and finish halfway up the right straight (the home stretch).

export const RADIUS = 110; // inner-rail turn radius (m)
export const LANE_WIDTH = 1.2; // m
export const MAX_LANE = 7;
export const STRAIGHT = (1200 - 2 * Math.PI * RADIUS) / 2; // ≈ 254.4 m
export const LAP = 2 * STRAIGHT + 2 * Math.PI * RADIUS; // 1200 m
export const RACE_DISTANCE = LAP;
/** The finish line is halfway along the right straight. */
const FINISH_POS = STRAIGHT / 2;

/** Race distances (m). A race starts wherever puts the finish on the home stretch. */
export const DISTANCES = { sprint: 1200, mile: 1600, classic: 2400, endurance: 3200 } as const;
export type DistanceKey = keyof typeof DISTANCES;

/** Lap position (0..LAP) of a horse `dist` meters into a race of `raceDistance`. */
export function lapPos(dist: number, raceDistance: number = LAP): number {
  return wrap(FINISH_POS - raceDistance + dist);
}

/** Total laps run (rounded up) and the lap a horse is on (1-based). */
export function lapInfo(dist: number, raceDistance: number): { lap: number; laps: number } {
  const laps = Math.ceil(raceDistance / LAP - 1e-9);
  const first = raceDistance - (laps - 1) * LAP; // meters until first crossing of the finish line
  const lap = dist < first ? 1 : Math.min(laps, 2 + Math.floor((dist - first) / LAP));
  return { lap, laps };
}

type Seg = 'right' | 'top' | 'left' | 'bottom';

function segAt(p: number): { seg: Seg; u: number } {
  const turn = Math.PI * RADIUS;
  if (p < STRAIGHT) return { seg: 'right', u: p };
  p -= STRAIGHT;
  if (p < turn) return { seg: 'top', u: p };
  p -= turn;
  if (p < STRAIGHT) return { seg: 'left', u: p };
  p -= STRAIGHT;
  return { seg: 'bottom', u: p };
}

/** Which part of the oval a race distance falls on, and how far along it (0–1). */
export function trackParam(dist: number, raceDistance: number = LAP): { seg: Seg; frac: number } {
  const { seg, u } = segAt(lapPos(dist, raceDistance));
  const len = seg === 'right' || seg === 'left' ? STRAIGHT : Math.PI * RADIUS;
  return { seg, frac: u / len };
}

/** Is the horse on a turn at this race distance? */
export function onTurn(dist: number, raceDistance: number = LAP): boolean {
  const s = segAt(lapPos(dist, raceDistance)).seg;
  return s === 'top' || s === 'bottom';
}

function wrap(p: number): number {
  return ((p % LAP) + LAP) % LAP;
}

/** Position (meters) and heading for a race distance and lane. */
export function trackPoint(dist: number, lane: number, raceDistance: number = LAP): { x: number; y: number; angle: number } {
  const { seg, u } = segAt(lapPos(dist, raceDistance));
  const off = lane * LANE_WIDTH;
  const half = STRAIGHT / 2;
  switch (seg) {
    case 'right':
      return { x: RADIUS + off, y: half - u, angle: -Math.PI / 2 };
    case 'left':
      return { x: -RADIUS - off, y: -half + u, angle: Math.PI / 2 };
    case 'top': {
      const th = u / RADIUS; // 0 → π
      const r = RADIUS + off;
      return { x: r * Math.cos(th), y: -half - r * Math.sin(th), angle: -Math.PI / 2 - th };
    }
    case 'bottom': {
      const th = Math.PI + u / RADIUS; // π → 2π
      const r = RADIUS + off;
      return { x: r * Math.cos(th), y: half - r * Math.sin(th), angle: -Math.PI / 2 - th };
    }
  }
}

/** Outward unit normal at a race distance (points away from the infield). */
export function outwardNormal(dist: number): { x: number; y: number } {
  const a = trackPoint(dist, 0);
  const b = trackPoint(dist, 1);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** Rail-distance gained when a horse in `lane` covers `meters`. Outer lanes lose ground on turns. */
export function railProgress(dist: number, lane: number, meters: number, raceDistance: number = LAP): number {
  if (!onTurn(dist, raceDistance)) return meters;
  return (meters * RADIUS) / (RADIUS + lane * LANE_WIDTH);
}

export const BOUNDS = {
  halfWidth: RADIUS + MAX_LANE * LANE_WIDTH + 4,
  halfHeight: STRAIGHT / 2 + RADIUS + MAX_LANE * LANE_WIDTH + 4,
};
