// Headless breeding check: genetics, star traits, premier partner, limits.
import { makeRng } from '../src/sim/rng';
import { visitingPartners, breedFoal, coatChances, homeFoalsLeft, HOME_FOAL_LIMIT } from '../src/career/breeding';
import { coatOdds, genesOf, visibleCoat } from '../src/sim/genetics';
import type { HorseDef } from '../src/sim/types';

let failed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failed++; };

const base = (name: string, coat: HorseDef['coat'], genes?: HorseDef['genes']): HorseDef => ({
  id: name, number: 0, name, color: '#888', stats: { speed: 70, stamina: 70, accel: 70, guts: 70, gate: 70, agility: 70 },
  style: 'mid', fire: 0.5, boldness: 60, need: 'social', coat, marking: 'none', sex: 'mare', genes,
});

// Visible coat rules
check(visibleCoat(['bay', 'chestnut']) === 'bay', 'bay is stronger than chestnut');
check(visibleCoat(['grey', 'bay']) === 'grey', 'grey is dominant');
check(visibleCoat(['dapple', 'bay']) === 'bay', 'one dapple gene hides (carrier)');
check(visibleCoat(['dapple', 'dapple']) === 'dapple', 'two dapple genes show dapple');
check(visibleCoat(['palomino', 'palomino']) === 'palomino', 'two palomino genes show palomino');

// Odds: two bay carriers of chestnut -> 75% bay, 25% chestnut
const carrier = base('A', 'bay', { coat: ['bay', 'chestnut'], marking: ['none', 'none'] });
const odds = coatOdds(carrier, { ...carrier, name: 'B' });
const sum = odds.reduce((t, o) => t + o.p, 0);
check(Math.abs(sum - 1) < 1e-9, 'coat odds sum to 100%');
check(Math.abs((odds.find((o) => o.coat === 'chestnut')?.p ?? 0) - 0.25) < 1e-9, 'two chestnut carriers give 25% chestnut (recessive skips a generation)');
check(coatChances(carrier, carrier).length === 2, 'coatChances matches odds');

// Empirical: 20000 foals from the two carriers
let chestnut = 0, rare = 0;
const N = 20000;
for (let i = 0; i < N; i++) {
  const f = breedFoal(carrier, { ...carrier, name: 'B' }, 'F', 1000 + i);
  if (f.coat === 'chestnut') chestnut++;
  if (f.coat === 'dapple' || f.coat === 'roan') rare++;
  if (!f.genes) { check(false, 'foal has genes'); break; }
}
check(Math.abs(chestnut / N - 0.25) < 0.02, `empirical chestnut ~25% (got ${(100 * chestnut / N).toFixed(1)}%)`);
check(rare / N > 0.005 && rare / N < 0.05, `rare coats are rare (got ${(100 * rare / N).toFixed(2)}% showing; needs dapple pairs or roan)`);

// Foal genes round-trip
const foal = breedFoal(carrier, { ...carrier, name: 'B' }, 'F', 7);
check(visibleCoat(genesOf(foal).coat) === foal.coat, 'foal shows what its genes say');

// Premier partner
let noStar = 0, two = 0, std = 0, stdTwo = 0;
for (let i = 0; i < 4000; i++) {
  const parts = visitingPartners(i, 'stallion');
  check(parts.length === 4 && parts.filter((p) => p.premier).length === 1 && parts[3].premier === true, '') ;
  const mare = base('M', 'bay');
  const f = breedFoal(mare, parts[3].horse, 'F', 90000 + i, true);
  const n = f.sparks?.length ?? 0;
  if (n === 0) noStar++; if (n === 2) two++;
  const g = breedFoal(mare, parts[0].horse, 'F', 90000 + i, false);
  const m = g.sparks?.length ?? 0;
  if (m >= 1) std++; if (m === 2) stdTwo++;
}
check(noStar === 0, `premier foals always get at least 1 star (misses: ${noStar})`);
check(Math.abs(two / 4000 - 0.25) < 0.04, `premier second star ~25% (got ${(100 * two / 4000).toFixed(1)}%)`);
check(Math.abs(std / 4000 - 0.10) < 0.03, `standard star ~10% (got ${(100 * std / 4000).toFixed(1)}%)`);
const p0 = visitingPartners(5, 'mare');
check(!!p0[3].horse.sparks?.length && p0[3].cost! > 0, 'premier partner carries star traits and a price');
check(p0.slice(0, 3).every((p) => !p.premier && p.cost === undefined), 'first three visitors are free');

// Foal inherits the premier partner's star
let inherit = 0;
for (let i = 0; i < 500; i++) {
  const part = visitingPartners(i, 'stallion')[3];
  const f = breedFoal(base('M', 'bay'), part.horse, 'F', i, true);
  if (part.horse.sparks!.some((k) => f.sparks!.includes(k))) inherit++;
}
check(inherit === 500, `premier foal always inherits the partner's star (${inherit}/500)`);

