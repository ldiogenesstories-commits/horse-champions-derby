// How hard are the big races? At every big-race week of a career, take the horse as it
// is and run each big race many times, against (a) a regular race in its current class at
// its best distance, and (b) a regular class race at the big race's distance.
//   npx tsx scripts/bigRaceTest.ts <foals> <racesPerTest>
import { playCareer, starterFoal, type RaceWeekCtx, type Skill, type Strategy } from './playthrough';
import { makeField, PLAN_FOR_STYLE } from '../src/sim/field';
import { Race } from '../src/sim/race';
import { DISTANCES } from '../src/sim/track';
import { termsFor } from '../src/career/ladder';
import { BIG_RACES } from '../src/career/bigRaces';
import { addRivals, rivalsFor } from '../src/career/rivals';
import type { Arc } from '../src/sim/arc';

const FOALS = Number(process.argv[2] ?? 30);
const K = Number(process.argv[3] ?? 20);
const PLAYERS: [string, Strategy, Skill][] = [['New player (races straight through)', 'racer', 'new'], ['Average player', 'average', 'decent'], ['Skilled player (grinds, good drills)', 'grinder', 'skilled'], ['Skilled patient player (trains, then races)', 'maxer', 'skilled']];

type Tally = { big: number; cls: number; clsSame: number; n: number; fitWin: number; fitN: number };
function win(ctx: RaceWeekCtx, rivals: [number, number], dist: keyof typeof DISTANCES, big: boolean, seed: number): boolean {
  const f = makeField(seed, ctx.horse, { ...PLAN_FOR_STYLE[ctx.horse.style] }, true, ctx.confidence, 8, ctx.confCap, undefined, rivals);
  addRivals(f, rivalsFor(seed, big), rivals, seed * 3 + 1);
  f.find((e) => e.isPlayer)!.startEnergy = ctx.startEnergy;
  const r = new Race(f, seed * 31 + 7, undefined, DISTANCES[dist]);
  let g = 0;
  while (!r.finished && g++ < 30 * 600) r.step();
  return r.player!.place === 1;
}

const out: Record<string, Record<string, Tally>> = {};
for (const [label, strat, skill] of PLAYERS) {
  out[label] = {};
  for (const b of BIG_RACES) out[label][b.name] = { big: 0, cls: 0, clsSame: 0, n: 0, fitWin: 0, fitN: 0 };
  for (let i = 0; i < FOALS; i++) {
    const arc = (['early', 'steady', 'late'] as Arc[])[i % 3];
    playCareer(starterFoal(300 + i, arc), strat, 'x', 5000 + i, {
      skill,
      onRaceWeek: (ctx) => {
        const b = BIG_RACES.find((x) => x.week === ctx.week);
        if (!b) return;
        const t = out[label][b.name];
        const cls = termsFor(ctx.career);
        const best = (ctx.horse.distancePref ?? 'mile') as keyof typeof DISTANCES;
        for (let k = 0; k < K; k++) {
          const sd = 100000 + i * 1000 + k * 17 + ctx.week;
          const w = win(ctx, termsFor(ctx.career, { big: b }).rivals, b.dist, true, sd);
          if (w) t.big++;
          if (best === b.dist) { t.fitN++; if (w) t.fitWin++; }
          if (win(ctx, cls.rivals, best, false, sd)) t.cls++;
          if (win(ctx, cls.rivals, b.dist, false, sd)) t.clsSame++;
          t.n++;
        }
      },
    });
  }
}
const pct = (a: number, n: number) => (n ? `${Math.round((100 * a) / n)}%` : '-').padStart(4);
for (const [label, races] of Object.entries(out)) {
  console.log(`\n${label}`);
  for (const [name, t] of Object.entries(races)) console.log(`  ${name.padEnd(20)} big race ${pct(t.big, t.n)} · class race (best distance) ${pct(t.cls, t.n)} · class race (same distance) ${pct(t.clsSame, t.n)} · n=${t.n} · horses suited to the distance ${pct(t.fitWin, t.fitN)} (n=${t.fitN})`);
}
