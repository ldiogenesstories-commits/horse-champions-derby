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
  /** Extra vertical squash (front view foreshortening). */
  sy?: number;
  flip?: boolean;
  /** How to recolour: coat, mane, silks, cap, or keep the art as is. */
  tint?: 'coat' | 'mane' | 'silks' | 'cap';
  far?: boolean;
}

// Side-on rig. Parts are listed parents-first. The horse is cut facing left; it is flipped at the root.
const SIDE: Part[] = [
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
// Head-on rig: the horse charging at the camera, rider crouched behind the head.
const FRONT: Part[] = [
  { id: 'hips' },
  { id: 'chest', src: 'f_chest', parent: 'hips', pivot: [205, 420], at: [0, 0], z: 10, tint: 'coat' },
  { id: 'hindL', src: 'f_leg_l', parent: 'chest', pivot: [62, 49], at: [118, 722], z: 1, s: 0.82, tint: 'coat', far: true },
  { id: 'hindR', src: 'f_leg_r', parent: 'chest', pivot: [105, 50], at: [292, 722], z: 1, s: 0.82, tint: 'coat', far: true },
  { id: 'bootL', src: 'fj_boot_l', parent: 'chest', pivot: [180, 52], at: [22, 420], z: 2, s: 0.45 },
  { id: 'bootR', src: 'fj_boot_r', parent: 'chest', pivot: [88, 51], at: [388, 420], z: 2, s: 0.45 },
  { id: 'jHips', parent: 'chest', at: [205, 70], s: 0.5 },
  { id: 'jTorso', src: 'fj_torso', parent: 'jHips', pivot: [383, 440], at: [0, 0], z: 3, tint: 'silks' },
  { id: 'jForeL', src: 'fj_forearm_l', parent: 'jTorso', pivot: [58, 319], at: [80, 300], z: 4, rot: -40, tint: 'silks' },
  { id: 'jForeR', src: 'fj_forearm_r', parent: 'jTorso', pivot: [213, 310], at: [690, 300], z: 4, rot: 40, tint: 'silks' },
  { id: 'jGloveL', src: 'fj_glove_l', parent: 'jForeL', pivot: [75, 15], at: [60, 505], z: 11 },
  { id: 'jGloveR', src: 'fj_glove_r', parent: 'jForeR', pivot: [71, 15], at: [215, 500], z: 11 },
  { id: 'jHead', src: 'fj_head', parent: 'jTorso', pivot: [233, 470], at: [383, 40], z: 5, s: 0.9 },
  { id: 'jCap', src: 'fj_cap', parent: 'jHead', pivot: [195, 270], at: [233, 150], z: 6, s: 0.95, tint: 'cap' },
  { id: 'head', src: 'f_head', parent: 'chest', pivot: [132, 300], at: [205, 260], z: 12, tint: 'coat' },
  { id: 'legL', src: 'f_leg_l', parent: 'chest', pivot: [62, 49], at: [78, 690], z: 14, tint: 'coat' },
  { id: 'legR', src: 'f_leg_r', parent: 'chest', pivot: [105, 50], at: [335, 690], z: 14, tint: 'coat' },
];
const drawOrder = (parts: Part[]) => parts.filter((p) => p.src).sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

export type PuppetMode = 'gallop' | 'walk' | 'stand' | 'graze' | 'lie';
type Pose = Record<string, number>;

/** Side-on joint angles (degrees; `.y` = lift in px) for a point in the cycle, ph in [0, 1). */
function sidePose(ph: number, mode: PuppetMode = 'gallop'): Pose {
  const a = ph * Math.PI * 2;
  const s = Math.sin;
  const up = (x: number) => Math.max(0, s(x));
  if (mode === 'graze') {
    return { ...REST, neck: GRAZE.neck + 2 * s(a), 'neck.x': GRAZE.x, 'neck.y': GRAZE.y, head: GRAZE.head + 3 * s(a * 2), mane: GRAZE.mane, tail: 6 * s(a) };
  }
  if (mode === 'lie') {
    return { ...LIE, tail: LIE.tail + 4 * s(a), neck: LIE.neck + 2 * s(a) };
  }
  // Gallop at full stride; walk is the same cycle, gentler; stand is its rest pose.
  const k = mode === 'gallop' ? 1 : mode === 'walk' ? 0.42 : 0;
  const lift = mode === 'gallop' ? 1 : 0.3;
  // Out of a gallop the legs come back under the body.
  const r = mode === 'gallop' ? { frontU: 4, frontL: 0, hindU: -4 } : REST;
  return {
    'hips.y': -16 * lift * k * Math.abs(s(a)), hips: 4.5 * k * s(a + 0.6),
    frontU: r.frontU + 40 * k * s(a), frontL: r.frontL + 62 * k * up(a + 1.6),
    farFrontU: r.frontU + 40 * k * s(a - 0.7), farFrontL: r.frontL + 62 * k * up(a + 0.9),
    hindU: r.hindU - 36 * k * s(a + 2.4), hindL: -52 * k * up(a + 4.0),
    farHindU: r.hindU - 36 * k * s(a + 1.7), farHindL: -52 * k * up(a + 3.3),
    neck: 5 * k * s(a + 1.2), head: -4 * k * s(a + 1.2), tail: (mode === 'stand' ? 3 : 9 * k) * s(a + 0.4), mane: 7 * k * s(a + 2.2),
    'jHips.y': 6 * k * s(2 * a + 1), jTorso: 3 * k * s(2 * a + 1), jUArm: 6 * k * s(a + 0.5), jFArm: -6 * k * s(a + 0.5), jHair: 8 * k * s(2 * a + 2),
  };
}
const REST = { frontU: -16, frontL: 14, farFrontU: -16, farFrontL: 14, hindU: 18, farHindU: 18 };
const GRAZE = { neck: -80, head: 18, mane: 16, x: -150, y: 70 };
const LIE = { 'hips.y': 300, hips: 0, frontU: -78, frontL: 150, farFrontU: -70, farFrontL: 140, hindU: 82, hindL: -150, farHindU: 76, farHindL: -140, neck: 8, head: 4, tail: 20, mane: 0 };

/** Head-on: legs lift and fold toward the camera (shorter as they come up), head and rider bob. */
function frontPose(ph: number, mode: PuppetMode = 'gallop'): Pose {
  const a = ph * Math.PI * 2;
  const s = Math.sin;
  const up = (x: number) => Math.max(0, s(x));
  const k = mode === 'gallop' ? 1 : mode === 'walk' ? 0.4 : 0;
  const leg = (id: string, off: number, lift: number, out: number) => ({
    [`${id}.y`]: -lift * k * up(a + off), [`${id}.sy`]: 1 - 0.24 * k * up(a + off), [id]: out * k * up(a + off),
  });
  return {
    'hips.y': -18 * k * Math.abs(s(a)), hips: 1.5 * k * s(a + 0.6),
    ...leg('legL', 0, 120, 7), ...leg('legR', mode === 'gallop' ? 0.9 : Math.PI, 120, -7),
    ...leg('hindL', 2.3, 70, 4), ...leg('hindR', 3.2, 70, -4),
    'head.y': 14 * k * s(a + 1.2), head: 2 * k * s(a),
    'jHips.y': 8 * k * s(2 * a + 1), 'bootL.y': 6 * k * s(2 * a + 1), 'bootR.y': 6 * k * s(2 * a + 1),
  };
}

interface Rig { parts: Part[]; pose: (ph: number, mode?: PuppetMode) => Pose; flip: boolean; fit: (W: number, H: number, base: number) => { k: number; root: Vec } }
const RIGS = {
  side: { parts: SIDE, pose: sidePose, flip: true, fit: (W: number, H: number, base: number) => { const k = (0.98 * W) / 1850; return { k, root: [W / 2 - 75 * k, base * H - 893 * k] as Vec }; } },
  front: { parts: FRONT, pose: frontPose, flip: false, fit: (W: number, H: number, base: number) => { const k = (0.9 * H) / 1800; return { k, root: [W / 2, base * H - 1023 * k] as Vec }; } },
} satisfies Record<string, Rig>;

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
async function partsFor(def: HorseDef, j: Jockey | null, order: Part[]): Promise<Map<string, Src>> {
  const imgs = await loadBase();
  const coat = COATS[def.coat ?? 'bay'];
  const natural = (def.coat ?? 'bay') === 'chestnut';
  const out = new Map<string, Src>();
  for (const p of order) {
    const key = p.id;
    const img = imgs.get(p.src!)!;
    const dark = p.far ? 0.72 : 1;
    let src: Src = img;
    if (p.tint === 'coat') src = natural && !p.far ? img : recolour(img, natural ? '' : coat.body, 'coat', dark);
    else if (p.tint === 'mane') src = natural ? img : recolour(img, coat.mane, 'mane');
    else if (p.tint === 'silks') src = recolour(img, j?.primary ?? '#D96C2C', 'silks');
    else if (p.tint === 'cap') src = recolour(img, j?.cap ?? '#D96C2C', 'cap');
    out.set(key, src);
  }
  return out;
}

function bake(rig: Rig, parts: Map<string, Src>, order: Part[], frames: number, W: number, H: number, mode: PuppetMode, base: number): HTMLCanvasElement[] {
  const { k, root } = rig.fit(W, H, base);
  return Array.from({ length: frames }, (_, f) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const po = rig.pose(f / frames, mode);
    const get = (key: string, d = 0) => po[key] ?? d;
    const world = new Map<string, M>();
    for (const p of rig.parts) {
      let m: M;
      if (!p.parent) {
        m = mul(T(root[0], root[1] + get('hips.y') * k), mul(S(rig.flip ? -k : k, k), R(get('hips'))));
      } else {
        const at = p.at ?? [0, 0];
        m = mul(world.get(p.parent)!, T(at[0] + get(`${p.id}.x`), at[1] + get(`${p.id}.y`)));
        m = mul(m, R((p.rot ?? 0) + get(p.id)));
        const s = p.s ?? 1;
        m = mul(m, S(p.flip ? -s : s, s * (p.sy ?? 1) * get(`${p.id}.sy`, 1)));
        if (p.pivot) m = mul(m, T(-p.pivot[0], -p.pivot[1]));
      }
      world.set(p.id, m);
    }
    for (const p of order) {
      const src = parts.get(p.id)!;
      const m = world.get(p.id)!;
      g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
      const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
      g.drawImage(src, 0, 0, w / HALF, h / HALF);
    }
    return c;
  });
}

