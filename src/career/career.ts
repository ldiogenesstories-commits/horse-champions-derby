// Career arc: a horse races 20 times, then retires with a ceremony, a rank,
// badges, and a collectible virtual card (unique code + QR) for the Hall of Fame.
import qrcode from 'qrcode-generator';
import type { HorseDef } from '../sim/types';
import { horseBodySVG, type Look } from '../game/horseBody';
import { riderSVG, silksBadge, type Jockey } from '../game/jockey';
import { cardUrl } from '../net/cloud';

export const CAREER_RACES = 20;

export interface CareerLog {
  eventWins: string[];
  horseshoe?: boolean;
  crowdGifts: number;
  distances: string[];
  bestPlace: number;
}
export const NEW_CAREER = (): CareerLog => ({ eventWins: [], crowdGifts: 0, distances: [], bestPlace: 99 });

export interface RetiredCard {
  code: string;
  horse: HorseDef;
  look: Look;
  record: { w: number; p: number; s: number };
  races: number;
  points: number;
  rank: string;
  badges: string[];
  trust: number;
  retiredOn: string; // ISO date
  jockey?: Jockey;
  /** Uploaded so other phones can scan it in. */
  published?: boolean;
  /** Scanned in from someone else's card (not raised in this stable). */
  guest?: boolean;
}

export function careerPoints(rec: { w: number; p: number; s: number }, log: CareerLog): number {
  return rec.w * 10 + rec.p * 6 + rec.s * 3 + log.eventWins.length * 12;
}

export function rankFor(points: number): string {
  if (points >= 150) return 'Legend';
  if (points >= 100) return 'Champion';
  if (points >= 60) return 'Star';
  if (points >= 25) return 'Contender';
  return 'Fan Favourite';
}

export function badgesFor(log: CareerLog, trust: number): string[] {
  const b: string[] = [];
  for (const e of [...new Set(log.eventWins)]) b.push(`${e} winner`);
  if (log.crowdGifts > 0) b.push('Crowd Favourite');
  if (new Set(log.distances).size >= 4) b.push('Ran every distance');
  if (trust >= 100) b.push('Best Friends');
  else if (trust >= 75) b.push('Trusted Partner');
  return b;
}

/** Short readable code, e.g. HCD-7KQ2-M9XA (no 0/O/1/I to avoid mix-ups). */
export function makeCode(): string {
  const A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  const ch = Array.from(buf, (n) => A[n % A.length]).join('');
  return `HCD-${ch.slice(0, 4)}-${ch.slice(4)}`;
}

export function qrSVG(text: string, px = 112): string {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#2B2118"/></svg>`;
}

/** What the QR carries: a link that opens the game on this card, on any phone. */
export function qrPayload(c: RetiredCard): string {
  return cardUrl(c.code);
}

const STAT_ROWS: [keyof HorseDef['stats'], string][] = [
  ['speed', 'SPD'], ['stamina', 'STA'], ['accel', 'ACC'], ['guts', 'GUT'], ['gate', 'GTE'], ['agility', 'AGI'],
];

export function cardHTML(c: RetiredCard): string {
  const s = c.horse.stats;
  const date = new Date(c.retiredOn).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return `<article class="hcard" style="--silk:${c.horse.color}">
    <header class="hcard-top"><span class="hcard-brand">Horse Champions Derby</span><span class="hcard-rank">${c.guest ? 'Guest · ' : ''}${c.rank}</span></header>
    <div class="hcard-art">${horseBodySVG(c.horse, c.look, { shine: true, rider: c.jockey ? riderSVG(c.jockey) : undefined })}</div>
    <h3 class="hcard-name">${c.horse.name}</h3>
    ${c.horse.sire ? `<div class="hcard-jockey">By ${c.horse.sire} out of ${c.horse.dam}${c.horse.generation ? ` · Gen ${c.horse.generation}` : ''}</div>` : ''}
    ${c.jockey ? `<div class="hcard-jockey">${silksBadge(c.jockey, 16)} Ridden by ${c.jockey.name}</div>` : ''}
    <div class="hcard-rec">${c.record.w}–${c.record.p}–${c.record.s} <small>in ${c.races} races · ${c.points} pts</small></div>
    <div class="hcard-stats">${STAT_ROWS.map(([k, l]) => `<div><span>${l}</span><b>${Math.round(s[k])}</b><i style="width:${Math.round(s[k])}%"></i></div>`).join('')}</div>
    ${c.badges.length ? `<ul class="hcard-badges">${c.badges.map((b) => `<li>${b}</li>`).join('')}</ul>` : ''}
    <footer class="hcard-foot"><div><b>${c.code}</b><small>Retired ${date}</small></div>${qrSVG(qrPayload(c), 76)}</footer>
  </article>`;
}
