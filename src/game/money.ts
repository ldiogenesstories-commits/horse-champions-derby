// Horse Dollars: the stable's currency. Symbol: a lowercase h with two horizontal bars.
const INK = '#2B2118';

/** The inline symbol, sized to sit beside text (1em tall). */
export function hdSymbol(color = 'currentColor'): string {
  return `<svg class="hd-sym" viewBox="-2 0 46 60" width="0.78em" height="1em" aria-label="Horse Dollars" role="img" style="vertical-align:-0.12em"><g stroke="${color}" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M10 4 V56 M10 36 Q10 24 21 24 Q32 24 32 36 V56" stroke-width="7"/><path d="M0 34 H42 M0 44 H42" stroke-width="3.5"/></g></svg>`;
}

/** A gold paper coin. */
export function hdCoin(px = 40): string {
  return `<svg viewBox="0 0 112 112" width="${px}" height="${px}" aria-hidden="true"><circle cx="56" cy="56" r="52" fill="#FFD23F" stroke="${INK}" stroke-width="5"/><circle cx="56" cy="56" r="41" fill="none" stroke="#B8962F" stroke-width="3"/><g stroke="${INK}" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M44 26 V84 M44 62 Q44 48 57 48 Q70 48 70 62 V84" stroke-width="9"/><path d="M30 54 H82 M30 66 H82" stroke-width="4.5"/></g></svg>`;
}

/** "ħ 1,250" as HTML. */
export const hd = (n: number) => `${hdSymbol()}&nbsp;${Math.round(n).toLocaleString('en-US')}`;
