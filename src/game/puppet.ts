// Jointed felt puppet horse + jockey, cut from the concept-art parts sheets.
// Each piece turns on a brass pin; a gallop cycle swings the legs, bobs the body
// and sways mane and tail. Pieces are recoloured per horse (coat) and per rider
// (silks, cap), then each pose is baked to a canvas for the broadcast to draw.
import type { HorseDef } from '../sim/types';
import type { Jockey } from './jockey';
import { COATS } from './portrait';
import { DEFAULT_LOOK, type Look } from './horseBody';
import type { HairStyle, SilksPattern } from './jockey';

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
  tint?: 'coat' | 'mane' | 'silks' | 'cap' | 'accent' | 'skin' | 'hair';
  /** Pick the image from the rider (male/female heads). */
  srcFor?: (j: Jockey | null) => string;
  far?: boolean;
  /** Only drawn when the grooming look calls for it. */
  show?: (l: Look, j: Jockey | null) => boolean;
  /** Drawn in code instead of from an image (e.g. hoof polish), in the parent's coordinates. */
  paint?: (g: CanvasRenderingContext2D) => void;
}

// Rider hair: one piece per style, placed on the bald head (head-image px). Hair recolours to the rider's hair colour.
const SIDE_HAIR: Record<string, { at: Vec; s: number }> = {
  short: { at: [-27, -9], s: 1 }, ponytail: { at: [-166, -9], s: 1 }, braids: { at: [-54, -9], s: 1 },
  locs: { at: [-119, -9], s: 1 }, puffs: { at: [-97, -35], s: 1 }, spiky: { at: [-53, -92], s: 1.12 },
  afro: { at: [-96, -94], s: 1.12 }, bun: { at: [-37, -95], s: 1.12 }, bob: { at: [-58, -42], s: 1.12 },
  curlytop: { at: [-68, -95], s: 1.12 }, swoop: { at: [-65, -80], s: 1.12 },
};
const FRONT_HAIR: Record<string, { at: Vec; s: number }> = {
  short: { at: [5, -73], s: 1 }, braids: { at: [-20, -44], s: 1 }, ponytail: { at: [37, -142], s: 1 },
  locs: { at: [-89, -95], s: 1 }, puffs: { at: [-126, -151], s: 1 },
};
// Styles with no front-view art yet borrow the closest one for head-on shots.
const FRONT_STAND_IN: Partial<Record<HairStyle, HairStyle>> = { spiky: 'short', afro: 'puffs', bun: 'ponytail', bob: 'short', curlytop: 'short', swoop: 'short' };
function hairParts(parent: string, prefix: string, set: Record<string, { at: Vec; s: number }>, z: number, map: (h: HairStyle) => HairStyle = (h) => h): Part[] {
  return Object.entries(set).map(([name, h]) => ({
    id: `jHair_${name}`, src: `${prefix}_hair_${name}`, parent, pivot: [0, 0] as Vec, at: h.at, s: h.s, z, tint: 'hair' as const,
    show: (_l: Look, j: Jockey | null) => map(j?.hair ?? 'short') === name,
  }));
}

