import { BAND_HI, BAND_LO, POT_HI, POT_LO, STAT_KEYS, rollIn, rollSparks, settlePotential } from './growth';
// Builds race fields: the player's horse plus CPU rivals.
import { makeRng } from './rng';
import type { ClosePlan, Entrant, HorseDef, Need, RacePlan, RunningStyle, StartPlan, TrackPlan } from './types';

export const NEEDS: Need[] = ['lazy', 'intense', 'social', 'loner', 'showoff'];

const NAMES = [
  'Copper Kettle', 'Midnight Ledger', 'Sunny Disposition', 'Paper Lantern', 'Quick Study',
  'Brass Button', 'Thunder Biscuit', 'Lucky Thimble', 'Rolling Pin', 'Velvet Hammer',
  'Kite String', 'Maple Rocket', 'Silver Spoonful', 'Hop Scotch', 'Pocket Watch',
];
const COLORS = ['#2F5D9E', '#7A3E8E', '#E2A93B', '#F4EFE4', '#2B2118', '#3E8E8A', '#D96C2C', '#8A9A3B'];

export const PLAN_FOR_STYLE: Record<RunningStyle, RacePlan> = {
  front: { start: 'fast', track: 'lead', close: 'protect', lane: 'rail' },
  stalker: { start: 'steady', track: 'stalk', close: 'early', lane: 'rail' },
  mid: { start: 'steady', track: 'mid', close: 'dig', lane: 'wide' },
  closer: { start: 'settle', track: 'lag', close: 'late', lane: 'wide' },
};

export const PLAYER_HORSE: HorseDef = {
  id: 'player',
  number: 7,
  name: 'Gale Runner',
  color: '#C8452D',
  stats: { speed: 62, stamina: 58, accel: 70, guts: 55, gate: 60, agility: 64 },
  style: 'stalker',
  fire: 0.4,
  boldness: 55,
  need: 'intense',
  coat: 'bay',
  marking: 'blaze',
  distancePref: 'mile',
  sex: 'stallion',
  potential: { speed: 86, stamina: 82, accel: 90, guts: 80, gate: 86, agility: 88 },
};

export function makeField(seed: number, player: HorseDef | null, playerPlan: RacePlan, playerAuto: boolean, playerConfidence?: number, size = 8, playerCap?: number, playerBuff?: Entrant['buff']): Entrant[] {
  const rng = makeRng(seed);
  const styles: RunningStyle[] = ['front', 'stalker', 'mid', 'closer'];
  const used = new Set<number>();
  const entrants: Entrant[] = [];
  const numbers = shuffle([1, 2, 3, 4, 5, 6, 8, 9], rng);
  const cpuCount = player ? size - 1 : size;
  for (let i = 0; i < cpuCount; i++) {
    let n = Math.floor(rng() * NAMES.length);
    while (used.has(n)) n = (n + 1) % NAMES.length;
    used.add(n);
    const style = styles[Math.floor(rng() * styles.length)];
    const stat = () => Math.round(40 + rng() * 40);
    const stamina = stat();
    const speed = stat();
    // Best distance leans on stamina vs. speed, with some surprises.
    const dIdx = Math.max(0, Math.min(3, Math.round(1.5 + (stamina - speed) / 20 + (rng() - 0.5) * 1.6)));
    const def: HorseDef = {
      id: `cpu${i}`,
      number: numbers[i],
      name: NAMES[n],
      color: COLORS[i % COLORS.length],
      stats: { speed, stamina, accel: stat(), guts: stat(), gate: stat(), agility: stat() },
      style,
      fire: rng(),
      boldness: Math.round(35 + rng() * 45),
      need: NEEDS[Math.floor(rng() * NEEDS.length)],
      coat: (['bay', 'chestnut', 'grey', 'black', 'palomino'] as const)[Math.floor(rng() * 5)],
    arc: (['early', 'steady', 'late'] as const)[Math.abs(seed * 7 + 3) % 3],
      marking: (['none', 'star', 'blaze', 'snip'] as const)[Math.floor(rng() * 4)],
      distancePref: (['sprint', 'mile', 'classic', 'endurance'] as const)[dIdx],
    };
    // CPU jockeys usually ride to the horse's style, sometimes not.
    const plan = rng() < 0.8 ? { ...PLAN_FOR_STYLE[style] } : randomPlan(rng);
    // CPU rivals arrive with some racing experience: cap a bit above their natural level.
    const cap = Math.min(100, def.boldness + 15 + Math.round(rng() * 15));
    entrants.push({ def, plan, auto: true, confidence: def.boldness + rng() * 8, confidenceCap: cap });
  }
  if (player) {
    entrants.push({ def: player, plan: playerPlan, auto: playerAuto, confidence: playerConfidence ?? player.boldness, confidenceCap: playerCap, buff: playerBuff, isPlayer: true });
  }
  // Random post positions.
  return shuffle(entrants, rng);
}

