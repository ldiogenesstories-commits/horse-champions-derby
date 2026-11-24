// Head-on paper-cut horse (running straight at the camera) for the TV broadcast's
// head-on shot. Same inputs as the side view: coat, face marking, silks colour,
// grooming look and the rider. `pose` (0–1) drives the front-leg gallop and the bob.
import type { HorseDef } from '../sim/types';
import type { Look } from './horseBody';
import { COATS } from './portrait';
import { silksDefs, type Jockey } from './jockey';

const INK = '#2B2118';

function leg(x: number, lift: number, coat: string, hoof: string, wrap: string | null): string {
  // A lifted leg folds toward the camera: shorter, with the hoof raised and bigger.
  const top = 168;
  const knee = 206 - lift * 14;
  const foot = 250 - lift * 46;
  const w = 13 + lift * 4;
  const kx = x + (x < 100 ? -1 : 1) * lift * 4;
  return `<path d="M${x - 9} ${top} L${x + 9} ${top} L${kx + w / 2} ${knee} L${kx + w / 2 - 2} ${foot} L${kx - w / 2 + 2} ${foot} L${kx - w / 2} ${knee} Z" fill="${coat}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    ${wrap ? `<rect x="${kx - w / 2 + 1}" y="${foot - 22}" width="${w - 2}" height="14" rx="3" fill="${wrap}" stroke="${INK}" stroke-width="1.5"/>` : ''}
    <ellipse cx="${kx}" cy="${foot + 2}" rx="${w / 2 + 1}" ry="${5 + lift * 2}" fill="${hoof}" stroke="${INK}" stroke-width="2"/>`;
}

