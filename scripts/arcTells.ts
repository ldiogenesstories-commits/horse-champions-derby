// Prints the trainer's read and the form badge week by week for each arc, and checks the clues are distinct.
import { ARCS, PEAK_WEEK, formOf, trainerTell, type Arc } from '../src/sim/arc';

let fail = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) fail++; };

const log: Record<Arc, { day: number; text: string }[]> = { early: [], steady: [], late: [] };
for (const arc of ARCS) {
  for (let day = 1; day <= 50; day++) {
    const t = trainerTell(arc, day, 'Test');
    if (t) log[arc].push({ day, text: t });
  }
  console.log(`\n${arc} (peak week ${PEAK_WEEK[arc]})`);
  for (const l of log[arc]) console.log(`  wk ${String(l.day).padStart(2)}  ${l.text}`);
}
console.log('');
for (const arc of ARCS) {
  check(log[arc].some((l) => l.day === 10), `${arc}: gets a first read at week 10`);
  check(log[arc].some((l) => l.day === PEAK_WEEK[arc]), `${arc}: peak-week note lands on its peak`);
  check(formOf(arc, 1) === 'rising' && formOf(arc, PEAK_WEEK[arc]) === 'peak' && formOf(arc, PEAK_WEEK[arc] + 1) === 'past', `${arc}: form badge rising → near best → past prime`);
}
const w10 = ARCS.map((a) => log[a].find((l) => l.day === 10)!.text);
check(new Set(w10).size === 3, 'week-10 reads differ for every arc');
check(!w10.some((t) => /early|steady|late bloomer/i.test(t.replace('peak early', ''))), 'reads give clues, not labels');
check(!log.early.some((l) => /no sign of slowing/.test(l.text)), 'early bloomers never get a "not slowing" tell');
check(log.late.some((l) => l.day === PEAK_WEEK.early + 1) && log.late.some((l) => l.day === PEAK_WEEK.steady + 1), 'late bloomers get a tell right after both earlier peaks pass');
console.log(fail ? `\n${fail} check(s) failed` : '\nAll arc-tell checks passed');
process.exit(fail ? 1 : 0);
