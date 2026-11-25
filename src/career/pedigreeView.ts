// Family-tree view: a horse, its parents, grandparents and great-grandparents.
import type { HorseDef } from '../sim/types';
import { isChampionRank, type Ped } from '../sim/pedigree';
import { COATS } from '../game/portrait';

const esc = (t: string) => t.replace(/[<>&"]/g, '');
const STAT_SHORT: Record<string, string> = { speed: 'Speed', stamina: 'Stamina', accel: 'Accel', guts: 'Guts', gate: 'Gate', agility: 'Agility' };

function cell(p: Ped | undefined, role: string): string {
  if (!p) return `<div class="ped-cell empty"><small>${role}</small><b>Unknown</b></div>`;
  const body = COATS[p.coat ?? 'bay']?.body ?? '#8A5A36';
  const star = isChampionRank(p.rank);
  return `<div class="ped-cell${star ? ' champ' : ''}" style="--coat:${body}"><i class="ped-dot"></i><small>${role}</small><b>${esc(p.name)}</b>${star ? `<em>★ ${p.rank}${p.best ? ` · ${STAT_SHORT[p.best]}` : ''}</em>` : ''}</div>`;
}

/** A 4-column tree: horse | parents | grandparents | great-grandparents. */
export function pedigreeHTML(h: HorseDef, rank?: string): string {
  const s = h.pedigree?.sire;
  const d = h.pedigree?.dam;
  const col = (cells: string[], cls: string) => `<div class="ped-col ${cls}">${cells.join('')}</div>`;
  const self = `<div class="ped-cell self"><small>${rank ? esc(rank) : 'This horse'}</small><b>${esc(h.name)}</b>${h.generation ? `<em>Gen ${h.generation}</em>` : ''}</div>`;
  const grand = [s?.sire, s?.dam, d?.sire, d?.dam];
  const great = [s?.sire?.sire, s?.sire?.dam, s?.dam?.sire, s?.dam?.dam, d?.sire?.sire, d?.sire?.dam, d?.dam?.sire, d?.dam?.dam];
  const roles = (n: number, a: string, b: string) => Array.from({ length: n }, (_, i) => (i % 2 ? b : a));
  const line = h.line ? `<div class="ped-line">The ${esc(h.line.name)} bloodline · ${STAT_SHORT[h.line.stat]}</div>` : '';
  const empty = !s && !d ? '<p class="muted ped-note">A founding horse: no family tree yet. Its foals will start one.</p>' : '';
  return `${line}<div class="ped-tree">${col([self], 'c0')}${col([cell(s, 'Sire'), cell(d, 'Dam')], 'c1')}${col(grand.map((p, i) => cell(p, ['Grandsire', 'Granddam'][i % 2])), 'c2')}${col(great.map((p, i) => cell(p, roles(8, 'Sire', 'Dam')[i])), 'c3')}</div>${empty}`;
}

/** Full-screen overlay with the tree and a close button. */
export function showPedigree(h: HorseDef, rank?: string): void {
  const wrap = document.createElement('div');
  wrap.className = 'ped-overlay';
  wrap.innerHTML = `<div class="ped-box"><button class="ghost small" id="ped-close">Close</button><div class="eyebrow">Family tree</div><h2>${esc(h.name)}</h2>${pedigreeHTML(h, rank)}</div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap || (e.target as HTMLElement).id === 'ped-close') wrap.remove(); });
  document.body.appendChild(wrap);
}
