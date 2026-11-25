// What the Shop sells. Everything is cosmetic and paid in Horse Dollars earned by racing.
// The free grooming items stay free; the Shop adds extra options on top.
import type { SilksPattern } from '../game/jockey';
import { owns } from './profile';

export type ShopKind = 'bow' | 'pad' | 'silks' | 'decor';
export interface ShopItem { id: string; kind: ShopKind; label: string; price: number; value: string; blurb?: string }

export const SHOP_SECTIONS: { kind: ShopKind; title: string; note: string }[] = [
  { kind: 'bow', title: 'Ribbon colors', note: 'New colors for mane and tail bows (Grooming → Bows).' },
  { kind: 'pad', title: 'Tack: saddle pads', note: 'Saddle pad colors (Grooming → Extras → Saddle pad).' },
  { kind: 'silks', title: 'Silks patterns', note: 'New patterns for your racing silks (Jockey room).' },
  { kind: 'decor', title: 'Barn decor', note: 'Decorations that show up in your stable.' },
];

export const SHOP: ShopItem[] = [
  { id: 'bow:#C9A7E8', kind: 'bow', label: 'Lavender', value: '#C9A7E8', price: 150 },
  { id: 'bow:#9FDCB8', kind: 'bow', label: 'Mint', value: '#9FDCB8', price: 150 },
  { id: 'bow:#F28C6B', kind: 'bow', label: 'Coral', value: '#F28C6B', price: 150 },
  { id: 'bow:#3F63B8', kind: 'bow', label: 'Royal blue', value: '#3F63B8', price: 150 },
  { id: 'bow:#2B2118', kind: 'bow', label: 'Midnight', value: '#2B2118', price: 150 },

  { id: 'pad:#E2A93B', kind: 'pad', label: 'Gold pad', value: '#E2A93B', price: 200 },
  { id: 'pad:#22355E', kind: 'pad', label: 'Navy pad', value: '#22355E', price: 200 },
  { id: 'pad:#7A3E8E', kind: 'pad', label: 'Plum pad', value: '#7A3E8E', price: 200 },
  { id: 'pad:#F4EBD8', kind: 'pad', label: 'Ivory pad', value: '#F4EBD8', price: 200 },
  { id: 'pad:#3E6B48', kind: 'pad', label: 'Racing green pad', value: '#3E6B48', price: 200 },

  { id: 'silks:checks', kind: 'silks', label: 'Checks', value: 'checks', price: 300 },
  { id: 'silks:spots', kind: 'silks', label: 'Spots', value: 'spots', price: 300 },
  { id: 'silks:quarters', kind: 'silks', label: 'Quarters', value: 'quarters', price: 300 },
  { id: 'silks:bolt', kind: 'silks', label: 'Lightning', value: 'bolt', price: 350 },

  { id: 'decor:bunting', kind: 'decor', label: 'Bunting', value: 'bunting', price: 250, blurb: 'Party flags along the rafters.' },
  { id: 'decor:flowers', kind: 'decor', label: 'Flower boxes', value: 'flowers', price: 250, blurb: 'Window boxes on the stall doors.' },
  { id: 'decor:lantern', kind: 'decor', label: 'Lantern', value: 'lantern', price: 200, blurb: 'A warm brass lantern.' },
  { id: 'decor:trophy', kind: 'decor', label: 'Trophy shelf', value: 'trophy', price: 400, blurb: 'Shows off a gold cup.' },
  { id: 'decor:sign', kind: 'decor', label: 'Lucky horseshoe', value: 'sign', price: 300, blurb: 'Hung over the door for luck.' },
  { id: 'decor:rug', kind: 'decor', label: 'Woven rug', value: 'rug', price: 300, blurb: 'A cozy rug for the aisle.' },
];

const has = (kind: ShopKind) => SHOP.filter((i) => i.kind === kind && owns(i.id));
/** Ribbon colors the player has bought, as [color, label]. */
export const ownedBowColors = (): [string, string][] => has('bow').map((i) => [i.value, i.label]);
export const ownedPadColors = (): [string, string][] => has('pad').map((i) => [i.value, i.label.replace(' pad', '')]);
export const ownedPatterns = (): [SilksPattern, string][] => has('silks').map((i) => [i.value as SilksPattern, i.label]);
export const ownedDecor = (): string[] => has('decor').map((i) => i.value);
