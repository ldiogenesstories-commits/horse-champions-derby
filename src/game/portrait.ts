// Paper-cut horse bust, drawn from the horse's visible genetics (coat + face
// marking) and wearing a bridle in its silks color. Placeholder for the painted,
// layered portrait the final art will use; same inputs, so it swaps in cleanly.
import type { HorseDef } from '../sim/types';

export const COATS = {
  bay: { body: '#8A5A36', shade: '#6B4329', mane: '#2B2118' },
  chestnut: { body: '#B0602F', shade: '#8C4A22', mane: '#7A3A1A' },
  grey: { body: '#BDB7AD', shade: '#9C968C', mane: '#6E6A64' },
  black: { body: '#3A3431', shade: '#25211F', mane: '#141110' },
  palomino: { body: '#D9A85B', shade: '#B98A45', mane: '#F4E9D0' },
} as const;

export function portraitSVG(def: HorseDef, size = 96): string {
  const c = COATS[def.coat ?? 'bay'];
  const m = def.marking ?? 'none';
  const marking =
    m === 'blaze' ? '<polygon points="73,33 79,31 103,63 98,68" fill="#FFFBF2"/>'
    : m === 'star' ? '<polygon points="76,35 79,39 76,43 73,39" fill="#FFFBF2"/>'
    : m === 'snip' ? '<ellipse cx="103" cy="71" rx="3" ry="4" fill="#FFFBF2"/>'
    : '';
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="Portrait of ${def.name}">
  <circle cx="60" cy="60" r="58" fill="${def.color}"/>
  <circle cx="60" cy="60" r="58" fill="#FFFBF2" opacity="0.22"/>
  <g transform="translate(-4 8) scale(0.88)" style="filter: drop-shadow(2px 3px 0 rgba(43,33,24,.3))">
    <polygon points="22,140 38,72 50,44 60,30 57,13 68,25 78,29 104,61 109,70 104,79 88,81 78,77 70,80 66,98 78,140" fill="${c.body}"/>
    <polygon points="66,98 70,80 78,77 88,81 78,140" fill="${c.shade}"/>
    ${maneBust(def, c)}
    <polygon points="57,13 68,25 62,27" fill="${c.shade}"/>
    ${marking}
    <circle cx="76" cy="46" r="2.6" fill="#141110"/>
    <circle cx="76.8" cy="45.2" r="0.8" fill="#FFFBF2"/>
    <ellipse cx="101" cy="69" rx="1.6" ry="1.2" fill="#141110"/>
    <g stroke="#FFFBF2" stroke-width="4.5" fill="none" stroke-linecap="round"><path d="M68 38 L84 76"/><path d="M92 58 L86 80"/></g>
    <g stroke="${def.color}" stroke-width="3" fill="none" stroke-linecap="round"><path d="M68 38 L84 76"/><path d="M92 58 L86 80"/></g>
    ${extrasBust(def, c)}
  </g>
</svg>`;
}

// Crest of the neck in the bust, withers to poll; mane styles follow it.
const CREST: [number, number][] = [[35, 84], [40, 71], [45, 60], [50, 50], [55, 41], [59, 33]];

function maneBust(def: HorseDef, c: { mane: string; shade: string }): string {
  const style = def.look?.mane ?? 'loose';
  if (style === 'running') return CREST.map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="4.2" transform="rotate(-62 ${x} ${y})" fill="${i % 2 ? c.shade : c.mane}" stroke="#2B2118" stroke-width="1"/>`).join('');
  if (style === 'buttons') return CREST.map(([x, y]) => `<circle cx="${x - 1}" cy="${y}" r="4.3" fill="${c.mane}" stroke="#2B2118" stroke-width="1"/>`).join('');
  if (style === 'locs') return CREST.map(([x, y], i) => `<path d="M${x} ${y} q-7 ${10 - i} -5 ${20 - i * 1.5}" stroke="#2B2118" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M${x} ${y} q-7 ${10 - i} -5 ${20 - i * 1.5}" stroke="${i % 2 ? c.shade : c.mane}" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="3 1.5"/>`).join('');
  return `<polygon points="38,72 50,44 60,30 62,36 52,50 44,76 32,104" fill="${c.mane}"/>`;
}

function extrasBust(def: HorseDef, c: { mane: string; shade: string }): string {
  const l = def.look;
  if (!l) return '';
  let out = '';
  out += l.forelock === 'braid'
    ? [[64, 27], [66, 32], [68, 37]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="3.6" fill="${i % 2 ? c.shade : c.mane}" stroke="#2B2118" stroke-width="0.8"/>`).join('')
    : `<path d="M60 23 L68 25 L72 38 L67 35 L64 40 Z" fill="${c.mane}"/>`;
  if (l.crown) {
    out += [[50, 24, '#F7A8B8'], [57, 16, '#FFD23F'], [65, 15, '#FFFBF2'], [73, 21, '#F7A8B8'], [45, 32, '#9CC3D5']]
      .map(([x, y, col]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((r) => `<ellipse cy="-3.2" rx="2.4" ry="3.2" transform="rotate(${r})" fill="${col}" stroke="#2B2118" stroke-width="0.6"/>`).join('')}<circle r="1.7" fill="#E2A93B"/></g>`).join('');
  }
  if (l.bow === 'mane' || l.bow === 'both') {
    const bc = l.bowColor || def.color;
    out += `<g transform="translate(52 30) rotate(-20)"><polygon points="0,0 -10,-7 -10,7" fill="${bc}" stroke="#2B2118" stroke-width="1.5"/><polygon points="0,0 10,-7 10,7" fill="${bc}" stroke="#2B2118" stroke-width="1.5"/><circle r="3.5" fill="${bc}" stroke="#2B2118" stroke-width="1.5"/></g>`;
  }
  return out;
}