// Side-on rig. Parts are listed parents-first. The horse is cut facing left; it is flipped at the root.
const SIDE: Part[] = [
  { id: 'hips' },
  { id: 'body', src: 'body', parent: 'hips', pivot: [534, 220], at: [0, 0], z: 10, tint: 'coat' },
  { id: 'tail', src: 'tail', parent: 'body', pivot: [24, 70], at: [860, 118], z: 6, rot: 6, tint: 'mane', show: (l) => l.tail === 'loose' },
  { id: 'tailBraid', src: 'g_tail_braid', parent: 'body', pivot: [40, 95], at: [860, 112], z: 6, s: 0.62, rot: 18, tint: 'mane', show: (l) => l.tail === 'braid' },
  { id: 'tailBun', src: 'g_tail_bun', parent: 'body', pivot: [70, 230], at: [872, 128], z: 6, s: 0.42, tint: 'mane', show: (l) => l.tail === 'bun' },
  { id: 'bowTail', src: 'g_bow', parent: 'body', pivot: [181, 108], at: [872, 108], z: 9, s: 0.42, rot: -10, tint: 'accent', show: (l) => l.bow === 'tail' || l.bow === 'both' },
  { id: 'pad', src: 'g_pad', parent: 'body', pivot: [405, 300], at: [400, 150], z: 15, s: 0.5, tint: 'accent', show: (l) => l.pad },
  { id: 'farHindU', src: 'hind_upper', parent: 'body', pivot: [59, 48], at: [728, 368], z: 3, tint: 'coat', far: true },
  { id: 'farHindL', src: 'hind_lower', parent: 'farHindU', pivot: [301, 330], at: [301, 330], z: 4, tint: 'coat', far: true },
  { id: 'farFrontU', src: 'front_upper', parent: 'body', pivot: [216, 51], at: [168, 342], z: 3, tint: 'coat', far: true },
  { id: 'farFrontL', src: 'front_lower', parent: 'farFrontU', pivot: [78, 341], at: [78, 341], z: 4, tint: 'coat', far: true },
  { id: 'neck', src: 'neck', parent: 'body', pivot: [244, 310], at: [163, 89], z: 8, rot: -6, tint: 'coat' },
  { id: 'mane', src: 'mane', parent: 'neck', pivot: [22, 58], at: [110, 20], z: 12, s: 0.9, rot: 14, tint: 'mane', show: (l) => l.mane === 'loose' },
  { id: 'maneRun', src: 'g_mane_running', parent: 'neck', pivot: [40, 70], at: [78, 12], z: 12, s: 0.44, rot: 6, tint: 'mane', show: (l) => l.mane === 'running' },
  { id: 'maneBtn', src: 'g_mane_buttons', parent: 'neck', pivot: [30, 70], at: [80, 8], z: 12, s: 0.52, rot: 14, tint: 'mane', show: (l) => l.mane === 'buttons' },
  { id: 'maneLocs', src: 'g_mane_locs', parent: 'neck', pivot: [70, 50], at: [84, 10], z: 12, s: 0.5, rot: 4, tint: 'mane', show: (l) => l.mane === 'locs' },
  { id: 'bowMane', src: 'g_bow', parent: 'neck', pivot: [181, 108], at: [300, 205], z: 13, s: 0.4, rot: 20, tint: 'accent', show: (l) => l.bow === 'mane' || l.bow === 'both' },
  { id: 'head', src: 'head', parent: 'neck', pivot: [350, 300], at: [69, 91], z: 11, s: 0.92, rot: 6, tint: 'coat' },
  { id: 'forelock', src: 'g_forelock', parent: 'head', pivot: [60, 40], at: [300, 70], z: 11.5, s: 0.62, rot: -10, flip: true, tint: 'mane', show: (l) => l.forelock === 'braid' },
  { id: 'crown', src: 'g_crown', parent: 'head', pivot: [330, 330], at: [310, 150], z: 11.6, s: 0.36, rot: -14, show: (l) => l.crown },
  { id: 'shoulder', src: 'shoulder', parent: 'body', pivot: [128, 249], at: [147, 348], z: 12, tint: 'coat' },
  { id: 'hindU', src: 'hind_upper', parent: 'body', pivot: [59, 48], at: [743, 377], z: 14, tint: 'coat' },
  { id: 'hindL', src: 'hind_lower', parent: 'hindU', pivot: [301, 330], at: [301, 330], z: 15, tint: 'coat' },
  { id: 'frontU', src: 'front_upper', parent: 'body', pivot: [216, 51], at: [147, 348], z: 14, tint: 'coat' },
  { id: 'frontL', src: 'front_lower', parent: 'frontU', pivot: [78, 341], at: [78, 341], z: 15, tint: 'coat' },
  // Leg wraps and hoof polish ride on each lower leg.
  ...(['frontL', 'farFrontL', 'hindL', 'farHindL'] as const).flatMap((leg) => {
    const front = leg.toLowerCase().includes('front');
    const far = leg.startsWith('far');
    const z = far ? 4.5 : 15.5;
    const hoof: Vec = front ? [69, 680] : [288, 668];
    return [
      { id: `${leg}Wrap`, src: 'g_wrap', parent: leg, pivot: [165, 215], at: front ? [82, 515] : [298, 505], z, s: 0.4, far, show: (l: Look) => l.wraps } as Part,
      { id: `${leg}Gloss`, parent: leg, z: z + 0.1, show: (l: Look) => l.polish, paint: (g: CanvasRenderingContext2D) => {
        g.fillStyle = 'rgba(255,251,242,0.85)'; g.beginPath(); g.ellipse(hoof[0] - 14, hoof[1] - 8, 26, 10, -0.3, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,214,90,0.5)'; g.beginPath(); g.ellipse(hoof[0] + 20, hoof[1] + 4, 12, 6, -0.3, 0, Math.PI * 2); g.fill();
      } } as Part,
    ];
  }),
  { id: 'saddle', src: 'saddle', parent: 'body', pivot: [175, 70], at: [440, 34], z: 16, s: 0.78 },
  // Jockey (cut facing right, so flipped again to ride the same way as the horse).
  { id: 'jHips', parent: 'body', at: [470, -46], s: 0.62, flip: true },
  { id: 'jThigh', src: 'j_thigh', parent: 'jHips', pivot: [86, 114], at: [0, 0], z: 22, rot: -84 },
  { id: 'jShin', src: 'j_shin', parent: 'jThigh', pivot: [76, 52], at: [48, 336], z: 21, rot: 112, s: 0.85 },
  { id: 'jBoot', src: 'j_boot', parent: 'jShin', pivot: [92, 56], at: [76, 339], z: 23, rot: -26, s: 0.8 },
  { id: 'jTorso', src: 'j_torso', parent: 'jHips', pivot: [170, 462], at: [0, 0], z: 20, rot: 56, tint: 'silks' },
  { id: 'jHead', src: 'js_head_male', srcFor: (j) => `js_head_${j?.body ?? 'male'}`, parent: 'jTorso', pivot: [168, 535], at: [175, 40], z: 19, rot: -46, s: 0.7, tint: 'skin' },
  ...hairParts('jHead', 'js', SIDE_HAIR, 19.5),
  { id: 'jCap', src: 'j_cap', parent: 'jHead', pivot: [235, 255], at: [212, 150], z: 24, s: 1, rot: 4, tint: 'cap' },
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
  { id: 'jHead', src: 'jf_head_male', srcFor: (j) => `jf_head_${j?.body ?? 'male'}`, parent: 'jTorso', pivot: [174, 440], at: [383, 40], z: 5, s: 1.05, tint: 'skin' },
  ...hairParts('jHead', 'jf', FRONT_HAIR, 5.5, (h) => FRONT_STAND_IN[h] ?? h),
  { id: 'jCap', src: 'fj_cap', parent: 'jHead', pivot: [195, 270], at: [174, 125], z: 6, s: 0.85, tint: 'cap' },
  { id: 'head', src: 'f_head', parent: 'chest', pivot: [132, 300], at: [205, 260], z: 12, tint: 'coat' },
  { id: 'legL', src: 'f_leg_l', parent: 'chest', pivot: [62, 49], at: [78, 690], z: 14, tint: 'coat' },
  { id: 'legR', src: 'f_leg_r', parent: 'chest', pivot: [105, 50], at: [335, 690], z: 14, tint: 'coat' },
];
// Walking away: the rump fills the view, the head peeks over it, the front legs further back.
const BACK: Part[] = [
  { id: 'hips' },
  { id: 'rump', src: 'b_rump', parent: 'hips', pivot: [301, 300], at: [0, 0], z: 10, tint: 'coat' },
  { id: 'head', src: 'b_head', parent: 'rump', pivot: [158, 480], at: [301, 95], z: 2, s: 0.6, tint: 'coat' },
  { id: 'frontL', src: 'b_front', parent: 'rump', pivot: [68, 47], at: [205, 560], z: 1, s: 0.72, tint: 'coat', far: true },
  { id: 'frontR', src: 'b_front', parent: 'rump', pivot: [68, 47], at: [380, 560], z: 1, s: 0.72, tint: 'coat', far: true },
  { id: 'legL', src: 'b_leg_l', parent: 'rump', pivot: [137, 777], at: [137, 777], z: 12, tint: 'coat' },
  { id: 'legR', src: 'b_leg_r', parent: 'rump', pivot: [449, 777], at: [449, 777], z: 12, tint: 'coat' },
  { id: 'tail', src: 'b_tail', parent: 'rump', pivot: [60, 20], at: [250, 60], z: 14, tint: 'mane' },
];
const drawOrder = (parts: Part[]) => parts.filter((p) => p.src || p.paint).sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

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
    ...(mode === 'stand' ? STAND_FAR : {}),
  };
}
const REST = { frontU: -16, frontL: 14, farFrontU: -16, farFrontL: 14, hindU: 18, farHindU: 18 };
// Standing still, the far legs stand a little apart from the near ones so all four hooves show.
const STAND_FAR = { farFrontU: 4, farFrontL: 4, farHindU: 32, farHindL: -6 };
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