export function randomPlan(rng: () => number): RacePlan {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  return {
    start: pick<StartPlan>(['fast', 'steady', 'settle']),
    track: pick<TrackPlan>(['lead', 'stalk', 'mid', 'lag']),
    close: pick<ClosePlan>(['early', 'late', 'protect', 'dig']),
    lane: pick(['rail', 'wide'] as const),
  };
}

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const FOAL_NAMES = [
  'Ember Lark', 'Biscuit Comet', 'Paper Moon', 'Saddle Song', 'Clover Dash', 'Rocket Pudding',
  'Juniper Flash', 'Tin Whistle', 'Marble Sky', 'Honey Badge', 'Pepper Kite', 'Starling Jig',
  'Cobalt Daisy', 'Sundial', 'Ginger Snap', 'Willow Spark', 'Lantern Lad', 'Button Thunder',
];
const SILKS = ['#C8452D', '#2F5D9E', '#7A3E8E', '#3E8E8A', '#D96C2C', '#E2A93B', '#3E6B48', '#B83A6B'];

/** A fresh young horse for a new career: random looks, personality and talents. */
export function makeFoal(seed: number, avoid: string[] = []): HorseDef {
  const rng = makeRng(seed);
  const pool = FOAL_NAMES.filter((n) => !avoid.includes(n));
  const name = (pool.length ? pool : FOAL_NAMES)[Math.floor(rng() * (pool.length || FOAL_NAMES.length))];
  // Same starting band and potential as bred foals.
  const stat = () => rollIn([BAND_LO, BAND_HI], rng);
  const stamina = stat();
  const speed = stat();
  const dIdx = Math.max(0, Math.min(3, Math.round(1.5 + (stamina - speed) / 10 + (rng() - 0.5) * 1.4)));
  const stats = { speed, stamina, accel: stat(), guts: stat(), gate: stat(), agility: stat() };
  const potential = Object.fromEntries(STAT_KEYS.map((k) => [k, rollIn([POT_LO, POT_HI], rng)])) as unknown as HorseDef['stats'];
  const sparks = rollSparks(stats, potential, rng);
  settlePotential(stats, potential);
  return {
    id: 'player',
    number: 7,
    name,
    color: SILKS[Math.floor(rng() * SILKS.length)],
    stats,
    potential,
    sparks,
    style: (['front', 'stalker', 'mid', 'closer'] as const)[Math.floor(rng() * 4)],
    fire: Math.round(rng() * 100) / 100,
    boldness: Math.round(40 + rng() * 30),
    need: NEEDS[Math.floor(rng() * NEEDS.length)],
    coat: (['bay', 'chestnut', 'grey', 'black', 'palomino'] as const)[Math.floor(rng() * 5)],
    marking: (['none', 'star', 'blaze', 'snip'] as const)[Math.floor(rng() * 4)],
    distancePref: (['sprint', 'mile', 'classic', 'endurance'] as const)[dIdx],
    sex: rng() < 0.5 ? 'mare' : 'stallion',
  };
}