// Limits
const h = base('H', 'bay');
check(homeFoalsLeft(h) === HOME_FOAL_LIMIT, 'new horse has 3 foals left');
h.foals = 3;
check(homeFoalsLeft(h) === 0, 'at 3 foals, none left');

// Foals don't carry their parents' foal count
check(breedFoal({ ...base('P', 'bay'), foals: 3 }, base('Q', 'bay'), 'F', 1).foals === undefined, 'foal starts with 0 foals used');

// Determinism
const a1 = JSON.stringify(breedFoal(carrier, carrier, 'F', 42));
const a2 = JSON.stringify(breedFoal(carrier, carrier, 'F', 42));
check(a1 === a2, 'same seed gives the same foal');
void makeRng;

// ---- Phase 2: pedigree and bloodlines ----
import { lineageBonus, lineOf } from '../src/sim/pedigree';
const stallion = (n: string, coat: HorseDef['coat'] = 'bay'): HorseDef => ({ ...base(n, coat), sex: 'stallion' });
const mare = (n: string): HorseDef => ({ ...base(n, 'bay'), sex: 'mare' });
const sire1 = stallion('Gale Runner'); sire1.stats.stamina = 90;
const dam1 = mare('Velvet Sparrow');
const f1 = breedFoal(sire1, dam1, 'Gen2', 11, false, { a: 'Champion', b: 'Contender' });
check(f1.pedigree?.sire?.name === 'Gale Runner' && f1.pedigree?.dam?.name === 'Velvet Sparrow', 'foal records its parents');
check(f1.line?.name === 'Gale Runner' && f1.line.stat === 'stamina', 'Champion sire founds a bloodline on its best stat');
check(f1.sire === 'Gale Runner' && f1.dam === 'Velvet Sparrow', 'sire/dam names still set for cards');

const f1b = breedFoal(stallion('Plain Joe'), dam1, 'NoLine', 12, false, { a: 'Contender' });
check(f1b.line === undefined, 'non-champion sire founds no bloodline');

// Grow three generations and check depth is capped at great-grandparents
let cur: HorseDef = { ...f1, sex: 'stallion' };
const mates = [mare('M2'), mare('M3'), mare('M4'), mare('M5')];
for (const m of mates) cur = { ...breedFoal(cur, m, 'Next', 21, false, { a: 'Contender' }), sex: 'stallion' };
const depth = (p: import('../src/sim/pedigree').Ped | undefined): number => (p ? 1 + Math.max(depth(p.sire), depth(p.dam)) : 0);
check(Math.max(depth(cur.pedigree?.sire), depth(cur.pedigree?.dam)) === 3, 'tree stops at great-grandparents (3 generations)');
check(cur.line?.name === 'Gale Runner', 'bloodline passes down the sire line');
check(JSON.stringify(cur).length < 6000, `horse record stays small (${JSON.stringify(cur).length} bytes)`);

// Lineage bonus: Champion grandsire lifts stamina peak; capped at +5; none without champions
const champSire = stallion('Old Champ'); champSire.stats.stamina = 95;
const gen2 = { ...breedFoal(champSire, mare('Gran'), 'Mid', 31, false, { a: 'Champion' }), sex: 'stallion' as const };
const lb = lineageBonus(gen2, mare('Other'), undefined);
check((lb.bonus.stamina ?? 0) === 2 && lb.notes.length === 1, 'Champion grandsire gives +2 to its best stat');
const legend = { ...breedFoal({ ...stallion('Legend X'), stats: { ...base('x', 'bay').stats, speed: 97 } }, mare('G2'), 'Mid2', 32, false, { a: 'Legend' }), sex: 'stallion' as const };
check((lineageBonus(legend, mare('Other')).bonus.speed ?? 0) === 3, 'Legend grandsire gives +3');
check(Object.keys(lineageBonus(base('a', 'bay'), base('b', 'bay')).bonus).length === 0, 'no champions, no bonus');

// Bonus actually lifts foal peaks on average
let withB = 0, without = 0;
for (let i = 0; i < 400; i++) {
  withB += breedFoal(gen2, mare('Other'), 'F', 5000 + i).potential!.stamina;
  without += breedFoal({ ...gen2, pedigree: undefined, line: undefined }, mare('Other'), 'F', 5000 + i).potential!.stamina;
}
check(withB / 400 > without / 400 + 1, `lineage lifts average stamina peak (${(withB / 400).toFixed(1)} vs ${(without / 400).toFixed(1)})`);
check(lineOf(stallion('S', 'bay'), 'Champion')?.name === 'S', 'lineOf founds a line from a Champion');

console.log(failed ? `\n${failed} FAILED` : '\nAll breeding checks passed');
process.exit(failed ? 1 : 0);
