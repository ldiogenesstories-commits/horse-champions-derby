// Named rivals: four recurring horses who climb the ladder alongside you. One may turn
// up in a regular race; all of them run in the big races. Head-to-head records are kept.
import type { Entrant, HorseDef, RunningStyle } from '../sim/types';
import { PLAN_FOR_STYLE } from '../sim/field';
import { makeRng } from '../sim/rng';
import type { CareerLog } from './career';

export interface Rival {
  id: string;
  name: string;
  tagline: string;
  style: RunningStyle;
  dist: NonNullable<HorseDef['distancePref']>;
  coat: NonNullable<HorseDef['coat']>;
  color: string;
  /** Stat skews: what they're best and worst at. */
  skew: Partial<Record<keyof HorseDef['stats'], number>>;
}

export const RIVALS: Rival[] = [
  { id: 'baron', name: 'Baron Blackthorn', tagline: 'Leads from the gate and never looks back.', style: 'front', dist: 'mile', coat: 'black', color: '#2B2118', skew: { speed: 5, gate: 6, stamina: -4 } },
  { id: 'starling', name: 'Lady Starling', tagline: 'Hangs at the back, then flies past everyone.', style: 'closer', dist: 'classic', coat: 'grey', color: '#7A3E8E', skew: { accel: 6, guts: 4, gate: -5 } },
  { id: 'duke', name: 'Ironclad Duke', tagline: 'Never tires. The longer the race, the better.', style: 'stalker', dist: 'endurance', coat: 'bay', color: '#2F5D9E', skew: { stamina: 7, guts: 4, accel: -5 } },
  { id: 'wren', name: 'Whirlwind Wren', tagline: 'A blur over short trips. Nimble as a bird.', style: 'front', dist: 'sprint', coat: 'chestnut', color: '#D96C2C', skew: { speed: 4, agility: 6, stamina: -6 } },
];

/** A rival at a given strength: stats near the top of the race's rival range. */
export function rivalHorse(r: Rival, range: [number, number], seed: number, number: number): HorseDef {
  const rng = makeRng(seed);
  const base = range[1] - 4;
  const stat = (k: keyof HorseDef['stats']) => Math.max(35, Math.min(99, Math.round(base + (r.skew[k] ?? 0) + (rng() - 0.5) * 6)));
  return {
    id: `rival-${r.id}`, number, name: r.name, color: r.color,
    stats: { speed: stat('speed'), stamina: stat('stamina'), accel: stat('accel'), guts: stat('guts'), gate: stat('gate'), agility: stat('agility') },
    style: r.style, fire: 0.7, boldness: 72, need: 'showoff', coat: r.coat, marking: 'blaze', distancePref: r.dist,
  };
}

/** Which rivals run: all of them in a big race, otherwise sometimes one. */
export function rivalsFor(seed: number, big: boolean): Rival[] {
  if (big) return RIVALS;
  const rng = makeRng(seed * 7 + 11);
  return rng() < 0.45 ? [RIVALS[Math.floor(rng() * RIVALS.length)]] : [];
}

/** Swap CPU entrants for rivals (keeping post numbers). */
export function addRivals(field: Entrant[], rivals: Rival[], range: [number, number], seed: number): Entrant[] {
  const cpus = field.filter((e) => !e.isPlayer);
  rivals.slice(0, cpus.length).forEach((r, i) => {
    const slot = cpus[cpus.length - 1 - i];
    slot.def = rivalHorse(r, range, seed + i * 13, slot.def.number);
    slot.plan = { ...PLAN_FOR_STYLE[r.style] };
    slot.confidence = 75;
    slot.confidenceCap = 90;
  });
  return field;
}

export const rivalOf = (horseId: string): Rival | undefined => RIVALS.find((r) => `rival-${r.id}` === horseId);

/** Update head-to-head records; returns lines like "You beat Baron Blackthorn (2-1)". */
export function recordRivals(log: CareerLog, myPlace: number, others: { id: string; place: number }[]): string[] {
  const lines: string[] = [];
  log.rivals ??= {};
  for (const o of others) {
    const r = rivalOf(o.id);
    if (!r) continue;
    const h = (log.rivals[r.id] ??= { beat: 0, lost: 0 });
    if (myPlace < o.place) h.beat++; else h.lost++;
    lines.push(`${myPlace < o.place ? '⚔️ You beat' : '😤 You lost to'} ${r.name} (${h.beat}-${h.lost} this career)`);
  }
  return lines;
}