/** Walking away: hind feet lift and fold away from the camera, tail swishes, head nods. */
function backPose(ph: number, mode: PuppetMode = 'walk'): Pose {
  const a = ph * Math.PI * 2;
  const s = Math.sin;
  const up = (x: number) => Math.max(0, s(x));
  const k = mode === 'gallop' ? 1 : mode === 'walk' ? 0.5 : 0;
  const leg = (id: string, off: number, lift: number) => ({ [`${id}.y`]: -lift * k * up(a + off), [`${id}.sy`]: 1 - 0.3 * k * up(a + off) });
  return {
    'hips.y': -10 * k * Math.abs(s(a)), hips: 2 * k * s(a),
    ...leg('legL', 0, 110), ...leg('legR', Math.PI, 110), ...leg('frontL', Math.PI / 2, 70), ...leg('frontR', -Math.PI / 2, 70),
    tail: 8 * s(a + 0.5), 'head.y': 10 * k * s(2 * a),
  };
}

interface Rig { parts: Part[]; pose: (ph: number, mode?: PuppetMode) => Pose; flip: boolean; fit: (W: number, H: number, base: number) => { k: number; root: Vec } }
const RIGS = {
  side: { parts: SIDE, pose: sidePose, flip: true, fit: (W: number, H: number, base: number) => { const k = (0.98 * W) / 1850; return { k, root: [W / 2 - 75 * k, base * H - 893 * k] as Vec }; } },
  back: { parts: BACK, pose: backPose, flip: false, fit: (W: number, H: number, base: number) => { const k = (0.9 * H) / 1340; return { k, root: [W / 2, base * H - 886 * k] as Vec }; } },
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
type Kind = 'coat' | 'mane' | 'silks' | 'cap' | 'accent' | 'skin' | 'hair';
function recolour(img: HTMLImageElement, target: string, kind: Kind, dark = 1, alt?: { target: string; mask: Uint8ClampedArray }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height);
  const p = id.data;
  const [tr, tg, tb] = hexRgb(target);
  // Base brightness of the art's felt: chestnut coat, brown mane, orange silks.
  const baseL = kind === 'coat' ? 118 : kind === 'mane' ? 72 : kind === 'accent' ? 88 : kind === 'skin' ? 112 : kind === 'hair' ? 46 : 140;
  const [ar, ag, ab] = alt ? hexRgb(alt.target) : [0, 0, 0];
  const keep = target === '';
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    let r = p[i], gg = p[i + 1], b = p[i + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    const warm = r >= gg && gg >= b * 0.85; // reds, oranges, browns
    const brass = gg / (r || 1) > 0.7 && b / (r || 1) < 0.62 && r > 130;
    // Accents (bows, pads) are dyed red felt: any strongly coloured pixel takes the new colour.
    const L = lum(r, gg, b);
    // Hair is near-black felt; skin is warm but not the pink lips or white eyes.
    const dyed = kind === 'accent' ? sat > 0.45 && mx > 90
      : kind === 'hair' ? L < 140 && sat < 0.5
      : kind === 'skin' ? warm && sat > 0.2 && L > 45
      : warm && !brass && sat > 0.28;
    if (!keep && dyed) {
      const k = Math.min(2.2, L / baseL);
      const useAlt = alt && alt.mask[i + 3] > 128;
      r = (useAlt ? ar : tr) * k; gg = (useAlt ? ag : tg) * k; b = (useAlt ? ab : tb) * k;
    }
    p[i] = Math.min(255, r * dark); p[i + 1] = Math.min(255, gg * dark); p[i + 2] = Math.min(255, b * dark);
  }
  g.putImageData(id, 0, 0);
  return c;
}

