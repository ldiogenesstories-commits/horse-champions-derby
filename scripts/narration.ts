// Prints narrator transcripts and checks for flicker (calls changing too fast).
import { Race, STEP } from '../src/sim/race';
import { Narrator } from '../src/sim/narrator';
import { makeField, PLAYER_HORSE } from '../src/sim/field';
import { DISTANCES } from '../src/sim/track';

let minGap = Infinity, total = 0, races = 0;
for (const [name, d] of Object.entries(DISTANCES)) {
  for (let i = 0; i < 60; i++) {
    const race = new Race(makeField(300 + i, PLAYER_HORSE, { start: 'steady', track: 'stalk', close: 'early', lane: 'rail' }, true), 77 + i, undefined, d);
    const n = new Narrator(i);
    let last = -1, lastT = 0; const lines: string[] = [];
    let tail = 0;
    while (tail < 8 / STEP) {
      if (race.finished) tail++;
      race.step(); const c = n.update(race, STEP);
      if (c.id !== last && c.text) {
        if (last !== -1 && !race.finished) minGap = Math.min(minGap, race.t - lastT);
        last = c.id; lastT = race.t; total++;
        lines.push(`${race.t.toFixed(1).padStart(6)}s  ${c.text}`);
      }
    }
    races++;
    if (i === 0) console.log(`\n=== ${name.toUpperCase()} ${d}m ===\n` + lines.join('\n'));
  }
}
console.log(`\nraces ${races}, calls/race ${(total / races).toFixed(1)}, shortest gap between calls during race ${minGap.toFixed(2)}s`);
