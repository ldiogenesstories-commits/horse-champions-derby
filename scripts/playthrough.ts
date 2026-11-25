// Headless career playthroughs: runs whole careers with four player strategies,
// using the game's real race sim, growth, breeding and career rules.
//
//   npx tsx scripts/playthrough.ts            -> 4 named horses + averages over many foals
//
// What's modelled (same numbers as main.ts): drills (grade gains, side stats, tired
// halving, oats boost, swim), feeding (hunger costs 5% start energy), rest, fatigue,
// confidence + confidence cap, race weeks vs training weeks, ring rust, the hidden
// career arc (decline + half gains past the peak), events every 3rd week (x1.5 prize,
// Lucky Horseshoe), prize money, career points and rank.
// Not modelled: trust/greetings (no effect on race sim), treats from S grades, hand-riding.
import { Race } from '../src/sim/race';
import { makeField, PLAN_FOR_STYLE } from '../src/sim/field';
import { DISTANCES } from '../src/sim/track';
import { makeRng } from '../src/sim/rng';
import { breedFoal, visitingPartners } from '../src/career/breeding';
import { potentialOf, STAT_KEYS, type StatKey } from '../src/sim/growth';
import { GRADE_GAIN, type Grade } from '../src/training/grades';
// career.ts pulls in the browser-only cloud code, so its scoring rules are mirrored here.
const CAREER_RACES = 25;
const NEW_CAREER = (): CareerLog => ({ eventWins: [] as string[], crowdGifts: 0, distances: [] as string[], bestPlace: 99 });
const careerPoints = (_r: { w: number; p: number; s: number }, log: CareerLog) => Math.round(log.ladderPts ?? 0) + log.eventWins.length * 12;
const rankFor = (p: number) => (p >= 300 ? 'Legend' : p >= 210 ? 'Champion' : p >= 130 ? 'Star' : p >= 60 ? 'Contender' : 'Fan Favourite');
import type { CareerLog } from '../src/career/career';
import { recordFinish, termsFor } from '../src/career/ladder';
import { bigRaceOn } from '../src/career/bigRaces';
import { addRivals, recordRivals, rivalsFor } from '../src/career/rivals';
import { arcOf, CAREER_WEEKS, DECLINE_EVERY, MAX_DECLINE, PAST_PEAK_GAIN, PEAK_WEEK, type Arc } from '../src/sim/arc';
import { prizeFor } from '../src/profile/profile';
import type { HorseDef } from '../src/sim/types';

type Strategy = 'racer' | 'average' | 'grinder' | 'maxer';
const DRILLS = [
  { id: 'gate', main: 'gate', side: 'accel' },
  { id: 'duel', main: 'speed', side: 'guts' },
  { id: 'gallop', main: 'stamina' },
  { id: 'cones', main: 'agility' },
  { id: 'partner', main: 'stamina' },
] as const;
const RACE_FATIGUE = 35, DRILL_FATIGUE = 25, ACTIONS = 3;

/** A decent (not perfect) player's drill grades. */
function grade(rng: () => number): Grade {
  const r = rng();
  return r < 0.1 ? 'S' : r < 0.45 ? 'A' : r < 0.8 ? 'B' : r < 0.95 ? 'C' : 'D';
}

/** Should this strategy race this week (true) or take a training week? */
function racesThisWeek(s: Strategy, week: number, races: number): boolean {
  const weeksLeft = CAREER_WEEKS - week + 1;
  const racesLeft = CAREER_RACES - races;
  if (weeksLeft <= racesLeft) return true; // out of slack: must race
  if (s === 'racer') return true;
  if (s === 'average') return week % 5 !== 0; // about one training week in five
  if (s === 'grinder') return races < 15 ? week % 2 === 0 : true; // a training week after each early race
  return week > 25; // maxer: train weeks 1-25, then race
}

export interface Result {
  name: string; strategy: Strategy; arc: Arc; topClass: string; gpWins: number; bigRaces: number; bigWins: number; rivalRec: string; weeks: number; races: number;
  w: number; p: number; s: number; points: number; rank: string; prize: number;
  startTotal: number; bestTotal: number; bestWeek: number; finalTotal: number; declined: number;
  firstRaceTotal: number; winsFirstHalf: number; winsSecondHalf: number; events: number;
  log: string[];
  horse?: HorseDef;
  career?: CareerLog;
  /** Stat total and career points at the end of each week. */
  statsByWeek: number[];
  pointsByWeek: number[];
}