/** Where the second silks colour goes, as an alpha mask the size of the piece. */
function patternMask(pattern: SilksPattern, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#000'; g.strokeStyle = '#000';
  const u = Math.max(w, h);
  if (pattern === 'hoops') for (let y = h * 0.12; y < h; y += h / 4) g.fillRect(0, y, w, h / 9);
  if (pattern === 'stripes') for (let x = w * 0.08; x < w; x += w / 5) g.fillRect(x, 0, w / 11, h);
  if (pattern === 'halves') g.fillRect(w / 2, 0, w / 2, h);
  if (pattern === 'sash') { g.lineWidth = u / 5; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.stroke(); }
  if (pattern === 'quarters') { g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); }
  if (pattern === 'checks') { const s = u / 6; for (let y = 0, r = 0; y < h; y += s, r++) for (let x = (r % 2) * s; x < w; x += s * 2) g.fillRect(x, y, s, s); }
  if (pattern === 'spots') { const s = u / 4; for (let y = s / 2, r = 0; y < h + s; y += s * 0.8, r++) for (let x = (r % 2) * s / 2; x < w + s; x += s) { g.beginPath(); g.arc(x, y, s * 0.22, 0, Math.PI * 2); g.fill(); } }
  if (pattern === 'bolt') { g.beginPath(); g.moveTo(w * 0.62, 0); g.lineTo(w * 0.3, h * 0.55); g.lineTo(w * 0.52, h * 0.55); g.lineTo(w * 0.38, h); g.lineTo(w * 0.78, h * 0.4); g.lineTo(w * 0.55, h * 0.4); g.lineTo(w * 0.75, 0); g.closePath(); g.fill(); }
  if (pattern === 'chevron') {
    g.lineWidth = u / 12;
    for (let y = -h * 0.2; y < h; y += h / 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(w / 2, y + w * 0.3); g.lineTo(w, y); g.stroke(); }
  }
  if (pattern === 'diamonds' || pattern === 'stars') {
    const step = u / 4;
    for (let row = 0, y = step / 2; y < h + step; y += step * 0.85, row++) {
      for (let x = (row % 2) * step / 2; x < w + step; x += step) {
        g.beginPath();
        const r = step * (pattern === 'stars' ? 0.3 : 0.36);
        const n = pattern === 'stars' ? 10 : 4;
        for (let k = 0; k < n; k++) {
          const a = -Math.PI / 2 + (k * Math.PI * 2) / n;
          const rr = pattern === 'stars' && k % 2 ? r * 0.45 : r;
          g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
        }
        g.closePath(); g.fill();
      }
    }
  }
  return g.getImageData(0, 0, w, h).data;
}

