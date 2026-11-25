// Barn decor bought in the Shop, drawn over the stable scene (same 400x230 frame as its backdrop).
const INK = '#2B2118';

const PIECES: Record<string, string> = {
  rug: `<g><rect x="120" y="188" width="160" height="30" rx="6" fill="#C8452D" stroke="${INK}" stroke-width="3"/>
    <rect x="130" y="194" width="140" height="18" rx="3" fill="none" stroke="#FFD23F" stroke-width="3" stroke-dasharray="8 5"/>
    <path d="M150 203 h100" stroke="#FFFBF2" stroke-width="3"/></g>`,
  flowers: [112, 218].map((x) => `<g>
    <rect x="${x - 2}" y="104" width="74" height="12" rx="3" fill="#A46A3C" stroke="${INK}" stroke-width="2.5"/>
    ${[8, 22, 36, 50, 64].map((dx, i) => `<circle cx="${x + dx}" cy="101" r="5" fill="${['#F7A8B8', '#FFD23F', '#FFFBF2', '#C9A7E8', '#F28C6B'][i]}" stroke="${INK}" stroke-width="1.8"/><circle cx="${x + dx}" cy="101" r="1.6" fill="${INK}"/>`).join('')}
  </g>`).join(''),
  bunting: `<g><path d="M0 8 Q100 26 200 10 Q300 26 400 8" fill="none" stroke="${INK}" stroke-width="2"/>
    ${Array.from({ length: 13 }, (_, i) => {
      const x = 10 + i * 30;
      const t = (x % 200) / 200;
      const y = 8 + Math.sin(t * Math.PI) * 15;
      return `<polygon points="${x - 8},${y} ${x + 8},${y} ${x},${y + 16}" fill="${['#C8452D', '#FFD23F', '#2F5D9E', '#3E6B48'][i % 4]}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
    }).join('')}</g>`,
  lantern: `<g><line x1="66" y1="0" x2="66" y2="26" stroke="${INK}" stroke-width="2"/>
    <circle cx="66" cy="50" r="22" fill="#FFD23F" opacity=".28"/>
    <rect x="56" y="26" width="20" height="6" rx="2" fill="#B8962F" stroke="${INK}" stroke-width="2"/>
    <rect x="57" y="32" width="18" height="24" rx="4" fill="#FFE58A" stroke="${INK}" stroke-width="2.5"/>
    <path d="M66 36 v16" stroke="#E2A93B" stroke-width="3"/>
    <rect x="55" y="56" width="22" height="5" rx="2" fill="#B8962F" stroke="${INK}" stroke-width="2"/></g>`,
  trophy: `<g><rect x="338" y="92" width="56" height="7" rx="2" fill="#8A6A45" stroke="${INK}" stroke-width="2.5"/>
    <path d="M354 66 h24 v6 q0 14 -12 16 q-12 -2 -12 -16 z" fill="#FFD23F" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M354 70 q-8 0 -6 8 q2 4 7 4 M378 70 q8 0 6 8 q-2 4 -7 4" fill="none" stroke="${INK}" stroke-width="2.5"/>
    <rect x="362" y="86" width="8" height="4" fill="#B8962F" stroke="${INK}" stroke-width="2"/>
    <rect x="357" y="88" width="18" height="5" rx="1.5" fill="#B8962F" stroke="${INK}" stroke-width="2"/></g>`,
  sign: `<g><path d="M186 40 C178 26 182 14 200 12 C218 14 222 26 214 40" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
    <path d="M186 40 C178 26 182 14 200 12 C218 14 222 26 214 40" fill="none" stroke="#E2A93B" stroke-width="6" stroke-linecap="round"/></g>`,
};
// Back to front: the rug sits on the floor, bunting hangs in front of everything.
const ORDER = ['rug', 'flowers', 'trophy', 'sign', 'lantern', 'bunting'];

export function decorSVG(owned: string[]): string {
  const parts = ORDER.filter((k) => owned.includes(k)).map((k) => PIECES[k]).join('');
  return parts ? `<svg class="st-decor" viewBox="0 0 400 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${parts}</svg>` : '';
}

/** A small preview tile for the Shop. */
export function decorPreview(id: string): string {
  const box: Record<string, string> = { rug: '110 180 180 46', flowers: '104 88 188 32', bunting: '0 0 220 40', lantern: '40 0 52 66', trophy: '334 60 64 40', sign: '172 4 56 44' };
  return `<svg viewBox="${box[id] ?? '0 0 400 230'}" width="64" height="40" aria-hidden="true">${PIECES[id] ?? ''}</svg>`;
}
