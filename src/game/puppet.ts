// Jointed felt puppet horse + jockey, cut from the concept-art parts sheets.
// Each piece turns on a brass pin; a gallop cycle swings the legs, bobs the body
// and sways mane and tail. Pieces are recoloured per horse (coat) and per rider
// (silks, cap), then each pose is baked to a canvas for the broadcast to draw.
import type { HorseDef } from '../sim/types';
import type { Jockey } from './jockey';
import { COATS } from './portrait';

const URLS = import.meta.glob('./puppet/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const HALF = 0.5; // part images are stored at half the parts-sheet resolution

type Vec = [number, number];
interface Part {
  id: string;
  src?: string;
  parent?: string;
  /** Point on this image (parts-sheet px) that sits on the joint. */
  pivot?: Vec;
  /** Joint position on the parent image (parts-sheet px). */
  at?: Vec;
  z?: number;
  rot?: number;
  s?: number;
  flip?: boolean;
  /** How to recolour: coat, mane, silks, cap, or keep the art as is. */
  tint?: 'coat' | 'mane' | 'silks' | 'cap';
  far?: boolean;
}

// The rig. Parts are listed parents-first. The horse is cut facing left; it is flipped at the root.
const PARTS: Part[] = [
  { id: 'hips' },
  { id: 'body', src: 'body', parent: 'hips', pivot: [534, 220], at: [0, 0], z: 10, tint: 'coat' },
  { id: 'tail', src: 'tail', parent: 'body', pivot: [24, 70], at: [860, 118], z: 6, rot: 6, tint: 'mane' },
  { id: 'farHindU', src: 'hind_upper', parent: 'body', pivot: [59, 48], at: [728, 368], z: 3, tint: 'coat', far: true },
  { id: 'farHindL', src: 'hind_lower', parent: 'farHindU', pivot: [301, 330], at: [301, 330], z: 4, tint: 'coat', far: true },
  { id: 'farFrontU', src: 'front_upper', parent: 'body', pivot: [216, 51], at: [168, 342], z: 3, tint: 'coat', far: true },
  { id: 'farFrontL', src: 'front_lower', parent: 'farFrontU', pivot: [78, 341], at: [78, 341], z: 4, tint: 'coat', far: true },
  { id: 'neck', src: 'neck', parent: 'body', pivot: [244, 310], at: [163, 89], z: 8, rot: -6, tint: 'coat' },
  { id: 'mane', src: 'mane', parent: 'neck', pivot: [22, 58], at: [110, 20], z: 12, s: 0.9, rot: 14, tint: 'mane' },
  { id: 'head', src: 'head', parent: 'neck', pivot: [350, 300], at: [69, 91], z: 11, s: 0.92, rot: 6, tint: 'coat' },
  { id: 'shoulder', src: 'shoulder', parent: 'body', pivot: [128, 249], at: [147, 348], z: 12, tint: 'coat' },
  { id: 'hindU', src: 'hind_upper', parent: 'body', pivot: [59, 48], at: [743, 377], z: 14, tint: 'coat' },
  { id: 'hindL', src: 'hind_lower', parent: 'hindU', pivot: [301, 330], at: [301, 330], z: 15, tint: 'coat' },
  { id: 'frontU', src: 'front_upper', parent: 'body', pivot: [216, 51], at: [147, 348], z: 14, tint: 'coat' },
  { id: 'frontL', src: 'front_lower', parent: 'frontU', pivot: [78, 341], at: [78, 341], z: 15, tint: 'coat' },
  { id: 'saddle', src: 'saddle', parent: 'body', pivot: [175, 70], at: [440, 34], z: 16, s: 0.78 },
  // Jockey (cut facing right, so flipped again to ride the same way as the horse).
  { id: 'jHips', parent: 'body', at: [470, -46], s: 0.62, flip: true },
  { id: 'jThigh', src: 'j_thigh', parent: 'jHips', pivot: [86, 114], at: [0, 0], z: 22, rot: -84 },
  { id: 'jShin', src: 'j_shin', parent: 'jThigh', pivot: [76, 52], at: [48, 336], z: 21, rot: 112, s: 0.85 },
  { id: 'jBoot', src: 'j_boot', parent: 'jShin', pivot: [92, 56], at: [76, 339], z: 23, rot: -26, s: 0.8 },
  { id: 'jTorso', src: 'j_torso', parent: 'jHips', pivot: [170, 462], at: [0, 0], z: 20, rot: 56, tint: 'silks' },
  { id: 'jHead', src: 'j_head', parent: 'jTorso', pivot: [235, 440], at: [175, 40], z: 19, rot: -46, s: 0.85 },
  { id: 'jHair', src: 'j_hair', parent: 'jHead', pivot: [110, 40], at: [95, 120], z: 17, rot: 10 },
  { id: 'jCap', src: 'j_cap', parent: 'jHead', pivot: [235, 255], at: [215, 120], z: 24, s: 0.82, rot: 4, tint: 'cap' },
  { id: 'jUArm', src: 'j_upperarm', parent: 'jTorso', pivot: [171, 56], at: [102, 160], z: 25, rot: -88, tint: 'silks' },
  { id: 'jFArm', src: 'j_forearm', parent: 'jUArm', pivot: [60, 38], at: [66, 226], z: 26, rot: -40, tint: 'silks' },
  { id: 'jGlove', src: 'j_glove', parent: 'jFArm', pivot: [70, 30], at: [60, 210], z: 27, rot: -10 },
];
const DRAW_ORDER = PARTS.filter((p) => p.src).sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

/** Joint angles (degrees) for a point in the gallop cycle, ph in [0, 1). */
function pose(ph: number): Record<string, number> {
  const a = ph * Math.PI * 2;
  const s = Math.sin;
  const up = (x: number) => Math.max(0, s(x));
  return {
    hipsY: -16 * Math.abs(s(a)), hipsRot: 4.5 * s(a + 0.6),
    frontU: 4 + 40 * s(a), frontL: 62 * up(a + 1.6),
    farFrontU: 4 + 40 * s(a - 0.7), farFrontL: 62 * up(a + 0.9),
    hindU: -4 - 36 * s(a + 2.4), hindL: -52 * up(a + 4.0),
    farHindU: -4 - 36 * s(a + 1.7), farHindL: -52 * up(a + 3.3),
    neck: 5 * s(a + 1.2), head: -4 * s(a + 1.2), tail: 9 * s(a + 0.4), mane: 7 * s(a + 2.2),
    jHipsY: 6 * s(2 * a + 1), jTorso: 3 * s(2 * a + 1), jUArm: 6 * s(a + 0.5), jFArm: -6 * s(a + 0.5), jHair: 8 * s(2 * a + 2),
  };
}

// ---------- 2D affine [a, b, c, d, e, f] ----------
type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const T = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const S = (x: number, y: number): M => [x, 0, 0, y, 0, 0];
const R = (deg: number): M => { const r = deg * Math.PI / 180; const c = Math.cos(r); const s = Math.sin(r); return [c, s, -s, c, 0, 0]; };

// ---------- loading & recolouring ----------
let base: Promise<Map<string, HTMLImageElement>> | null = null;
function loadBase(): Promise<Map<string, HTMLImageElement>> {
  if (!base) {
    base = Promise.all(Object.entries(URLS).map(([path, url]) => new Promise<[string, HTMLImageElement]>((res, rej) => {
      const img = new Image();
      img.onload = () => res([path.replace(/^.*\//, '').replace('.webp', ''), img]);
      img.onerror = rej;
      img.src = url;
    }))).then((e) => new Map(e));
  }
  return base;
}

const hexRgb = (hex: string): [number, number, number] => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Recolour felt to a new colour while keeping its texture and shading: each pixel's brightness
 * relative to the art's base colour scales the target colour. Only saturated warm felt is
 * changed, so white socks, the blaze, eyes, hooves' shine and brass pins stay as drawn.
 */
function recolour(img: HTMLImageElement, target: string, kind: 'coat' | 'mane' | 'silks' | 'cap', dark = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height);
  const p = id.data;
  const [tr, tg, tb] = hexRgb(target);
  // Base brightness of the art's felt: chestnut coat, brown mane, orange silks.
  const baseL = kind === 'coat' ? 118 : kind === 'mane' ? 72 : 140;
  const keep = target === '';
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    let r = p[i], gg = p[i + 1], b = p[i + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    const warm = r >= gg && gg >= b * 0.85; // reds, oranges, browns
    const brass = gg / (r || 1) > 0.7 && b / (r || 1) < 0.62 && r > 130;
    if (!keep && warm && !brass && sat > 0.28) {
      const k = Math.min(2.2, lum(r, gg, b) / baseL);
      r = tr * k; gg = tg * k; b = tb * k;
    }
    p[i] = Math.min(255, r * dark); p[i + 1] = Math.min(255, gg * dark); p[i + 2] = Math.min(255, b * dark);
  }
  g.putImageData(id, 0, 0);
  return c;
}

type Src = HTMLImageElement | HTMLCanvasElement;

/** The images for one horse + rider, recoloured. Chestnut coats keep the original felt. */
async function partsFor(def: HorseDef, j: Jockey): Promise<Map<string, Src>> {
  const imgs = await loadBase();
  const coat = COATS[def.coat ?? 'bay'];
  const natural = (def.coat ?? 'bay') === 'chestnut';
  const out = new Map<string, Src>();
  for (const p of DRAW_ORDER) {
    const key = p.id;
    const img = imgs.get(p.src!)!;
    const dark = p.far ? 0.72 : 1;
    let src: Src = img;
    if (p.tint === 'coat') src = natural && !p.far ? img : recolour(img, natural ? '' : coat.body, 'coat', dark);
    else if (p.tint === 'mane') src = natural ? img : recolour(img, coat.mane, 'mane');
    else if (p.tint === 'silks') src = recolour(img, j.primary, 'silks');
    else if (p.tint === 'cap') src = recolour(img, j.cap, 'cap');
    out.set(key, src);
  }
  return out;
}

/**
 * Bake `frames` gallop poses for one horse and rider onto canvases sized width × (width·290/320),
 * matching the old sprite box: centred, hooves on 93% of the height, facing right.
 */
export async function puppetFrames(def: HorseDef, j: Jockey, frames: number, width: number): Promise<HTMLCanvasElement[]> {
  const parts = await partsFor(def, j);
  const H = Math.round(width * 290 / 320);
  const k = (0.98 * width) / 1850;
  const root: Vec = [width / 2 - 75 * k, 0.93 * H - 893 * k];
  return Array.from({ length: frames }, (_, f) => {
    const c = document.createElement('canvas');
    c.width = width; c.height = H;
    const g = c.getContext('2d')!;
    const po = pose(f / frames);
    const W = new Map<string, M>();
    for (const p of PARTS) {
      let m: M;
      if (!p.parent) {
        m = mul(T(root[0], root[1] + po.hipsY * k), mul(S(-k, k), R(po.hipsRot)));
      } else {
        const at = p.at ?? [0, 0];
        m = mul(W.get(p.parent)!, T(at[0], at[1] + (p.id === 'jHips' ? po.jHipsY : 0)));
        m = mul(m, R((p.rot ?? 0) + (po[p.id] ?? 0)));
        const s = p.s ?? 1;
        m = mul(m, S(p.flip ? -s : s, s));
        if (p.pivot) m = mul(m, T(-p.pivot[0], -p.pivot[1]));
      }
      W.set(p.id, m);
    }
    for (const p of DRAW_ORDER) {
      const src = parts.get(p.id)!;
      const m = W.get(p.id)!;
      g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
      const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
      g.drawImage(src, 0, 0, w / HALF, h / HALF);
    }
    return c;
  });
}

