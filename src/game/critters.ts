// Barn friends: paper-cut critters that move into the stable over time,
// plus the weaver spider's web notes and the rosette wall.
export type FriendId = 'cat' | 'spider' | 'hen' | 'owl' | 'goat' | 'ducks';

export interface FriendInfo {
  id: FriendId;
  name: string;
  kind: string;
  unlock: string; // how you earn it (shown in the album)
  lines: string[]; // what happens when you tap it
}

export const FRIENDS: FriendInfo[] = [
  { id: 'cat', name: 'Biscuit', kind: 'barn cat', unlock: 'Win your first race', lines: ['Biscuit purrs and kneads the hay.', 'Biscuit blinks slowly at you. That means love.', 'Biscuit is pretending not to watch the horse. Biscuit is watching the horse.'] },
  { id: 'spider', name: 'Willa', kind: 'weaver spider', unlock: 'Reach Trust 25', lines: ['Willa is busy spinning. Read her web!', 'Willa waves three of her eight legs.', 'Willa says the web is a first draft.'] },
  { id: 'hen', name: 'Clementine', kind: 'speckled hen', unlock: 'Win 3 races', lines: ['Clementine pecks at a stray oat.', 'Bawk! Clementine found a button.', 'Clementine supervises the hay. Sternly.'] },
  { id: 'owl', name: 'Professor Hoot', kind: 'barn owl', unlock: 'Win a Night Race', lines: ['Professor Hoot opens one eye. Hoo.', 'Professor Hoot approves of night racing.', 'The Professor is napping. Do not tell him it is daytime.'] },
  { id: 'goat', name: 'Pickles', kind: 'pygmy goat', unlock: "Discover your horse's favourite food", lines: ['Pickles is trying to eat the nameplate.', 'Pickles headbutts the hay bale. It deserved it.', 'Pickles and your horse are sharing a snack.'] },
  { id: 'ducks', name: 'The Puddle Twins', kind: 'ducklings', unlock: 'Score an S in the Swim Session', lines: ['Peep peep! The twins followed you from the pool.', 'The Puddle Twins waddle in a tiny line.', 'One twin sits on the other twin. Teamwork.'] },
];

const INK = '#2B2118';

export const CRITTER_SVG: Record<FriendId, string> = {
  cat: `<svg viewBox="0 0 44 46" width="44" height="46"><path d="M10 44 C6 30 8 20 14 16 L12 4 L19 11 L25 11 L32 4 L30 16 C36 20 38 30 34 44 Z" fill="#E08A3C" stroke="${INK}" stroke-width="2"/>
    <path d="M34 40 C42 40 44 30 40 26" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M34 40 C42 40 44 30 40 26" stroke="#E08A3C" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M15 19 q2.5 -2.5 5 0 M24 19 q2.5 -2.5 5 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M20 24 h4 l-2 2 z" fill="${INK}"/>
    <path d="M14 30 h16 M15 35 h14" stroke="#B86A28" stroke-width="2"/></svg>`,
  hen: `<svg viewBox="0 0 44 40" width="40" height="36"><path d="M8 22 C8 12 18 8 26 12 L30 6 C34 4 38 8 36 12 L40 14 L35 16 C38 28 30 36 20 36 C12 36 8 30 8 22 Z" fill="#F4EFE4" stroke="${INK}" stroke-width="2"/>
    <path d="M30 6 l1 -4 l2 3 l2 -3 l0 5" fill="#C8452D" stroke="${INK}" stroke-width="1.2"/><circle cx="33" cy="10" r="1.5" fill="${INK}"/>
    <circle cx="16" cy="22" r="1.4" fill="#8C7556"/><circle cx="21" cy="27" r="1.4" fill="#8C7556"/><circle cx="14" cy="29" r="1.4" fill="#8C7556"/>
    <path d="M18 36 v3 M24 36 v3" stroke="#E2A93B" stroke-width="2.5"/></svg>`,
  owl: `<svg viewBox="0 0 40 46" width="38" height="44"><path d="M6 40 C4 20 8 8 20 8 C32 8 36 20 34 40 Z" fill="#C89A63" stroke="${INK}" stroke-width="2"/>
    <path d="M8 10 L12 2 L16 9 M32 10 L28 2 L24 9" fill="#C89A63" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="14" cy="19" r="6" fill="#FFFBF2" stroke="${INK}" stroke-width="1.5"/><circle cx="26" cy="19" r="6" fill="#FFFBF2" stroke="${INK}" stroke-width="1.5"/>
    <circle cx="14" cy="19" r="2.4" fill="${INK}"/><path d="M22 19 h8" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
    <path d="M18 24 l2 4 l2 -4 z" fill="#E2A93B"/><path d="M12 32 q3 2 6 0 M22 32 q3 2 6 0" stroke="#8C6A3E" stroke-width="1.5" fill="none"/>
    <rect x="0" y="40" width="40" height="5" rx="2" fill="#6B4A2B"/></svg>`,
  goat: `<svg viewBox="0 0 54 48" width="52" height="46"><path d="M8 20 C8 14 16 12 30 13 C38 13 42 16 42 24 L42 32 L8 32 Z" fill="#F4EFE4" stroke="${INK}" stroke-width="2"/>
    <path d="M38 16 C40 8 46 6 50 10 C53 14 52 20 48 22 L42 22 Z" fill="#F4EFE4" stroke="${INK}" stroke-width="2"/>
    <path d="M44 8 C42 2 38 2 36 4 M48 8 C48 2 52 0 54 2" stroke="#8C7556" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="47" cy="13" r="1.5" fill="${INK}"/><path d="M48 22 l-1 5 l3 -4" fill="#E9DCC0" stroke="${INK}" stroke-width="1"/>
    <path d="M12 32 v12 M18 32 v12 M32 32 v12 M38 32 v12" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M8 20 l-4 -3" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><path d="M20 18 C24 22 30 22 34 18" stroke="#C9B48F" stroke-width="2" fill="none"/></svg>`,
  ducks: `<svg viewBox="0 0 56 30" width="54" height="29">${[0, 26].map((x) => `<g transform="translate(${x} ${x ? 4 : 0})"><path d="M2 18 C2 10 10 8 16 12 C16 6 24 4 26 10 L30 11 L26 13 C28 22 20 26 12 26 C6 26 2 23 2 18 Z" fill="#FFD23F" stroke="${INK}" stroke-width="1.6"/><circle cx="22" cy="9" r="1.3" fill="${INK}"/><path d="M8 18 q4 3 8 0" stroke="#E2A93B" stroke-width="1.5" fill="none"/></g>`).join('')}</svg>`,
  spider: '', // drawn as part of the web
};