/** Rider pieces (jockey, boots) and tack only appear when there is a rider. */
const isTack = (p: Part) => /^(j[A-Z]|boot|saddle)/.test(p.id);
const orderFor = (parts: Part[], rider: boolean) => drawOrder(parts).filter((p) => rider || !isTack(p));

export interface PuppetOpts {
  mode?: PuppetMode;
  /** Where the hooves sit, as a fraction of the height. */
  base?: number;
}

/**
 * Bake `frames` side-on poses for one horse (and rider, if given) onto canvases sized
 * width × (width·290/320): centred, facing right, hooves on 93% of the height by default.
 */
export async function puppetFrames(def: HorseDef, j: Jockey | null, frames: number, width: number, o: PuppetOpts = {}): Promise<HTMLCanvasElement[]> {
  const order = orderFor(SIDE, !!j);
  return bake(RIGS.side, await partsFor(def, j, order), order, frames, width, Math.round(width * 290 / 320), o.mode ?? 'gallop', o.base ?? 0.93);
}

/** Head-on poses, width × height, hooves on 96% of the height by default. */
export async function puppetFrontFrames(def: HorseDef, j: Jockey | null, frames: number, width: number, height: number, o: PuppetOpts = {}): Promise<HTMLCanvasElement[]> {
  const order = orderFor(FRONT, !!j);
  return bake(RIGS.front, await partsFor(def, j, order), order, frames, width, height, o.mode ?? 'gallop', o.base ?? 0.96);
}
