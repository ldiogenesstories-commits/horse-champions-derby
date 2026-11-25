// Full-body paper-cut horse (side view, facing right) built in layers so
// grooming choices show up: mane, forelock and tail styles, bows, and extras.
// Same genetics inputs as the portrait (coat + face marking + silks color).
import type { HorseDef } from '../sim/types';
import { COATS } from './portrait';

export type ManeStyle = 'loose' | 'running' | 'buttons' | 'locs';
export type TailStyle = 'loose' | 'braid' | 'bun';
export type ForelockStyle = 'loose' | 'braid';
export type BowSpot = 'none' | 'mane' | 'tail' | 'both';
export interface Look {
  mane: ManeStyle;
  tail: TailStyle;
  forelock: ForelockStyle;
  bow: BowSpot;
  bowColor: string;
  pad: boolean;
  wraps: boolean;
  crown: boolean;
  polish: boolean;
  /** Saddle pad colour from the Shop; empty = racing colour. */
  padColor?: string;
}
export const DEFAULT_LOOK: Look = { mane: 'loose', tail: 'loose', forelock: 'loose', bow: 'none', bowColor: '', pad: false, wraps: false, crown: false, polish: false };

// Crest line of the neck, from withers to poll; mane styles follow it.
const CREST: [number, number][] = [[236, 104], [246, 90], [256, 76], [266, 63], [276, 51], [285, 41]];

function bow(x: number, y: number, color: string, s = 1): string {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <polygon points="0,0 -13,-9 -13,9" fill="${color}" stroke="#2B2118" stroke-width="2" stroke-linejoin="round"/>
    <polygon points="0,0 13,-9 13,9" fill="${color}" stroke="#2B2118" stroke-width="2" stroke-linejoin="round"/>
    <polygon points="-2,2 -7,16 -2,13" fill="${color}" stroke="#2B2118" stroke-width="1.5"/>
    <polygon points="2,2 7,16 2,13" fill="${color}" stroke="#2B2118" stroke-width="1.5"/>
    <circle r="4.5" fill="${color}" stroke="#2B2118" stroke-width="2"/></g>`;
}

function mane(style: ManeStyle, hair: string, shade: string): string {
  if (style === 'loose') {
    return `<path d="M232 110 L238 96 L250 80 L262 64 L274 50 L286 38 L292 44 L280 60 L276 74 L266 72 L262 88 L252 86 L248 102 L240 100 L238 116 Z" fill="${hair}"/>`;
  }
  if (style === 'running') {
    // French braid hugging the crest: overlapping plaits.
    return CREST.concat([[289, 37]]).map(([x, y], i) => `<ellipse cx="${x - 3}" cy="${y + 3}" rx="8" ry="5.5" transform="rotate(${-52} ${x - 3} ${y + 3})" fill="${i % 2 ? shade : hair}" stroke="#2B2118" stroke-width="1.2"/>`).join('');
  }
  if (style === 'buttons') {
    // Hunter button braids: neat balls along the crest.
    return CREST.map(([x, y]) => `<circle cx="${x - 4}" cy="${y + 2}" r="5.5" fill="${hair}" stroke="#2B2118" stroke-width="1.4"/><circle cx="${x - 5.5}" cy="${y + 0.5}" r="1.6" fill="#FFFBF2" opacity="0.35"/>`).join('');
  }
  // Locs: rope-like strands falling from the crest.
  return CREST.map(([x, y], i) => {
    const len = 30 - i * 2;
    return `<path d="M${x - 2} ${y} q-8 ${len * 0.5} -4 ${len}" stroke="#2B2118" stroke-width="7.5" fill="none" stroke-linecap="round"/>
      <path d="M${x - 2} ${y} q-8 ${len * 0.5} -4 ${len}" stroke="${i % 2 ? shade : hair}" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="4 2"/>`;
  }).join('');
}

function tail(style: TailStyle, hair: string, shade: string): string {
  if (style === 'loose') {
    return `<path d="M98 120 C72 126 58 168 62 236 C70 240 76 232 78 222 C80 200 82 176 86 158 C90 144 96 136 104 132 Z" fill="${hair}"/>
      <path d="M90 140 C78 160 72 190 72 224" stroke="${shade}" stroke-width="3" fill="none"/>`;
  }
  if (style === 'braid') {
    const pts: [number, number][] = [];
    for (let i = 0; i < 9; i++) pts.push([96 - i * 2.2 - i * i * 0.12, 128 + i * 10.5]);
    return pts.map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="6.5" ry="7" transform="rotate(${i % 2 ? 25 : -25} ${x} ${y})" fill="${i % 2 ? shade : hair}" stroke="#2B2118" stroke-width="1.2"/>`).join('')
      + `<path d="M72 216 C64 226 66 238 70 244 C76 238 84 236 86 226 C84 220 78 216 72 216 Z" fill="${hair}"/>`;
  }
  // Mud knot / bun: tucked-up tail.
  return `<path d="M100 122 C94 126 92 132 92 138" stroke="${hair}" stroke-width="12" fill="none" stroke-linecap="round"/>
    <ellipse cx="92" cy="146" rx="11" ry="12" fill="${hair}" stroke="#2B2118" stroke-width="1.5"/>
    <path d="M84 144 C88 138 96 139 99 146" stroke="${shade}" stroke-width="2.5" fill="none"/>
    <path d="M94 158 C92 166 88 170 84 172 C90 172 96 168 98 160" fill="${hair}"/>`;
}

