// Late-game check: how often does each kind of player win their last races (races 18-25)
// against the computer? Regular races and big races are counted separately.
//   npx tsx scripts/lateGame.ts <foalsPerArc>
import { playCareer, starterFoal, type Skill, type Strategy } from './playthrough';
import type { Arc } from '../src/sim/arc';

const N = Number(process.argv[2] ?? 20);
const PLAYERS: [string, Strategy, Skill][] = [
  ['New player, races straight through', 'racer', 'new'],
  ['Average player', 'average', 'decent'],
  ['Well played: grinds, good drills', 'grinder', 'skilled'],
  ['Well played: trains, then races', 'maxer', 'skilled'],
];
const pct = (a: number, n: number) => (n ? `${Math.round((100 * a) / n)}%` : '-');
for (const [label, strat, skill] of PLAYERS) {
  let lw = 0, ln = 0, l3 = 0, bw = 0, bn = 0, allW = 0, allN = 0;
  for (const arc of ['early', 'steady', 'late'] as Arc[]) for (let i = 0; i < N; i++) {
    const r = playCareer(starterFoal(500 + i, arc), strat, 'x', 7000 + i, { skill });
    r.places.forEach((p, k) => {
      allN++; if (p.place === 1) allW++;
      if (p.big) { bn++; if (p.place === 1) bw++; return; }
      if (k >= 17) { ln++; if (p.place === 1) lw++; if (p.place <= 3) l3++; }
    });
  }
  console.log(`${label.padEnd(36)} late regular races: win ${pct(lw, ln).padStart(4)} · top 3 ${pct(l3, ln).padStart(4)} · big races: win ${pct(bw, bn).padStart(4)} (n=${bn}) · all races: win ${pct(allW, allN)}`);
}
