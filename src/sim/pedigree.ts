// Family trees and bloodlines. A foal remembers its ancestors three generations
// back (parents, grandparents, great-grandparents). Champion ancestors nudge the
// foal's hidden peaks, and a Champion sire founds a named bloodline.
import type { HorseDef } from './types';
import { STAT_KEYS, type StatKey } from './growth';

/** One ancestor in a family tree. */
export interface Ped {
  name: string;
  coat?: HorseDef['coat'];
  rank?: string;
  /** Their best stat, the one they pass on through lineage bonuses. */
  best?: StatKey;
  sire?: Ped;
  dam?: Ped;
}
export interface Pedigree { sire?: Ped; dam?: Ped }
export interface Line { name: string; stat: StatKey }

export const isChampionRank = (r?: string): boolean => r === 'Champion' || r === 'Legend';

export function bestStatOf(h: HorseDef): StatKey {
  return [...STAT_KEYS].sort((p, q) => h.stats[q] - h.stats[p])[0];
}

function trim(p: Ped, depth: number): Ped {
  const out: Ped = { name: p.name, coat: p.coat, rank: p.rank, best: p.best };
  if (depth > 1 && p.sire) out.sire = trim(p.sire, depth - 1);
  if (depth > 1 && p.dam) out.dam = trim(p.dam, depth - 1);
  return out;
}

/** A horse as an ancestor, carrying its own parents and grandparents (3 generations in all). */
export function nodeOf(h: HorseDef, rank?: string): Ped {
  return trim({ name: h.name, coat: h.coat, rank, best: bestStatOf(h), sire: h.pedigree?.sire, dam: h.pedigree?.dam }, 3);
}

/** The foal's family tree from its two parents, sire on the sire side. */
export function pedigreeOf(sire: HorseDef, sireRank: string | undefined, dam: HorseDef, damRank: string | undefined): Pedigree {
  return { sire: nodeOf(sire, sireRank), dam: nodeOf(dam, damRank) };
}

/** The bloodline a foal belongs to: its sire's line, or a new line if the sire is a Champion. */
export function lineOf(sire: HorseDef, sireRank?: string): Line | undefined {
  if (sire.line) return sire.line;
  return isChampionRank(sireRank) ? { name: sire.name, stat: bestStatOf(sire) } : undefined;
}

export interface LineageBonus { bonus: Partial<Record<StatKey, number>>; notes: string[] }
const MAX_LINEAGE_BONUS = 5;

/**
 * Peak bonuses from champion ancestors. Grandparents lift their best stat's peak by 2
 * (Legend 3); great-grandparents by 1 (Legend 2); the bloodline adds 1. Max +5 per stat.
 * Parents aren't counted here: their stats already pass down directly.
 */
export function lineageBonus(a: HorseDef, b: HorseDef, line?: Line): LineageBonus {
  const bonus: Partial<Record<StatKey, number>> = {};
  const notes: string[] = [];
  const add = (k: StatKey, n: number, note: string) => {
    const room = MAX_LINEAGE_BONUS - (bonus[k] ?? 0);
    if (room <= 0) return;
    bonus[k] = (bonus[k] ?? 0) + Math.min(n, room);
    notes.push(note);
  };
  const walk = (p: Ped | undefined, depth: number): void => {
    if (!p || depth > 3) return;
    if (isChampionRank(p.rank) && p.best) {
      const legend = p.rank === 'Legend';
      add(p.best, depth === 2 ? (legend ? 3 : 2) : legend ? 2 : 1, `${p.name} (${depth === 2 ? 'grand' : 'great-grand'}parent, ${p.rank})`);
    }
    walk(p.sire, depth + 1);
    walk(p.dam, depth + 1);
  };
  for (const h of [a, b]) { walk(h.pedigree?.sire, 2); walk(h.pedigree?.dam, 2); }
  if (line) add(line.stat, 1, `${line.name} bloodline`);
  return { bonus, notes };
}