export function horseBodySVG(def: HorseDef, look: Look, opts: { shine?: boolean; dust?: { x: number; y: number }[]; picked?: boolean[]; rider?: string; pose?: number; graze?: boolean; lie?: boolean } = {}): string {
  const c = COATS[def.coat ?? 'bay'];
  const hair = c.mane;
  const shade = c.shade;
  const silk = def.color;
  const bowC = look.bowColor || silk;
  const m = def.marking ?? 'none';
  const face = m === 'blaze' ? '<polygon points="300,36 306,34 334,74 328,80" fill="#FFFBF2"/>'
    : m === 'star' ? '<polygon points="303,40 306,45 303,50 300,45" fill="#FFFBF2"/>'
    : m === 'snip' ? '<ellipse cx="333" cy="80" rx="3" ry="4" fill="#FFFBF2"/>' : '';
  const hoof = look.polish ? '#2B2118' : '#4A3B2C';
  const LEGS = [[262, 276], [236, 252], [116, 130], [90, 104]];
  const hoofOf = (i: number) => { const [a, b] = LEGS[i]; return `<polygon class="hoof" data-i="${i}" points="${a - 1},256 ${b + 1},256 ${b + 3},266 ${a - 3},266" fill="${opts.picked?.[i] ? '#5FB36F' : hoof}"/>${look.polish ? `<rect x="${a + 1}" y="258" width="4" height="5" fill="#FFFBF2" opacity="0.55"/>` : ''}`; };
  const wrapOf = (i: number) => { if (!look.wraps) return ''; const [a, b] = LEGS[i]; return `<rect x="${a - 2}" y="228" width="${b - a + 4}" height="24" rx="3" fill="${silk}" stroke="#2B2118" stroke-width="1.5"/><path d="M${a - 2} 236 H${b + 2} M${a - 2} 244 H${b + 2}" stroke="#FFFBF2" stroke-width="1.5" opacity="0.6"/>`; };
  // Legs (index matches LEGS: near front, far front, near hind, far hind). Each swings
  // from its hip like a paper puppet when a gallop pose (0..1 through the stride) is given.
  const LEG_SHAPE = ['258,170 276,170 278,256 262,256', '236,170 252,170 252,256 236,256',
    '122,158 146,166 132,214 130,256 116,256 118,212', '102,158 124,164 106,214 104,256 90,256 92,212'];
  const HIP: [number, number][] = [[267, 172], [244, 172], [134, 164], [113, 162]];
  const PHASE = [0, 0.14, 0.5, 0.64];
  const SWING = [26, 24, 22, 20];
  const angle = (i: number) => (opts.pose === undefined ? 0 : -SWING[i] * Math.sin(2 * Math.PI * (opts.pose + PHASE[i])));
  const leg = (i: number) => `<g transform="rotate(${angle(i).toFixed(1)} ${HIP[i][0]} ${HIP[i][1]})"><polygon points="${LEG_SHAPE[i]}" fill="${i % 2 ? shade : c.body}"/>${wrapOf(i)}${hoofOf(i)}</g>`;
  const bob = opts.pose === undefined ? 0 : -5 * Math.abs(Math.sin(2 * Math.PI * opts.pose));
  const pad = look.pad ? `<path d="M168 104 C188 100 212 100 230 104 L236 150 C210 156 186 156 162 150 Z" fill="${look.padColor || silk}" stroke="#2B2118" stroke-width="2"/>
    <path d="M172 110 C190 106 210 106 226 110 L230 144 C208 148 188 148 168 144 Z" fill="none" stroke="#FFFBF2" stroke-width="2.5" stroke-dasharray="5 3"/>` : '';
  const crown = look.crown ? [[278, 40, '#F7A8B8'], [286, 30, '#FFD23F'], [295, 26, '#FFFBF2'], [304, 30, '#F7A8B8'], [282, 50, '#9CC3D5']]
    .map(([x, y, col]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="0" cy="-4.2" rx="3" ry="4.2" transform="rotate(${r})" fill="${col}" stroke="#2B2118" stroke-width="0.8"/>`).join('')}<circle r="2.2" fill="#E2A93B"/></g>`).join('')
    + '<path d="M272 52 C280 40 292 26 310 30" stroke="#3E6B48" stroke-width="2.5" fill="none"/>' : '';
  const forelock = look.forelock === 'loose'
    ? `<path d="M292 30 L300 30 L308 48 L302 52 L298 42 L294 50 Z" fill="${hair}"/>`
    : [[296, 33], [299, 40], [302, 47]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="4" ry="5" fill="${i % 2 ? shade : hair}" stroke="#2B2118" stroke-width="1"/>`).join('');
  const maneBow = look.bow === 'mane' || look.bow === 'both' ? bow(286, 40, bowC, 0.9) : '';
  const tailBow = look.bow === 'tail' || look.bow === 'both' ? bow(98, look.tail === 'bun' ? 128 : 126, bowC, 0.9) : '';
  // Grazing: the neck and head swing down to the grass.
  const headT = opts.graze ? 'translate(4 66) rotate(84 252 120)' : opts.lie ? 'translate(6 18) rotate(30 252 120)' : '';
  const lie = !!opts.lie;
  // Lying down: legs folded under the body instead of standing.
  const folded = `<path d="M232 172 C250 190 292 192 300 178 C304 170 296 166 286 170 C270 176 252 172 240 164 Z" fill="${shade}"/>
    <path d="M236 176 C258 196 306 198 318 184 C322 176 312 172 300 176 C280 182 258 178 244 168 Z" fill="${c.body}"/>
    <ellipse cx="318" cy="182" rx="8" ry="6" fill="${hoof}"/>
    <path d="M100 160 C96 186 150 196 176 186 C186 182 180 172 168 176 C146 182 124 176 118 156 Z" fill="${c.body}"/>
    <ellipse cx="178" cy="184" rx="8" ry="6" fill="${hoof}"/>`;
  const shine = opts.shine ? `<path d="M120 116 C150 106 190 108 214 112" stroke="#FFFBF2" stroke-width="5" fill="none" opacity="0.45" stroke-linecap="round"/>
    <path d="M250 112 C262 96 272 80 280 64" stroke="#FFFBF2" stroke-width="3" fill="none" opacity="0.35" stroke-linecap="round"/>
    <path d="M134 164 C160 172 200 172 232 166" stroke="#FFFBF2" stroke-width="3" fill="none" opacity="0.25" stroke-linecap="round"/>` : '';
  const dust = (opts.dust ?? []).map((d, i) => `<g class="dust" data-i="${i}"><circle cx="${d.x}" cy="${d.y}" r="13" fill="#A98F6E" opacity="0.75"/><circle cx="${d.x + 6}" cy="${d.y - 5}" r="6" fill="#A98F6E" opacity="0.7"/><circle cx="${d.x - 7}" cy="${d.y + 5}" r="5" fill="#8C7556" opacity="0.6"/></g>`).join('');

  return `<svg viewBox="40 0 320 290" class="horse-body" role="img" aria-label="${def.name}, full body">
  <ellipse cx="190" cy="268" rx="130" ry="10" fill="#2B2118" opacity="0.18"/>
  <g style="filter: drop-shadow(2px 3px 0 rgba(43,33,24,.28))" transform="translate(0 ${lie ? 66 : bob.toFixed(1)})">
    <!-- far legs -->
    ${lie ? '' : leg(1) + leg(3)}
    ${look.tail === 'bun' ? '' : tail(look.tail, hair, shade)}
    <!-- body, neck, head -->
    <path d="M92 132 C92 106 130 98 170 104 C205 108 226 104 240 102 L284 128 C292 160 280 182 252 186 L132 188 C106 188 90 166 92 132 Z" fill="${c.body}"/>
    <g transform="${headT}">
    <path d="M236 104 L282 42 L300 32 L336 72 L340 84 L332 94 L316 94 L298 82 L294 130 L284 136 Z" fill="${c.body}"/>
    <polygon points="290,36 292,12 302,30" fill="${c.body}"/><polygon points="292,30 293,18 298,30" fill="${shade}"/>
    </g>
    <path d="M132 188 C150 192 220 192 252 186 L250 180 C220 184 160 184 132 182 Z" fill="${shade}"/>
    <g transform="${headT}">${face}
    ${lie ? '<path d="M301 52 q5 4 10 0" stroke="#141110" stroke-width="2.2" fill="none" stroke-linecap="round"/>' : '<circle cx="306" cy="52" r="3" fill="#141110"/><circle cx="307" cy="51" r="1" fill="#FFFBF2"/>'}
    <ellipse cx="333" cy="82" rx="2" ry="1.5" fill="#141110"/></g>
    <!-- near legs -->
    ${lie ? folded : leg(0) + leg(2)}
    ${look.tail === 'bun' ? tail('bun', hair, shade) : ''}
    ${pad}
    <g transform="${headT}">${mane(look.mane, hair, shade)}
    ${forelock}
    ${crown}
    <g stroke="#FFFBF2" stroke-width="4" fill="none" stroke-linecap="round"><path d="M298 40 L314 88"/><path d="M324 66 L318 92"/></g>
    <g stroke="${silk}" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M298 40 L314 88"/><path d="M324 66 L318 92"/></g>
    ${maneBow}</g>
    ${opts.rider ?? ''}
    ${tailBow}
    ${shine}
  </g>
  ${dust}
</svg>`;
}
