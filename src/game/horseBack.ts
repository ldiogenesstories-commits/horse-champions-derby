// Rear view of the paper horse (walking away from the camera) for the ranch.
// Same inputs as the other views: coat, tail style, bows, wraps, polish, saddle pad.
// `pose` (0–1) walks the hind legs and bobs the body.
import type { HorseDef } from '../sim/types';
import type { Look } from './horseBody';
import { COATS } from './portrait';

const INK = '#2B2118';

function hind(x: number, lift: number, coat: string, hoof: string, wrap: string | null, dir: number): string {
  const top = 176;
  const hock = 214 - lift * 10;
  const foot = 252 - lift * 34;
  const kx = x + dir * 3;
  return `<path d="M${x - 13} ${top} L${x + 13} ${top} L${kx + 8} ${hock} L${kx + 6} ${foot} L${kx - 6} ${foot} L${kx - 8} ${hock} Z" fill="${coat}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    ${wrap ? `<rect x="${kx - 7}" y="${foot - 22}" width="14" height="14" rx="3" fill="${wrap}" stroke="${INK}" stroke-width="1.5"/>` : ''}
    <ellipse cx="${kx}" cy="${foot + 2}" rx="9" ry="${4 + lift * 2}" fill="${hoof}" stroke="${INK}" stroke-width="2"/>`;
}

export function horseBackSVG(def: HorseDef, look: Look, pose: number): string {
  const c = COATS[def.coat ?? 'bay'];
  const silk = def.color;
  const bowC = look.bowColor || silk;
  const ph = Math.sin(2 * Math.PI * pose);
  const lA = Math.max(0, ph);
  const lB = Math.max(0, -ph);
  const bob = -4 * Math.abs(ph);
  const sway = ph * 3;
  const hoof = look.polish ? '#FFD23F' : '#3B2A1E';
  const wrap = look.wraps ? silk : null;
  const t = look.tail;
  const tail = t === 'bun'
    ? `<circle cx="100" cy="112" r="13" fill="${c.mane}" stroke="${INK}" stroke-width="2"/>`
    : t === 'braid'
      ? [0, 1, 2, 3, 4, 5].map((i) => `<ellipse cx="${100 + Math.sin(i + pose * 6) * 2}" cy="${112 + i * 13}" rx="7" ry="8" fill="${i % 2 ? c.shade : c.mane}" stroke="${INK}" stroke-width="1.2"/>`).join('')
      : `<path d="M92 106 Q86 150 ${90 + sway} 196 Q100 208 ${110 + sway} 196 Q114 150 108 106 Z" fill="${c.mane}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
  const tailBow = look.bow === 'tail' || look.bow === 'both'
    ? `<g transform="translate(100 108)"><polygon points="0,0 -11,-7 -11,7" fill="${bowC}" stroke="${INK}" stroke-width="1.6"/><polygon points="0,0 11,-7 11,7" fill="${bowC}" stroke="${INK}" stroke-width="1.6"/><circle r="3.5" fill="${bowC}" stroke="${INK}" stroke-width="1.6"/></g>` : '';
  const maneBow = look.bow === 'mane' || look.bow === 'both'
    ? `<g transform="translate(118 40)"><polygon points="0,0 -9,-6 -9,6" fill="${bowC}" stroke="${INK}" stroke-width="1.5"/><polygon points="0,0 9,-6 9,6" fill="${bowC}" stroke="${INK}" stroke-width="1.5"/><circle r="3" fill="${bowC}" stroke="${INK}" stroke-width="1.5"/></g>` : '';
  const crown = look.crown ? ['#F7A8B8', '#FFD23F', '#FFFBF2'].map((col, i) => `<circle cx="${88 + i * 12}" cy="${26 - (i === 1 ? 3 : 0)}" r="5" fill="${col}" stroke="${INK}" stroke-width="1.2"/>`).join('') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 270">
  <ellipse cx="100" cy="258" rx="54" ry="9" fill="rgba(43,33,24,.22)"/>
  <g transform="translate(0 ${bob})">
    <!-- front hooves peeking out ahead -->
    <ellipse cx="78" cy="${242 + lA * 3}" rx="8" ry="4" fill="${hoof}" stroke="${INK}" stroke-width="1.5"/>
    <ellipse cx="122" cy="${242 + lB * 3}" rx="8" ry="4" fill="${hoof}" stroke="${INK}" stroke-width="1.5"/>
    <!-- neck and head, seen from behind -->
    <path d="M84 96 L88 46 Q100 34 112 46 L116 96 Z" fill="${c.body}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="88,46 84,20 98,38" fill="${c.body}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <polygon points="112,46 116,20 102,38" fill="${c.body}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M96 40 L104 40 L106 96 L94 96 Z" fill="${c.mane}"/>
    ${crown}${maneBow}
    ${hind(78, lA, c.body, hoof, wrap, -1)}${hind(122, lB, c.body, hoof, wrap, 1)}
    <!-- back and rump -->
    <ellipse cx="100" cy="128" rx="52" ry="40" fill="${c.body}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M52 118 Q100 70 148 118" fill="${c.shade}" opacity="0.5"/>
    ${look.pad ? `<path d="M58 100 Q100 78 142 100 L140 90 Q100 70 60 90 Z" fill="${silk}" stroke="${INK}" stroke-width="1.5"/>` : ''}
    <path d="M100 96 V156" stroke="${c.shade}" stroke-width="3"/>
    ${tail}${tailBow}
  </g>
</svg>`;
}