type Src = HTMLImageElement | HTMLCanvasElement;

/** The images for one horse + rider, recoloured. Chestnut coats keep the original felt. */
async function partsFor(def: HorseDef, j: Jockey | null, order: Part[], look: Look = DEFAULT_LOOK): Promise<Map<string, Src>> {
  const imgs = await loadBase();
  const coat = COATS[def.coat ?? 'bay'];
  const natural = (def.coat ?? 'bay') === 'chestnut';
  const out = new Map<string, Src>();
  for (const p of order) {
    const key = p.id;
    if (!p.src) continue;
    if (p.show && !p.show(look, j)) continue;
    const img = imgs.get(p.srcFor ? p.srcFor(j) : p.src)!;
    const dark = p.far ? 0.72 : 1;
    let src: Src = img;
    if (p.tint === 'coat') src = natural && !p.far ? img : recolour(img, natural ? '' : coat.body, 'coat', dark);
    else if (p.tint === 'mane') src = natural ? img : recolour(img, coat.mane, 'mane');
    else if (p.tint === 'silks') src = recolour(img, j?.primary ?? '#D96C2C', 'silks', 1, j && j.pattern !== 'solid' ? { target: j.secondary, mask: patternMask(j.pattern, img.naturalWidth, img.naturalHeight) } : undefined);
    else if (p.tint === 'skin') src = j ? recolour(img, j.skin, 'skin') : img;
    else if (p.tint === 'hair') src = recolour(img, j?.hairColor ?? '#1E1714', 'hair');
    else if (p.tint === 'cap') src = recolour(img, j?.cap ?? '#D96C2C', 'cap');
    else if (p.tint === 'accent') src = recolour(img, (p.id === 'pad' ? look.padColor ?? '' : look.bowColor) || def.color, 'accent', dark);
    else if (p.far) src = recolour(img, '', 'coat', dark);
    out.set(key, src);
  }
  return out;
}