/** Willa's web, with a word woven into it. state: idle, working (weaving a new word), fresh (just finished). */
export function webSVG(note: string, state: 'idle' | 'working' | 'fresh' = 'idle'): string {
  const spokes = [0, 30, 60, 90].map((a) => {
    const r = (a * Math.PI) / 180;
    return `<path d="M0 0 L${(Math.cos(r) * 118).toFixed(1)} ${(Math.sin(r) * 118).toFixed(1)}" stroke="#FFFBF2" stroke-width="1" opacity="0.8"/>`;
  }).join('');
  const rings = [26, 46, 66, 86, 104].map((rad) => {
    const pts = [0, 30, 60, 90].map((a) => { const r = (a * Math.PI) / 180; return `${(Math.cos(r) * rad).toFixed(1)},${(Math.sin(r) * rad).toFixed(1)}`; });
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="#FFFBF2" stroke-width="1" opacity="0.7"/>`;
  }).join('');
  const label = state === 'working' ? "Willa is weaving a new word" : `Willa's web says: ${note}`;
  return `<svg viewBox="0 0 120 92" width="132" height="101" class="web-svg ${state}" aria-label="${label}">
    ${spokes}${rings}
    <text x="62" y="54" text-anchor="middle" transform="rotate(32 62 54)" class="web-word">${note}</text>
    ${state === 'working' ? '<path class="web-new-thread" d="M30 20 C50 30 60 44 86 66 M44 14 C60 30 74 40 96 50" stroke="#FFFBF2" stroke-width="1.2" fill="none"/>' : ''}
    ${state === 'fresh' ? '<g class="web-sparkle" fill="#FFD23F"><path d="M22 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/><path d="M96 74 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z"/><path d="M70 22 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z"/></g>' : ''}
    <g transform="translate(100 62)"><g class="spider">
      <path d="M0 -8 V-70" stroke="#FFFBF2" stroke-width="0.8" opacity="0.9"/>
      <circle r="4.5" fill="${INK}"/><circle cy="-5" r="3" fill="${INK}"/>
      <path class="legs" d="M-4 -2 l-6 -4 M-4 1 l-7 0 M-4 3 l-6 5 M4 -2 l6 -4 M4 1 l7 0 M4 3 l6 5" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>
      <circle cx="-1.2" cy="-5.6" r="0.8" fill="#FFFBF2"/><circle cx="1.2" cy="-5.6" r="0.8" fill="#FFFBF2"/>
    </g></g>
  </svg>`;
}

/** A prize rosette for the stall wall. */
export function rosetteSVG(color: string, special = false): string {
  const petals = Array.from({ length: 10 }, (_, i) => `<ellipse cx="0" cy="-8" rx="3.6" ry="6" transform="rotate(${i * 36})" fill="${color}" stroke="${INK}" stroke-width="0.8"/>`).join('');
  return `<svg viewBox="-14 -14 28 40" width="20" height="29"><path d="M-6 6 L-9 25 L-4 21 L-2 26 L0 8 M6 6 L9 25 L4 21 L2 26 L0 8" fill="${color}" stroke="${INK}" stroke-width="0.8"/>${petals}<circle r="5.5" fill="${special ? '#FFD23F' : '#FFFBF2'}" stroke="${INK}" stroke-width="1"/>${special ? '<path d="M0 -3 l1 2.2 2.4 .3 -1.8 1.6 .5 2.4 -2.1 -1.2 -2.1 1.2 .5 -2.4 -1.8 -1.6 2.4 -.3z" fill="#C8452D"/>' : '<text y="2.2" text-anchor="middle" font-size="6" font-weight="900" fill="#2B2118">1</text>'}</svg>`;
}