export function horseFrontSVG(def: HorseDef, look: Look, j: Jockey | null, pose: number): string {
  const c = COATS[def.coat ?? 'bay'];
  const silk = def.color;
  const s = j ? silksDefs(j) : { defs: '', fill: '' };
  const ph = Math.sin(2 * Math.PI * pose);
  const lA = Math.max(0, ph);
  const lB = Math.max(0, -ph);
  const bob = -6 * Math.abs(ph);
  const hoof = look.polish ? '#FFD23F' : '#3B2A1E';
  const wrap = look.wraps ? silk : null;
  const m = def.marking ?? 'none';
  const marking = m === 'blaze' ? `<path d="M96 70 L104 70 L107 128 L93 128 Z" fill="#FFFBF2"/>`
    : m === 'star' ? `<polygon points="100,76 104,82 100,88 96,82" fill="#FFFBF2"/>`
    : m === 'snip' ? `<ellipse cx="100" cy="128" rx="4" ry="5" fill="#FFFBF2"/>` : '';
  const forelock = look.forelock === 'braid'
    ? [0, 1, 2].map((i) => `<ellipse cx="100" cy="${66 + i * 7}" rx="5" ry="4.5" fill="${c.mane}" stroke="${INK}" stroke-width="1.2"/>`).join('')
    : `<path d="M88 64 Q100 56 112 64 L107 82 L100 74 L93 82 Z" fill="${c.mane}"/>`;
  const crown = look.crown ? ['#F7A8B8', '#FFD23F', '#FFFBF2', '#9CC3D5', '#F7A8B8'].map((col, i) => `<circle cx="${80 + i * 10}" cy="${62 + Math.abs(2 - i) * 2}" r="5" fill="${col}" stroke="${INK}" stroke-width="1.2"/>`).join('') : '';
  const bow = look.bow === 'mane' || look.bow === 'both'
    ? `<g transform="translate(68 104)"><polygon points="0,0 -11,-8 -11,8" fill="${look.bowColor || silk}" stroke="${INK}" stroke-width="1.8"/><polygon points="0,0 11,-8 11,8" fill="${look.bowColor || silk}" stroke="${INK}" stroke-width="1.8"/><circle r="4" fill="${look.bowColor || silk}" stroke="${INK}" stroke-width="1.8"/></g>` : '';
  const maneSide = look.mane === 'locs'
    ? [0, 1, 2, 3].map((i) => `<path d="M${76 - i} ${96 + i * 10} q-8 8 -6 20" stroke="${c.mane}" stroke-width="5" fill="none" stroke-linecap="round"/>`).join('')
    : look.mane === 'buttons' || look.mane === 'running'
      ? [0, 1, 2, 3].map((i) => `<circle cx="${74 - i}" cy="${100 + i * 11}" r="5" fill="${c.mane}" stroke="${INK}" stroke-width="1.2"/>`).join('')
      : `<path d="M80 90 L64 104 L72 108 L60 126 L70 128 L62 146 L80 140 Z" fill="${c.mane}"/>`;
  const sleeve = j ? (j.pattern === 'solid' ? j.primary : j.secondary) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 270">
  ${s.defs ? `<defs>${s.defs}</defs>` : ''}
  <ellipse cx="100" cy="258" rx="58" ry="9" fill="rgba(43,33,24,.22)"/>
  <g transform="translate(0 ${bob})">
    <!-- far (hind) hooves peeking out behind -->
    <ellipse cx="74" cy="${244 + lB * 4}" rx="9" ry="4" fill="${hoof}" stroke="${INK}" stroke-width="1.5"/>
    <ellipse cx="126" cy="${244 + lA * 4}" rx="9" ry="4" fill="${hoof}" stroke="${INK}" stroke-width="1.5"/>
    ${leg(84, lA, c.body, hoof, wrap)}${leg(116, lB, c.body, hoof, wrap)}
    <!-- chest and shoulders -->
    <ellipse cx="100" cy="148" rx="54" ry="44" fill="${c.body}" stroke="${INK}" stroke-width="2.5"/>
    <ellipse cx="62" cy="150" rx="14" ry="34" fill="${c.shade}"/><ellipse cx="138" cy="150" rx="14" ry="34" fill="${c.shade}"/>
    ${look.pad ? `<path d="M52 124 Q100 110 148 124 L144 112 Q100 100 56 112 Z" fill="${silk}" stroke="${INK}" stroke-width="1.5"/>` : ''}
    ${j ? `    <!-- rider crouched up behind the head: shoulders in silks, arms down to the reins -->
    <path d="M58 66 Q100 36 142 66 L134 90 Q100 76 66 90 Z" fill="${s.fill}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M68 74 L74 116" stroke="${INK}" stroke-width="10" stroke-linecap="round"/><path d="M68 74 L74 116" stroke="${sleeve}" stroke-width="7" stroke-linecap="round"/>
    <path d="M132 74 L126 116" stroke="${INK}" stroke-width="10" stroke-linecap="round"/><path d="M132 74 L126 116" stroke="${sleeve}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="100" cy="30" r="12" fill="${j.skin}" stroke="${INK}" stroke-width="1.8"/>
    <path d="M87 28 A13 13 0 0 1 113 28 L117 32 L83 32 Z" fill="${j.cap}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="100" cy="16" r="2.4" fill="${j.cap === j.primary ? j.secondary : j.primary}" stroke="${INK}" stroke-width="1"/>
    <circle cx="96" cy="35" r="1.4" fill="${INK}"/><circle cx="104" cy="35" r="1.4" fill="${INK}"/>
    <path d="M96 39 q4 2.5 8 0" stroke="${INK}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
` : ''}
    <!-- mane down the near side of the neck -->
    ${maneSide}
    <!-- neck -->
    <path d="M80 86 L120 86 L130 132 L70 132 Z" fill="${c.body}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <!-- ears -->
    <polygon points="82,74 76,48 94,68" fill="${c.body}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <polygon points="118,74 124,48 106,68" fill="${c.body}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <polygon points="84,70 80,56 90,68" fill="${c.shade}"/><polygon points="116,70 120,56 110,68" fill="${c.shade}"/>
    <!-- head, foreshortened: broad forehead tapering to a rounded muzzle -->
    <path d="M76 70 Q100 62 124 70 L118 100 L113 128 L87 128 L82 100 Z" fill="${c.body}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    ${marking}
    <ellipse cx="100" cy="134" rx="16" ry="12" fill="${c.shade}" stroke="${INK}" stroke-width="2.2"/>
    <ellipse cx="93.5" cy="136" rx="2.8" ry="3.8" fill="${INK}"/><ellipse cx="106.5" cy="136" rx="2.8" ry="3.8" fill="${INK}"/>
    <circle cx="80" cy="88" r="4" fill="${INK}"/><circle cx="120" cy="88" r="4" fill="${INK}"/>
    <circle cx="79" cy="86.6" r="1.2" fill="#FFFBF2"/><circle cx="119" cy="86.6" r="1.2" fill="#FFFBF2"/>
    ${forelock}${crown}
    <!-- bridle in the silks colour -->
    <path d="M78 76 Q100 70 122 76" stroke="${silk}" stroke-width="3" fill="none"/>
    <path d="M86 122 Q100 127 114 122" stroke="${silk}" stroke-width="3.5" fill="none"/>
    <path d="M77 78 L86 122 M123 78 L114 122" stroke="${silk}" stroke-width="2"/>
    <path d="M75 118 Q80 124 86 124 M125 118 Q120 124 114 124" stroke="#5A3F28" stroke-width="2" fill="none"/>
    ${bow}
  </g>
</svg>`;
}
