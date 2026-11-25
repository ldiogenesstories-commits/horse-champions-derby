// Your jockey: name, racing silks (pattern + two colours), cap, and rider looks.
// The jockey is you, so it carries over to every horse you raise. Drawn as a
// paper-cut rider that sits on the full-body horse (same coordinates).

export type SilksPattern = 'solid' | 'hoops' | 'stripes' | 'halves' | 'diamonds' | 'stars' | 'chevron' | 'sash';
export type HairStyle = 'short' | 'ponytail' | 'braids' | 'locs' | 'puffs' | 'spiky' | 'afro' | 'bun' | 'bob' | 'curlytop' | 'swoop';
export type RiderBody = 'male' | 'female';

export interface Jockey {
  name: string;
  pattern: SilksPattern;
  primary: string;
  secondary: string;
  cap: string;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  /** Male or female rider (faces); older saves without it ride as male. */
  body?: RiderBody;
}

export const SILK_COLORS: [string, string][] = [
  ['#C8452D', 'Red'], ['#2F5D9E', 'Blue'], ['#3E6B48', 'Green'], ['#E2A93B', 'Gold'], ['#7A3E8E', 'Purple'],
  ['#E48AA6', 'Pink'], ['#D96C2C', 'Orange'], ['#3E8E8A', 'Teal'], ['#2B2118', 'Black'], ['#FFFBF2', 'White'],
];
export const SKIN_TONES: [string, string][] = [['#F6D7B8', 'Light'], ['#E8B98E', 'Fair'], ['#C68A5A', 'Tan'], ['#8D5A3B', 'Brown'], ['#5A3825', 'Deep']];
export const HAIR_COLORS: [string, string][] = [['#1E1714', 'Black'], ['#5A3A22', 'Brown'], ['#E2C27A', 'Blonde'], ['#B5532A', 'Red'], ['#B9B4AC', 'Silver']];
export const PATTERNS: [SilksPattern, string][] = [
  ['solid', 'Solid'], ['hoops', 'Hoops'], ['stripes', 'Stripes'], ['halves', 'Halves'],
  ['diamonds', 'Diamonds'], ['stars', 'Stars'], ['chevron', 'Chevron'], ['sash', 'Sash'],
];
export const HAIRS: [HairStyle, string][] = [
  ['short', 'Short'], ['ponytail', 'Ponytail'], ['braids', 'Braids'], ['locs', 'Locs'], ['puffs', 'Puffs'], ['spiky', 'Spiky'],
  ['afro', 'Afro'], ['bun', 'Bun'], ['bob', 'Bob'], ['curlytop', 'Curly top'], ['swoop', 'Swoop'],
];
export const BODIES: [RiderBody, string][] = [['male', 'Male'], ['female', 'Female']];

export const DEFAULT_JOCKEY: Jockey = {
  name: 'You', pattern: 'hoops', primary: '#C8452D', secondary: '#FFFBF2', cap: '#2B2118',
  skin: '#C68A5A', hair: 'short', hairColor: '#1E1714',
};

const INK = '#2B2118';
let uid = 0;

/** An SVG <pattern> for the silks, plus the fill to use. Ids are unique per call. */
export function silksDefs(j: Jockey): { defs: string; fill: string } {
  const id = `silk${++uid}`;
  const a = j.primary;
  const b = j.secondary;
  let body = '';
  switch (j.pattern) {
    case 'solid': return { defs: '', fill: a };
    case 'hoops': body = `<rect width="12" height="12" fill="${a}"/><rect y="6" width="12" height="6" fill="${b}"/>`; break;
    case 'stripes': body = `<rect width="12" height="12" fill="${a}"/><rect x="6" width="6" height="12" fill="${b}"/>`; break;
    case 'diamonds': body = `<rect width="12" height="12" fill="${a}"/><polygon points="6,1 11,6 6,11 1,6" fill="${b}"/>`; break;
    case 'stars': body = `<rect width="12" height="12" fill="${a}"/><path d="M6 2 l1.2 2.6 2.8.3 -2.1 1.9 .6 2.8 -2.5 -1.4 -2.5 1.4 .6 -2.8 -2.1 -1.9 2.8 -.3z" fill="${b}"/>`; break;
    case 'chevron': body = `<rect width="12" height="12" fill="${a}"/><path d="M0 4 L6 9 L12 4 L12 8 L6 13 L0 8 Z" fill="${b}"/>`; break;
    case 'halves': return { defs: `<linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0"><stop offset="0.5" stop-color="${a}"/><stop offset="0.5" stop-color="${b}"/></linearGradient>`, fill: `url(#${id})` };
    case 'sash': return { defs: `<linearGradient id="${id}" x1="0" x2="1" y1="0" y2="1"><stop offset="0.38" stop-color="${a}"/><stop offset="0.38" stop-color="${b}"/><stop offset="0.6" stop-color="${b}"/><stop offset="0.6" stop-color="${a}"/></linearGradient>`, fill: `url(#${id})` };
  }
  return { defs: `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse">${body}</pattern>`, fill: `url(#${id})` };
}

