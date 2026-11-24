// Headless balance check: runs many all-CPU races at each distance and
// reports how strategies and horse types perform. Goals: no plan dominates
// overall, each running style has a distance where it shines, riding to a
// horse's style beats fighting it, and distance aptitude matters.
import { Race } from '../src/sim/race';
import { makeField } from '../src/sim/field';
import { DISTANCES } from '../src/sim/track';

const RACES = Number(process.argv[2] ?? 1200);
const pct = (w: number, n: number) => ((100 * w) / Math.max(n, 1)).toFixed(1).padStart(5) + '%';
const styleOf = { lead: 'front', stalk: 'stalker', mid: 'mid', lag: 'closer' } as const;

for (const [name, distance] of Object.entries(DISTANCES)) {
  const wins: Record<string, number> = {};
  const runs: Record<string, number> = {};
  let timeSum = 0, photo = 0;
  const add = (k: string, won: boolean) => { runs[k] = (runs[k] ?? 0) + 1; if (won) wins[k] = (wins[k] ?? 0) + 1; };
  for (let r = 0; r < RACES; r++) {
    const field = makeField(1000 + r, null, { start: 'steady', track: 'stalk', close: 'early', lane: 'rail' }, true);
    const race = new Race(field, 5000 + r, undefined, distance);
    let guard = 0;
    while (!race.finished && guard++ < 30 * 600) race.step();
    const st = race.standings();
    timeSum += st[0].finishTime;
    if (st[1].finishTime - st[0].finishTime < 0.15) photo++;
    for (const h of race.horses) {
      const won = h.place === 1;
      add(`track:${h.plan.track}`, won);
      add(`close:${h.plan.close}`, won);
      // A "true" style = horse ridden to its natural style.
      if (styleOf[h.plan.track] === h.def.style) add(`style:${h.def.style}`, won);
      add(h.def.distancePref === race.distClass ? 'aptitude:match' : 'aptitude:off', won);
      add(`need:${h.def.need}`, won);
    }
  }
  console.log(`\n${name.toUpperCase()} ${distance}m — avg win time ${(timeSum / RACES).toFixed(1)}s, photo finishes ${pct(photo, RACES)}`);
  const keys = Object.keys(runs).sort();
  for (const k of keys) console.log(`  ${k.padEnd(18)} ${pct(wins[k] ?? 0, runs[k])}`);
}