export type { Strategy };
export function playCareer(foal: HorseDef, strategy: Strategy, name: string, seed: number): Result {
  const h: HorseDef = structuredClone({ ...foal, name });
  const rng = makeRng(seed);
  const total = () => STAT_KEYS.reduce((t, k) => t + h.stats[k], 0);
  let fatigue = 0, confidence = h.boldness, confCap = Math.min(100, h.boldness + 15);
  let week = 1, races = 0, rust = 0, rustApplied = 0, declined = 0, prize = 0, boost = 0, horseshoe = false;
  const rec = { w: 0, p: 0, s: 0 };
  const career = NEW_CAREER();
  const startTotal = total();
  let bigRaces = 0, bigWins = 0;
  let bestTotal = startTotal, bestWeek = 1, firstRaceTotal = 0, winsFirstHalf = 0, winsSecondHalf = 0, events = 0;
  const log: string[] = [];
  const peak = PEAK_WEEK[arcOf(h)];
  const statsByWeek: number[] = [];
  const pointsByWeek: number[] = [];

  const grow = (k: StatKey, gain: number) => {
    const room = potentialOf(h, k) - h.stats[k];
    if (room <= 0) return;
    h.stats[k] += Math.min(room, gain * (week > peak ? PAST_PEAK_GAIN : 1) * Math.max(0.25, Math.min(1, room / 6)));
  };
  const weekPassed = () => {
    if (week <= peak || declined >= MAX_DECLINE || (week - peak) % DECLINE_EVERY !== 0) return;
    const top = [...STAT_KEYS].sort((a, b) => h.stats[b] - h.stats[a]).slice(0, 3);
    const k = top[Math.floor(rng() * top.length)];
    h.stats[k] = Math.max(30, h.stats[k] - 1);
    declined++;
  };
  const drill = () => {
    // Train whatever has the most room left (prefers the horse's distance stats).
    const room = (k: StatKey) => (potentialOf(h, k) - h.stats[k]) * (k === 'speed' || k === 'stamina' ? 1.2 : 1);
    const d = [...DRILLS].sort((a, b) => room(b.main as StatKey) + ('side' in b ? room(b.side as StatKey) / 2 : 0) - room(a.main as StatKey) - ('side' in a ? room(a.side as StatKey) / 2 : 0))[0];
    if (fatigue >= 90) { fatigue = Math.min(100, fatigue + 5); return; } // balks
    const tired = fatigue >= 70;
    const g = GRADE_GAIN[grade(rng)] * (tired ? 0.5 : 1) * (1 + boost);
    boost = 0;
    grow(d.main as StatKey, 'side' in d ? g : g * 1.25);
    if ('side' in d) grow(d.side as StatKey, g / 2);
    fatigue = Math.min(100, fatigue + DRILL_FATIGUE);
  };
  const swim = () => { const g = GRADE_GAIN[grade(rng)] * (1 + boost); boost = 0; grow('stamina', g); fatigue = Math.max(0, fatigue - 10); };

  while (races < CAREER_RACES && week <= CAREER_WEEKS) {
    // ---- three actions ----
    let fed = false;
    const raceWeek = racesThisWeek(strategy, week, races);
    for (let a = 0; a < ACTIONS; a++) {
      if (!fed && (strategy !== 'racer' || a === 0)) { fed = true; boost = 0.25; continue; } // oats
      if (fatigue >= 70) { fatigue = Math.max(0, fatigue - 50); continue; } // rest
      // Racers keep something in the tank; trainers don't mind being tired.
      if (raceWeek && fatigue >= 45 && strategy !== 'maxer') { swim(); continue; }
      if (fatigue >= 45) { swim(); continue; }
      drill();
    }
    if (raceWeek) {
      if (!firstRaceTotal) firstRaceTotal = total();
      // Everyone who races in a big-race week enters it.
      const big = bigRaceOn(week);
      const event = week % 3 === 0 && !big;
      const t = termsFor(career, { big });
      const distKey = (big ? big.dist : h.distancePref ?? 'mile') as keyof typeof DISTANCES;
      const fseed = seed * 97 + week;
      const field = addRivals(makeField(fseed, h, { ...PLAN_FOR_STYLE[h.style] }, true, confidence, 8, confCap, undefined, t.rivals), rivalsFor(fseed, !!big), t.rivals, fseed * 3 + week);
      prize -= Math.min(t.fee, Math.max(0, prize));
      if (big) bigRaces++;
      const me = field.find((e) => e.isPlayer)!;
      me.startEnergy = Math.round(100 - Math.max(0, fatigue - 40) * 0.5 - (fed ? 0 : 5));
      const race = new Race(field, seed * 31 + races, undefined, DISTANCES[distKey]);
      let guard = 0;
      while (!race.finished && guard++ < 30 * 600) race.step();
      const p = race.player!;
      races++;
      if (!career.distances.includes(distKey)) career.distances.push(distKey);
      career.bestPlace = Math.min(career.bestPlace, p.place);
      const pz = Math.round(prizeFor(p.place, event) * t.prize);
      const up = recordFinish(career, p.place, { points: t.points, winBonus: t.winBonus, winsWorth: t.winsWorth });
      if (big && p.place === 1) { bigWins++; (career.bigWins ??= []).push(big.name); }
      recordRivals(career, p.place, race.standings().filter((x) => x.def.id.startsWith('rival-')).map((x) => ({ id: x.def.id, place: x.place })));
      if (up) log.push(`→ ${up} at race ${races}`);
      prize += pz;
      if (event) events++;
      if (event && p.place === 1) {
        career.eventWins.push('Event');
        if (!horseshoe) { horseshoe = true; for (const k of STAT_KEYS) { const pot = Object.fromEntries(STAT_KEYS.map((x) => [x, potentialOf(h, x)])) as unknown as HorseDef["stats"]; pot[k] = Math.min(100, pot[k] + 2); h.potential = pot; } }
      }
      if (p.place === 1) { rec.w++; if (races <= 12) winsFirstHalf++; else winsSecondHalf++; }
      else if (p.place === 2) rec.p++;
      else if (p.place === 3) rec.s++;
      if (p.place === 1) confCap = Math.min(100, confCap + 3);
      else if (p.place <= 3) confCap = Math.min(100, confCap + 2);
      confCap = Math.min(100, confCap + 1); // ridden to its natural style
      confidence = Math.min(confCap, Math.round(p.confidence * 0.6 + h.boldness * 0.4));
      fatigue = Math.min(100, fatigue + RACE_FATIGUE);
      rust = 0; rustApplied = 0;
      if ([1, 5, 10, 15, 20, 25].includes(races)) log.push(`R${races} wk${week}: ${['1st', '2nd', '3rd'][p.place - 1] ?? `${p.place}th`} (stats ${Math.round(total())})`);
    } else {
      fatigue = Math.max(0, fatigue - 10);
      rust++;
      const step = rust < 2 ? 0 : rust === 2 ? 3 : 6;
      const hit = Math.min(step, 15 - rustApplied);
      if (hit > 0) { confidence = Math.max(0, confidence - hit); rustApplied += hit; }
    }
    statsByWeek.push(total());
    pointsByWeek.push(careerPoints(rec, career));
    week++;
    weekPassed();
    if (total() > bestTotal) { bestTotal = total(); bestWeek = week; }
  }
  const points = careerPoints(rec, career);
  return {
    name, strategy, arc: arcOf(h), topClass: ['Maiden', 'Novice', 'Graded', 'Stakes', 'Grand Prix'][career.topClass ?? 0], gpWins: career.gpWins ?? 0, bigRaces, bigWins,
    rivalRec: Object.entries(career.rivals ?? {}).map(([k, v]) => `${k} ${v.beat}-${v.lost}`).join(', '), weeks: week - 1, races, ...rec, points, rank: rankFor(points), prize,
    startTotal, bestTotal, bestWeek, finalTotal: total(), declined, firstRaceTotal, winsFirstHalf, winsSecondHalf, events, log,
    horse: h, career, statsByWeek, pointsByWeek,
  };
}