function hairSVG(j: Jockey): string {
  const c = j.hairColor;
  switch (j.hair) {
    case 'ponytail': return `<path d="M228 56 C220 60 216 70 218 80 C222 74 226 66 232 62 Z" fill="${c}" stroke="${INK}" stroke-width="1"/>`;
    case 'braids': return `${[0, 1, 2, 3].map((i) => `<ellipse cx="${226 - i * 1.5}" cy="${60 + i * 6}" rx="3" ry="3.6" fill="${c}" stroke="${INK}" stroke-width="0.8"/>`).join('')}`;
    case 'locs': return [0, 1, 2].map((i) => `<path d="M${229 + i * 2} 56 q-4 10 -${2 + i} ${18 - i * 3}" stroke="${c}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`).join('');
    case 'puffs': return `<circle cx="226" cy="54" r="5.5" fill="${c}" stroke="${INK}" stroke-width="1"/>`;
    default: return `<path d="M229 54 Q230 62 234 64 L236 58 Z" fill="${c}"/>`;
  }
}

/** The rider, in horse-body coordinates (horse faces right). */
export function riderSVG(j: Jockey): string {
  const s = silksDefs(j);
  const sleeve = j.pattern === 'solid' ? j.primary : j.secondary;
  return `<g class="rider">
    ${s.defs ? `<defs>${s.defs}</defs>` : ''}
    <path d="M180 104 Q200 95 224 101 L222 111 Q200 106 182 113 Z" fill="#5A3F28" stroke="${INK}" stroke-width="1.5"/>
    <!-- leg: white breeches, black boot -->
    <path d="M196 100 L222 118 L212 142" stroke="${INK}" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M196 100 L222 118 L212 142" stroke="#FFFBF2" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M215 132 L211 146 L222 148" stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- body in silks, crouched over the withers -->
    <path d="M186 100 C184 84 198 70 220 64 L238 72 C234 86 222 98 206 104 Z" fill="${s.fill}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <!-- arm to the reins -->
    <path d="M228 70 L246 86 L262 90" stroke="${INK}" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M228 70 L246 86 L262 90" stroke="${sleeve}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="263" cy="90" r="3.6" fill="${j.skin}" stroke="${INK}" stroke-width="1.2"/>
    <path d="M264 90 L314 86" stroke="#5A3F28" stroke-width="1.6"/>
    ${hairSVG(j)}
    <!-- head + cap -->
    <circle cx="238" cy="60" r="8.5" fill="${j.skin}" stroke="${INK}" stroke-width="1.5"/>
    <path d="M228.5 58 A9.8 9.8 0 0 1 247.5 56 L252 58 L247 60 Z" fill="${j.cap}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="238" cy="47.6" r="2.2" fill="${j.cap === j.primary ? j.secondary : j.primary}" stroke="${INK}" stroke-width="1"/>
    <circle cx="243" cy="62" r="1.2" fill="${INK}"/>
    <path d="M241 66 q2 1.5 4 0" stroke="${INK}" stroke-width="1" fill="none" stroke-linecap="round"/>
  </g>`;
}

/** A small round silks badge (for lists and labels). */
export function silksBadge(j: Jockey, size = 28): string {
  const s = silksDefs(j);
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${s.defs ? `<defs>${s.defs}</defs>` : ''}<circle cx="12" cy="12" r="10.5" fill="${s.fill}" stroke="${INK}" stroke-width="2"/></svg>`;
}
