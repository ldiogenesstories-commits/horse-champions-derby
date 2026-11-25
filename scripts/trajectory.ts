// Average stat total and career points by week, per strategy and arc.
//   npx tsx scripts/trajectory.ts <strategy> <foals> > out.json
import { playCareer, starterFoal, type Strategy } from './playthrough';
import type { Arc } from '../src/sim/arc';

const strategy = process.argv[2] as Strategy;
const N = Number(process.argv[3] ?? 100);
const out: Record<string, unknown> = {};
for (const arc of ['early', 'steady', 'late'] as Arc[]) {
  const stats: number[][] = [], pts: number[][] = [], finals: number[] = [], wins: number[] = [];
  for (let i = 0; i < N; i++) {
    const r = playCareer(starterFoal(100 + i, arc), strategy, 'x', 9000 + i);
    stats.push(r.statsByWeek); pts.push(r.pointsByWeek); finals.push(r.points); wins.push(r.w);
  }
  const weeks = Math.max(...stats.map((s) => s.length));
  const mean = (rows: number[][], w: number) => { const v = rows.filter((r) => r.length > w).map((r) => r[w]); return v.reduce((a, b) => a + b, 0) / v.length; };
  const m = finals.reduce((a, b) => a + b, 0) / N;
  const sd = Math.sqrt(finals.reduce((a, b) => a + (b - m) ** 2, 0) / (N - 1));
  out[arc] = {
    stats: Array.from({ length: weeks }, (_, w) => +mean(stats, w).toFixed(1)),
    points: Array.from({ length: weeks }, (_, w) => +mean(pts, w).toFixed(1)),
    finalPoints: +m.toFixed(1), ci95: +(1.96 * sd / Math.sqrt(N)).toFixed(1), wins: +(wins.reduce((a, b) => a + b, 0) / N).toFixed(2), n: N,
  };
}
console.log(JSON.stringify(out));