/** A starter foal bred from the visiting horses (as a new player would). */
export function starterFoal(seed: number, arc?: Arc): HorseDef {
  const mare = visitingPartners(seed + 101, 'mare')[0].horse;
  const stallion = visitingPartners(seed, 'stallion')[1].horse;
  const f = breedFoal(mare, stallion, 'Foal', seed + 7);
  if (arc) f.arc = arc;
  return f;
}

// ---------------- run ----------------
if (process.argv[1]?.endsWith('playthrough.ts')) await runReport();
async function runReport(): Promise<void> {
const STRATS: [Strategy, string, string][] = [
  ['racer', 'Rocket Rally', 'Straight to racing'],
  ['average', 'Midnight Meridian', 'Average player'],
  ['grinder', 'Copper Crescendo', 'Some stat grinding'],
  ['maxer', 'Sovereign Zenith', 'Train 25 weeks, then race'],
];
const fmt = (r: Result) => `${r.name.padEnd(18)} ${r.arc.padEnd(6)} top ${r.topClass} (GP wins ${r.gpWins}) big ${r.bigWins}/${r.bigRaces} [${r.rivalRec}] wk ${String(r.weeks).padStart(2)} · ${String(r.races).padStart(2)} races · ${r.w}-${r.p}-${r.s} · ${String(r.points).padStart(3)} pts ${r.rank.padEnd(13)} · ħ${String(r.prize).padStart(5)} · stats ${Math.round(r.startTotal)}→1st race ${Math.round(r.firstRaceTotal)}→best ${Math.round(r.bestTotal)} (wk ${r.bestWeek})→final ${Math.round(r.finalTotal)} · decline -${r.declined} · wins 1st/2nd half ${r.winsFirstHalf}/${r.winsSecondHalf}`;

const FOAL_SEED = Number(process.argv[2] ?? 4242);
console.log('=== The four named horses (same foal, steady arc) ===');
const foal = starterFoal(FOAL_SEED, 'steady');
console.log(`Foal: ${foal.distancePref} type, ${foal.style}, stats ${Math.round(STAT_KEYS.reduce((t, k) => t + foal.stats[k], 0))}, peaks ${Math.round(STAT_KEYS.reduce((t, k) => t + potentialOf(foal, k), 0))}`);
const named: Result[] = [];
for (const [s, n] of STRATS) {
  const r = playCareer(foal, s, n, 7000);
  named.push(r);
  console.log(fmt(r));
  console.log('   ' + r.log.join(' | '));
}

if (process.env.CARDS_OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.CARDS_OUT, JSON.stringify(named.map(({ horse, career, w, p, s, races, points, rank }) => ({ horse, career, record: { w, p, s }, races, points, rank }))));
}
const N = Number(process.argv[3] ?? 150);
console.log(`\n=== Averages over ${N} foals x 3 arcs per strategy ===`);
for (const [s, , label] of STRATS) {
  for (const arc of ['early', 'steady', 'late', 'all'] as const) {
    const rs: Result[] = [];
    for (let i = 0; i < N; i++) for (const a of arc === 'all' ? (['early', 'steady', 'late'] as Arc[]) : [arc]) rs.push(playCareer(starterFoal(100 + i, a), s, 'x', 9000 + i));
    const avg = (f: (r: Result) => number) => rs.reduce((t, r) => t + f(r), 0) / rs.length;
    const ranks: Record<string, number> = {};
    for (const r of rs) ranks[r.rank] = (ranks[r.rank] ?? 0) + 1;
    console.log(`${label.padEnd(26)} ${arc.padEnd(6)} weeks ${avg((r) => r.weeks).toFixed(1)} · races ${avg((r) => r.races).toFixed(1)} · wins ${avg((r) => r.w).toFixed(1)} · top3 ${avg((r) => r.w + r.p + r.s).toFixed(1)} · pts ${avg((r) => r.points).toFixed(0)} · ħ${avg((r) => r.prize).toFixed(0)} · 1st-race stats ${avg((r) => r.firstRaceTotal).toFixed(0)} · best ${avg((r) => r.bestTotal).toFixed(0)} · final ${avg((r) => r.finalTotal).toFixed(0)} · decline ${avg((r) => r.declined).toFixed(1)} · big wins ${avg((r) => r.bigWins).toFixed(2)}/${avg((r) => r.bigRaces).toFixed(1)} · reached GP ${Math.round(100 * rs.filter((r) => r.topClass === 'Grand Prix').length / rs.length)}% · GP wins ${avg((r) => r.gpWins).toFixed(1)} · ranks ${Object.entries(ranks).map(([k, v]) => `${k} ${Math.round((100 * v) / rs.length)}%`).join(', ')}`);
  }
}
}
