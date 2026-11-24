// Synced family races. Every device builds the identical race from the host's
// start message (same seed, same entrants, same posts) and runs it locally so it
// looks smooth. The host is the referee: it applies everyone's inputs and sends
// corrections ~10x a second, plus the official finish.
import { makeField } from '../sim/field';
import { makeRng } from '../sim/rng';
import type { Race } from '../sim/race';
import type { Entrant, HorseDef, HorseState, RacePlan } from '../sim/types';

export interface Ride { plan: RacePlan; confidence: number; confCap: number; startEnergy: number }
export interface RosterEntry { id: string; name: string; horse: HorseDef; ride: Ride; jockey?: unknown }

export const horseIdFor = (deviceId: string) => `p-${deviceId}`;

/** Same entrants, numbers and gate order on every device. */
export function buildEntrants(seed: number, roster: RosterEntry[], myDeviceId: string): Entrant[] {
  const cpuCount = Math.max(0, 8 - roster.length);
  const base: RacePlan = { start: 'steady', track: 'stalk', close: 'early', lane: 'rail' } as RacePlan;
  const cpu = cpuCount ? makeField(seed, null, base, true, undefined, cpuCount) : [];
  const usedNumbers = new Set(cpu.map((e) => e.def.number));
  const free = [7, 1, 2, 3, 4, 5, 6, 8, 9].filter((n) => !usedNumbers.has(n));
  const humans: Entrant[] = roster.map((r, i) => ({
    def: { ...r.horse, id: horseIdFor(r.id), number: free[i] ?? 10 + i },
    plan: { ...r.ride.plan },
    auto: false,
    confidence: r.ride.confidence,
    confidenceCap: r.ride.confCap,
    startEnergy: r.ride.startEnergy,
    isPlayer: r.id === myDeviceId,
  }));
  const all = [...cpu, ...humans];
  // Shuffle gates with the shared seed so every device agrees.
  const rng = makeRng(seed ^ 0x5eed);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

const FIELDS = ['dist', 'lane', 'targetLane', 'speed', 'energy', 'confidence', 'confCap', 'holding', 'surgeT', 'blocked', 'boxed',
  'phase', 'finished', 'finishTime', 'place', 'rank', 'stumbled', 'whipCount', 'boxedTotal', 'overRaced', 'energyAtClose'] as const;
type SnapHorse = Partial<Pick<HorseState, (typeof FIELDS)[number]>> & { id: string };
export interface Snapshot { t: number; finished: boolean; horses: SnapHorse[] }

export function makeSnapshot(r: Race): Snapshot {
  return {
    t: r.t,
    finished: r.finished,
    horses: r.horses.map((h) => {
      const o: SnapHorse = { id: h.def.id };
      for (const f of FIELDS) (o as Record<string, unknown>)[f] = typeof h[f] === 'number' ? Math.round((h[f] as number) * 1000) / 1000 : h[f];
      return o;
    }),
  };
}

/** Bring this device's race in line with the host's. */
export function applySnapshot(r: Race, s: Snapshot): void {
  for (const sh of s.horses) {
    const h = r.horses.find((x) => x.def.id === sh.id);
    if (!h) continue;
    for (const f of FIELDS) if (sh[f] !== undefined) (h as unknown as Record<string, unknown>)[f] = sh[f];
  }
  r.t = s.t;
  // Keep the race's own finish counter consistent with the host's places.
  (r as unknown as { finishCount: number }).finishCount = r.horses.filter((h) => h.finished).length;
  if (s.finished) r.finished = true;
}