/** World matrix of every part for one pose. */
function poseWorld(rig: Rig, ph: number, mode: PuppetMode, k: number, root: Vec): Map<string, M> {
  const po = rig.pose(ph, mode);
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
  return world;
}

function bake(rig: Rig, parts: Map<string, Src>, order: Part[], frames: number, W: number, H: number, mode: PuppetMode, base: number, look: Look = DEFAULT_LOOK, j: Jockey | null = null): HTMLCanvasElement[] {
  const { k, root } = rig.fit(W, H, base);
  return Array.from({ length: frames }, (_, f) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const world = poseWorld(rig, f / frames, mode, k, root);
    for (const p of order) {
      if (p.show && !p.show(look, j)) continue;
      const m = world.get(p.id)!;
      g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      if (p.paint) { g.save(); p.paint(g); g.restore(); continue; }
      const src = parts.get(p.id)!;
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
  /** Grooming look (mane, tail, bows, extras); defaults to the horse's own. */
  look?: Look;
}

/**
 * Bake `frames` side-on poses for one horse (and rider, if given) onto canvases sized
 * width × (width·290/320): centred, facing right, hooves on 93% of the height by default.
 */
export async function puppetFrames(def: HorseDef, j: Jockey | null, frames: number, width: number, o: PuppetOpts = {}): Promise<HTMLCanvasElement[]> {
  const order = orderFor(SIDE, !!j);
  const look = { ...DEFAULT_LOOK, ...(o.look ?? def.look ?? {}) };
  return bake(RIGS.side, await partsFor(def, j, order, look), order, frames, width, Math.round(width * 290 / 320), o.mode ?? 'gallop', o.base ?? 0.93, look, j);
}

/** Head-on poses, width × height, hooves on 96% of the height by default. */
export async function puppetFrontFrames(def: HorseDef, j: Jockey | null, frames: number, width: number, height: number, o: PuppetOpts = {}): Promise<HTMLCanvasElement[]> {
  const order = orderFor(FRONT, !!j);
  return bake(RIGS.front, await partsFor(def, j, order), order, frames, width, height, o.mode ?? 'gallop', o.base ?? 0.96, DEFAULT_LOOK, j);
}

/** Walking-away poses (no rider), width × height, hooves on 96% of the height by default. */
export async function puppetBackFrames(def: HorseDef, frames: number, width: number, height: number, o: PuppetOpts = {}): Promise<HTMLCanvasElement[]> {
  const order = orderFor(BACK, false);
  return bake(RIGS.back, await partsFor(def, null, order), order, frames, width, height, o.mode ?? 'walk', o.base ?? 0.96);
}

/**
 * Where the four hooves sit on a standing side-on puppet baked at `width` (canvas px):
 * near front, far front, near hind, far hind. For tap targets (picking hooves).
 */
export function puppetHoofPoints(width: number, base = 0.93): Vec[] {
  const H = Math.round(width * 290 / 320);
  const { k, root } = RIGS.side.fit(width, H, base);
  const world = poseWorld(RIGS.side, 0, 'stand', k, root);
  const at = (id: string, p: Vec): Vec => { const m = world.get(id)!; return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; };
  return [at('frontL', [69, 680]), at('farFrontL', [69, 680]), at('hindL', [288, 668]), at('farHindL', [288, 668])];
}
