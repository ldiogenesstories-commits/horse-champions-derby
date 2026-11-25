// The Ranch: a paper-craft pasture (about three screens wide) seen from a high
// three-quarter angle. Your horse roams it freely; walking up to a station (the barn,
// feed trough, shade tree, training gate) offers a portal to that part of the game.
// Steering: an on-screen thumb stick (or tap-to-go), plus arrow keys / WASD.
import type { HorseDef } from '../sim/types';
import type { Look } from './horseBody';
import { puppetBackFrames, puppetFrames, puppetFrontFrames } from './puppet';
import { RanchLife } from './ranchLife';
import type { FriendId } from './critters';

const INK = '#2B2118';
const PAPER = '#FFFBF2';

// World: x across (0..W), y = depth into the pasture (0 = back fence side, D = front).
const W = 2400;
const D = 900;
const TILT = 0.6; // how much depth is squashed on screen (high three-quarter view)
const TOP = 230; // backdrop height above the back fence, in screen-world units
const FENCE = { x0: 50, x1: 2350, y0: 70, y1: 870 };
const HORSE_R = 34;

const SIDE_FRAMES = 8;
const FB_FRAMES = 6;
const SIDE_W = 170; // world-screen width of the side sprite
const K = SIDE_W / 320; // svg px -> world-screen units

export type StationId = 'barn' | 'feed' | 'shade' | 'train';
export interface Station { id: StationId; x: number; y: number; label: string; hint: string }
export const STATIONS: Station[] = [
  { id: 'barn', x: 330, y: 205, label: 'Barn', hint: 'Grooming, jockey, treats & more' },
  { id: 'feed', x: 700, y: 300, label: 'Feed trough', hint: 'Feed your horse · 1 action' },
  { id: 'shade', x: 1290, y: 330, label: 'Shade tree', hint: 'Rest in the shade · 1 action' },
  { id: 'train', x: 2250, y: 470, label: 'Training grounds', hint: 'Mini-game drills · 1 action' },
];

type Facing = 'right' | 'left' | 'front' | 'back';
export type Cutscene = 'rest' | 'gate' | 'feed';
interface Scene { kind: Cutscene; stage: 'walk' | 'act' | 'exit'; t: number; goal: { x: number; y: number; face: Facing } | null; done: () => void; fired: boolean }
type Gait = 'stand' | 'walk' | 'trot' | 'canter';
const GAIT_SPEED: Record<Exclude<Gait, 'stand'>, number> = { walk: 95, trot: 185, canter: 300 };
const STRIDE: Record<Gait, number> = { stand: 1, walk: 80, trot: 105, canter: 140 };

interface Circle { x: number; y: number; r: number }
const OBSTACLES: Circle[] = [
  { x: 700, y: 245, r: 60 }, // trough
  { x: 1290, y: 245, r: 34 }, // tree trunk
];
// Hay bales and the pond can be jumped with a running start (a canter).
const BALES: { x: number; y: number }[] = [{ x: 960, y: 140 }, { x: 1030, y: 160 }, { x: 520, y: 640 }, { x: 1080, y: 720 }, { x: 2000, y: 560 }];
const BALE_R = 46;
const POND = { x: 1720, y: 660, rx: 125, ry: 75 };
const JUMP_SPEED = 230; // need at least this much pace to take off
const JUMP_MAX = 380; // longest leap
const BARN = { x0: 140, x1: 520, y0: 60, y1: 160 };

// Deterministic scatter for grass tufts and flowers.
function rng(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

export interface RanchHooks {
  /** The horse is standing at a station (or left it: null). */
  onNear(st: Station | null): void;
  onGait?(g: Gait): void;
  /** A short caption (critters playing with your horse). */
  onToast?(text: string): void;
}

// Sky through the day: sunrise, late morning, afternoon, golden evening (top, horizon).
const SKY: [number, string, string][] = [
  [0, '#F4B8A0', '#FCE6C8'],
  [0.34, '#8FBFD3', '#E3EFF2'],
  [0.67, '#7FB3CF', '#EDEFD8'],
  [1, '#D97F5E', '#F8C987'],
];
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}
function skyAt(t: number): [string, string] {
  for (let i = 1; i < SKY.length; i++) {
    if (t <= SKY[i][0]) { const [a0, top0, hz0] = SKY[i - 1]; const [a1, top1, hz1] = SKY[i]; const k = (t - a0) / (a1 - a0); return [mix(top0, top1, k), mix(hz0, hz1, k)]; }
  }
  return [SKY[SKY.length - 1][1], SKY[SKY.length - 1][2]];
}

export class Ranch {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private side: CanvasImageSource[] = [];
  private run: CanvasImageSource[] = [];
  private stand: CanvasImageSource | null = null;
  private graze: CanvasImageSource | null = null;
  private front: CanvasImageSource[] = [];
  private back: CanvasImageSource[] = [];
  private spriteKey = '';
  private raf = 0;
  private last = 0;
  // Horse state
  x = 900; y = 520;
  private heading = 0; // radians, 0 = +x (screen right)
  private speed = 0;
  private phase = 0;
  private facing: Facing = 'right';
  private gait: Gait = 'stand';
  private still = 0; // seconds without input
  private paw = 0;
  private near: Station | null = null;
  private jump: { t: number; dur: number; h: number } | null = null;
  private scene: Scene | null = null;
  private lieImg: CanvasImageSource | null = null;
  private fade = 0; // 0..1 paper wipe / dusk dim
  private dim = 0;
  private bits: { x: number; y: number; vx: number; vy: number; life: number; txt?: string; c?: string }[] = [];
  // Input
  private stick = { x: 0, y: 0 };
  private keys = new Set<string>();
  private target: { x: number; y: number } | null = null;
  tapMode = false;
  // Camera (world-screen units)
  private camX = 0;
  private camY = 0;
  private camInit = false;
  private k = 1;
  private dust: { x: number; y: number; r: number; life: number }[] = [];
  private tufts: { x: number; y: number; s: number; c: string }[] = [];
  private flowers: { x: number; y: number; c: string }[] = [];
  private clouds: { x: number; y: number; s: number }[] = [];
  private hooks: RanchHooks;
  private life: RanchLife;
  private horseName = 'your horse';
  private tod = 0; // time of day shown (eases toward todTarget)
  private todTarget = 0;

  constructor(private host: HTMLElement, hooks: RanchHooks) {
    this.hooks = hooks;
    this.life = new RanchLife((t) => this.hooks.onToast?.(t), () => this.horseName);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'rn-canvas';
    host.prepend(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    const r = rng(7);
    for (let i = 0; i < 260; i++) this.tufts.push({ x: FENCE.x0 + r() * (FENCE.x1 - FENCE.x0), y: FENCE.y0 + 20 + r() * (FENCE.y1 - FENCE.y0 - 20), s: 0.7 + r() * 0.6, c: r() < 0.5 ? '#5E9B5A' : '#6FAE66' });
    const fc = ['#FFFBF2', '#F7A8B8', '#FFD23F', '#9CC3D5'];
    for (let i = 0; i < 70; i++) this.flowers.push({ x: FENCE.x0 + r() * (FENCE.x1 - FENCE.x0), y: FENCE.y0 + 40 + r() * (FENCE.y1 - FENCE.y0 - 40), c: fc[i % fc.length] });
    for (let i = 0; i < 9; i++) this.clouds.push({ x: r() * W, y: 30 + r() * 90, s: 0.7 + r() * 0.7 });
    // Pointer: tap-to-go on the canvas.
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.tapMode) return;
      if (this.tapAt(e.clientX, e.clientY)) return; // tapped a critter: go play
      const rect = this.canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) / this.k + this.camX;
      const sy = (e.clientY - rect.top) / this.k + this.camY;
      this.target = { x: sx, y: (sy - TOP) / TILT };
    });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.raf) return;
    const k = e.key.toLowerCase();
    if (!['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'shift'].includes(k)) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.preventDefault();
    if (e.type === 'keydown') this.keys.add(k); else this.keys.delete(k);
  };

  /** Tap on the field (client coords): if it's on a critter, the horse heads over to play. */
  tapAt(clientX: number, clientY: number): boolean {
    if (this.scene) return false;
    const rect = this.canvas.getBoundingClientRect();
    const wx = (clientX - rect.left) / this.k + this.camX;
    const wsy = (clientY - rect.top) / this.k + this.camY;
    return this.life.tap(wx, wsy, (y) => this.sy(y));
  }

  /** Which barn friends are out on the ranch. */
  setFriends(ids: FriendId[]): void { this.life.setFriends(ids); }

  /** 0 = sunrise … 1 = golden evening. Eases there over a few seconds. */
  setTimeOfDay(v: number, instant = false): void { this.todTarget = Math.max(0, Math.min(1, v)); if (instant) this.tod = this.todTarget; }

  /** Analogue input from the thumb stick: x, y in -1..1 (y down = toward the camera). */
  setStick(x: number, y: number): void { this.stick = { x, y }; if (x || y) this.target = null; }

  /** Render the horse's walking poses in its current grooming look. */
  async setHorse(def: HorseDef, look: Look): Promise<void> {
    const key = JSON.stringify([def.coat, def.marking, def.color, look]);
    this.horseName = def.name;
    if (key === this.spriteKey) return;
    this.spriteKey = key;
    const sw = 340;
    // The felt puppet: side, front and back.
    const base = 266 / 290;
    const fw = Math.round(sw * 200 / 320);
    const [side, run, [stand], [graze], [lieImg], front, back] = await Promise.all([
      puppetFrames(def, null, SIDE_FRAMES, sw, { mode: 'walk', base, look }),
      puppetFrames(def, null, SIDE_FRAMES, sw, { mode: 'gallop', base, look }),
      puppetFrames(def, null, 1, sw, { mode: 'stand', base, look }),
      puppetFrames(def, null, 1, sw, { mode: 'graze', base, look }),
      puppetFrames(def, null, 1, sw, { mode: 'lie', base, look }),
      puppetFrontFrames(def, null, FB_FRAMES, fw, Math.round(fw * 270 / 200), { mode: 'walk', base: 258 / 270, look }),
      puppetBackFrames(def, FB_FRAMES, fw, Math.round(fw * 270 / 200), { mode: 'walk', base: 258 / 270 }),
    ]);
    Object.assign(this, { side, run, stand, graze, front, back, lieImg });
  }

  start(): void {
    if (this.raf) return;
    if (!this.scene) { this.fade = 0; this.dim = 0; }
    this.last = performance.now();
    const loop = (now: number) => { this.tick(now); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void { cancelAnimationFrame(this.raf); this.raf = 0; this.keys.clear(); this.stick = { x: 0, y: 0 }; }

  get busy(): boolean { return !!this.scene; }

  /**
   * A little cutscene for a station action. `done` runs at the moment the action
   * happens (the horse lies down, eats, or has trotted out the gate).
   */
  play(kind: Cutscene, done: () => void): void {
    const goal = kind === 'rest' ? { x: 1215, y: 345, face: 'right' as Facing }
      : kind === 'feed' ? { x: 606, y: 292, face: 'right' as Facing }
      : { x: 2210, y: 480, face: 'right' as Facing };
    this.scene = { kind, stage: 'walk', t: 0, goal, done, fired: false };
    this.target = null; this.stick = { x: 0, y: 0 }; this.keys.clear();
    this.hooks.onNear(null); this.near = null;
  }

  /** Put the horse somewhere (e.g. under the tree after a rest). */
  place(x: number, y: number, facing: Facing = 'right'): void { this.camInit = false; this.scene = null; this.fade = 0; this.dim = 0; this.x = x; this.y = y; this.facing = facing; this.speed = 0; this.target = null; this.still = 4; }

  // ---------- simulation ----------
  /** Is this spot inside a jumpable thing (bale or pond), with the horse's size added? */
  private inJumpable(x: number, y: number): boolean {
    const pad = HORSE_R;
    for (const b of BALES) if (Math.hypot(x - b.x, y - b.y) < BALE_R + pad) return true;
    return Math.hypot((x - POND.x) / (POND.rx + pad), (y - POND.y) / (POND.ry + pad * 0.6)) < 1;
  }

  private blockedSolid(x: number, y: number): boolean {
    if (x < FENCE.x0 + HORSE_R || x > FENCE.x1 - HORSE_R || y < FENCE.y0 + HORSE_R * 0.6 || y > FENCE.y1 - HORSE_R * 0.4) return true;
    if (x > BARN.x0 - HORSE_R && x < BARN.x1 + HORSE_R && y < BARN.y1 + HORSE_R * 0.5) return true;
    return OBSTACLES.some((o) => Math.hypot(x - o.x, y - o.y) < o.r + HORSE_R);
  }

  /** Cantering into a bale or the pond: leap if there's a clear landing within reach. */
  private tryJump(): boolean {
    const cx = Math.cos(this.heading); const cy = Math.sin(this.heading);
    let entered = false;
    for (let d = 4; d <= JUMP_MAX; d += 4) {
      const x = this.x + cx * d; const y = this.y + cy * d;
      if (this.blockedSolid(x, y)) return false;
      const inside = this.inJumpable(x, y);
      if (inside) entered = true;
      else if (entered) {
        const len = d + 30;
        if (this.blockedSolid(this.x + cx * len, this.y + cy * len)) return false;
        this.jump = { t: 0, dur: len / this.speed, h: 30 + len * 0.11 };
        return true;
      }
    }
    return false;
  }

  private input(): { x: number; y: number } {
    const sc = this.scene;
    if (sc) {
      if (sc.stage !== 'walk' || !sc.goal) return { x: 0, y: 0 };
      const dx = sc.goal.x - this.x; const dy = sc.goal.y - this.y; const d = Math.hypot(dx, dy);
      const p = d < 60 ? 0.3 : 0.7;
      return { x: (dx / d) * p, y: (dy / d) * p };
    }
    let x = this.stick.x;
    let y = this.stick.y;
    if (Math.hypot(x, y) > 0.12) this.life.cancel();
    const k = this.keys;
    const kx = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    const ky = (k.has('arrowdown') || k.has('s') ? 1 : 0) - (k.has('arrowup') || k.has('w') ? 1 : 0);
    if (kx || ky) {
      const m = Math.hypot(kx, ky);
      const pow = k.has('shift') ? 1 : 0.62; // keys trot; hold Shift to canter
      x = (kx / m) * pow; y = (ky / m) * pow; this.target = null; this.life.cancel();
    }
    if (this.target && !x && !y) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 14) this.target = null;
      else { const p = Math.min(1, d / 420) * 0.95 + 0.05; x = (dx / d) * Math.max(0.3, p); y = (dy / d) * Math.max(0.3, p); }
    }
    return { x, y };
  }

  private runScene(dt: number): boolean {
    const sc = this.scene;
    if (!sc) return false;
    sc.t += dt;
    if (sc.stage === 'walk') {
      const g = sc.goal!;
      if (Math.hypot(g.x - this.x, g.y - this.y) < 16 || sc.t > 5) {
        if (sc.t > 5) { this.x = g.x; this.y = g.y; }
        this.speed = 0; this.facing = g.face; this.heading = 0; this.gait = 'stand'; this.hooks.onGait?.('stand');
        sc.stage = sc.kind === 'gate' ? 'exit' : 'act'; sc.t = 0;
        if (sc.kind === 'gate') { this.speed = GAIT_SPEED.trot; this.gait = 'trot'; this.hooks.onGait?.('trot'); }
      }
      return false; // normal movement code walks the horse there
    }
    if (sc.kind === 'gate') {
      // Trot out through the open gate, then a paper wipe.
      this.x += this.speed * dt; this.phase = (this.phase + (this.speed * dt) / STRIDE.trot) % 1;
      if (Math.random() < dt * 6) this.dust.push({ x: this.x - 50, y: this.y + 2, r: 6, life: 0.5 });
      if (this.x > FENCE.x1 - 20) this.fade = Math.min(1, this.fade + dt * 1.8);
      if (this.fade >= 1 && !sc.fired) { sc.fired = true; sc.done(); }
      return true;
    }
    if (sc.kind === 'rest') {
      const LIE = 3.2;
      this.dim = Math.min(0.42, sc.t < LIE - 0.6 ? sc.t * 0.35 : Math.max(0, 0.42 - (sc.t - (LIE - 0.6)) * 0.8));
      if (sc.t > 0.6 && Math.random() < dt * 2.2) this.bits.push({ x: this.x + 120, y: this.sy(this.y) - 60, vx: 14, vy: -30, life: 1.6, txt: 'z' });
      if (sc.t > LIE - 0.6 && !sc.fired) { sc.fired = true; sc.done(); }
      if (sc.t > LIE) { this.scene = null; this.dim = 0; this.still = 0; }
      return true;
    }
    // feed: head in the trough, munching.
    const EAT = 2.2;
    if (Math.random() < dt * 9) this.bits.push({ x: this.x + 78 + Math.random() * 16, y: this.sy(this.y) - 30, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 30, life: 0.6, c: Math.random() < 0.5 ? '#E2C46A' : '#E2793B' });
    if (sc.t > 0.8 && !sc.fired) { sc.fired = true; sc.done(); }
    if (sc.t > EAT) { this.scene = null; this.still = 0; }
    return true;
  }

  private step(dt: number): void {
    if (this.runScene(dt)) return;
    if (this.jump) {
      const j = this.jump;
      j.t += dt;
      this.x += Math.cos(this.heading) * this.speed * dt;
      this.y += Math.sin(this.heading) * this.speed * dt;
      if (j.t >= j.dur) {
        this.jump = null;
        for (let i = 0; i < 4; i++) this.dust.push({ x: this.x + (i - 1.5) * 18, y: this.y + 2, r: 7, life: 0.7 });
      }
      return;
    }
    const inp = this.input();
    const mag = Math.min(1, Math.hypot(inp.x, inp.y));
    // Pick the gait from how hard the stick is pushed.
    const want: Gait = mag < 0.12 ? 'stand' : mag < 0.5 ? 'walk' : mag < 0.85 ? 'trot' : 'canter';
    const vmax = want === 'stand' ? 0 : GAIT_SPEED[want];
    // Ease the speed (horses don't stop on a dime) and turn in natural arcs.
    const acc = vmax > this.speed ? 260 : 420;
    this.speed += Math.sign(vmax - this.speed) * Math.min(Math.abs(vmax - this.speed), acc * dt);
    if (mag >= 0.12) {
      const goal = Math.atan2(inp.y, inp.x);
      let d = goal - this.heading;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const rate = this.speed < 40 ? 9 : 5.2 - this.speed / 120;
      this.heading += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
      this.still = 0;
    } else this.still += dt;
    // Move, sliding along fences and around things instead of sticking.
    let vx = Math.cos(this.heading) * this.speed;
    let vy = Math.sin(this.heading) * this.speed;
    let nx = this.x + vx * dt;
    let ny = this.y + vy * dt;
    const pad = HORSE_R;
    if (nx < FENCE.x0 + pad || nx > FENCE.x1 - pad) { nx = Math.max(FENCE.x0 + pad, Math.min(FENCE.x1 - pad, nx)); vx = 0; }
    if (ny < FENCE.y0 + pad * 0.6 || ny > FENCE.y1 - pad * 0.4) { ny = Math.max(FENCE.y0 + pad * 0.6, Math.min(FENCE.y1 - pad * 0.4, ny)); vy = 0; }
    // Barn footprint.
    if (nx > BARN.x0 - pad && nx < BARN.x1 + pad && ny < BARN.y1 + pad * 0.5) { ny = BARN.y1 + pad * 0.5; vy = Math.max(0, vy); }
    if (this.speed >= JUMP_SPEED && mag >= 0.12 && this.inJumpable(nx, ny) && this.tryJump()) return;
    for (const o of [...OBSTACLES, ...BALES.map((b) => ({ ...b, r: BALE_R }))]) {
      const dx = nx - o.x; const dy = ny - o.y; const d = Math.hypot(dx, dy); const min = o.r + pad;
      if (d < min && d > 0.01) { nx = o.x + (dx / d) * min; ny = o.y + (dy / d) * min; }
    }
    { // pond (ellipse)
      const ex = (nx - POND.x) / (POND.rx + pad); const ey = (ny - POND.y) / (POND.ry + pad * 0.6); const e = Math.hypot(ex, ey);
      if (e < 1 && e > 0.01) { nx = POND.x + (ex / e) * (POND.rx + pad); ny = POND.y + (ey / e) * (POND.ry + pad * 0.6); }
    }
    const moved = Math.hypot(nx - this.x, ny - this.y);
    if (this.speed > 1 && (vx !== 0 || vy !== 0) && moved < this.speed * dt * 0.35 && mag >= 0.12) {
      // Pressed into a rail: turn along it.
      this.heading = Math.abs(Math.cos(this.heading)) > Math.abs(Math.sin(this.heading)) ? Math.atan2(Math.sign(Math.sin(this.heading)) || 1, 0) : Math.atan2(0, Math.sign(Math.cos(this.heading)) || 1);
    }
    this.x = nx; this.y = ny;
    const actual = moved / Math.max(dt, 1e-4);
    const gait: Gait = actual < 12 ? 'stand' : actual < 130 ? 'walk' : actual < 240 ? 'trot' : 'canter';
    if (gait !== this.gait) { this.gait = gait; this.hooks.onGait?.(gait); }
    this.phase = (this.phase + moved / STRIDE[gait === 'stand' ? 'walk' : gait]) % 1;
    // Which way the paper horse faces (screen space: depth is squashed).
    if (actual > 12) {
      const sx = vx || Math.cos(this.heading); const sy = (vy || Math.sin(this.heading)) * TILT;
      this.facing = Math.abs(sy) > Math.abs(sx) * 1.15 ? (sy > 0 ? 'front' : 'back') : sx > 0 ? 'right' : 'left';
    }
    if (gait === 'canter' && Math.random() < dt * 12) this.dust.push({ x: this.x - Math.cos(this.heading) * 50, y: this.y - Math.sin(this.heading) * 20, r: 8, life: 0.7 });
    // Pawing at the dirt now and then while idle.
    this.paw = Math.max(0, this.paw - dt);
    if (this.still > 2 && this.still < 3.5 && this.paw === 0 && Math.random() < dt * 0.6) { this.paw = 0.9; this.dust.push({ x: this.x + (this.facing === 'left' ? -40 : 40), y: this.y + 4, r: 6, life: 0.6 }); }
    // Stations.
    if (this.scene) return;
    let near: Station | null = null;
    for (const s of STATIONS) if (Math.hypot(this.x - s.x, (this.y - s.y) * 1.3) < 105) near = s;
    if (near !== this.near) { this.near = near; this.hooks.onNear(near); }
  }

  // ---------- drawing ----------
  private sy(y: number): number { return TOP + y * TILT; }

  private tick(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt);
    this.tod += (this.todTarget - this.tod) * Math.min(1, dt * 0.6);
    this.life.tod = this.tod;
    const grazing = !this.jump && !this.scene && this.still > 3.5 && this.gait === 'stand' && this.facing !== 'back';
    const lv = this.life.update(dt, { x: this.x, y: this.y, speed: this.jump ? 0 : this.speed, heading: this.heading, facing: this.facing, moving: this.speed > 20 && !this.scene, grazing, flip: this.facing === 'left' || (grazing && this.facing === 'front' && this.heading > Math.PI / 2) });
    if (lv.goTo && !this.scene) this.target = { x: lv.goTo.x, y: lv.goTo.y + 30 };
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    if (!cw || !ch) return;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    // About 500 world units across on a phone (the ranch is ~5 phone-widths), up to 1100 on a big screen.
    const viewW = Math.max(480, Math.min(1100, cw * 1.3));
    this.k = cw / viewW;
    const viewH = ch / this.k;
    const worldH = TOP + D * TILT + 40;
    const tx = Math.max(0, Math.min(W - viewW, this.x - viewW / 2));
    const ty = viewH >= worldH ? (worldH - viewH) / 2 : Math.max(0, Math.min(worldH - viewH, this.sy(this.y) - viewH * 0.55));
    const ease = this.camInit ? Math.min(1, dt * 4) : 1;
    this.camInit = true;
    this.camX += (tx - this.camX) * ease;
    this.camY += (ty - this.camY) * ease;
    const g = this.g;
    g.setTransform(dpr * this.k, 0, 0, dpr * this.k, -this.camX * dpr * this.k, -this.camY * dpr * this.k);
    this.drawWorld(g, now / 1000, dt, viewW, viewH);
    // Floating bits (Zzz, munched hay).
    for (const b of this.bits) { b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; if (!b.txt) b.vy += 160 * dt; }
    this.bits = this.bits.filter((b) => b.life > 0);
    for (const b of this.bits) {
      g.globalAlpha = Math.min(1, b.life * 1.5);
      if (b.txt) { g.fillStyle = PAPER; g.strokeStyle = INK; g.lineWidth = 3; g.font = `900 ${Math.round(22 + (1.6 - b.life) * 14)}px system-ui, sans-serif`; g.textAlign = 'center'; g.strokeText(b.txt, b.x, b.y); g.fillText(b.txt, b.x, b.y); }
      else { g.fillStyle = b.c!; g.fillRect(b.x - 3, b.y - 3, 6, 6); }
    }
    g.globalAlpha = 1;
    // Time-of-day light: a rosy sunrise, a golden evening.
    {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const morn = Math.max(0, (0.2 - this.tod) / 0.2);
      const eve = Math.max(0, (this.tod - 0.6) / 0.4);
      if (morn > 0) { g.fillStyle = `rgba(255,186,150,${morn * 0.1})`; g.fillRect(0, 0, cw, ch); }
      if (eve > 0) { g.fillStyle = `rgba(255,140,60,${eve * 0.15})`; g.fillRect(0, 0, cw, ch); g.fillStyle = `rgba(48,36,80,${Math.max(0, eve - 0.5) * 0.22})`; g.fillRect(0, 0, cw, ch); }
    }
    // Dusk dim for a nap, paper wipe for leaving.
    if (this.dim > 0 || this.fade > 0) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.dim > 0) { g.fillStyle = `rgba(34,48,77,${this.dim})`; g.fillRect(0, 0, cw, ch); }
      if (this.fade > 0) {
        g.fillStyle = '#E9DCC3'; g.fillRect(0, 0, cw * this.fade, ch);
        g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(cw * this.fade, 0); g.lineTo(cw * this.fade, ch); g.stroke();
      }
    }
  }

  private drawWorld(g: CanvasRenderingContext2D, t: number, dt: number, viewW: number, viewH: number): void {
    const x0 = this.camX - 40; const x1 = this.camX + viewW + 40;
    // Sky.
    const sky = g.createLinearGradient(0, this.camY - 50, 0, TOP + 40);
    const [skyTop, skyHz] = skyAt(this.tod);
    sky.addColorStop(0, skyTop); sky.addColorStop(1, skyHz);
    g.fillStyle = sky; g.fillRect(x0, this.camY - 60, x1 - x0, TOP + 100 - this.camY);
    // Paper sun: rises on the left, arcs over, sets warm on the right.
    {
      const sx = this.camX + viewW * (0.12 + 0.76 * this.tod);
      const syy = TOP - 95 - Math.sin(Math.PI * Math.min(1, this.tod * 0.9 + 0.08)) * 70;
      const warm = this.tod < 0.15 || this.tod > 0.7;
      g.fillStyle = warm ? 'rgba(255,200,120,.35)' : 'rgba(255,240,180,.35)';
      g.beginPath(); g.arc(sx, syy, 40, 0, Math.PI * 2); g.fill();
      g.fillStyle = warm ? '#FFB45A' : '#FFE27A'; g.strokeStyle = 'rgba(43,33,24,.35)'; g.lineWidth = 2;
      g.beginPath(); g.arc(sx, syy, 24, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    // Paper clouds drifting.
    for (const cl of this.clouds) {
      const cx = ((cl.x + t * 8 * cl.s) % (W + 300)) - 150;
      this.cloud(g, cx, cl.y, cl.s);
    }
    // Rolling hills in layers.
    this.hills(g, x0, x1, TOP - 70, 70, '#B9D3A4', 0.004, 0);
    this.hills(g, x0, x1, TOP - 30, 50, '#9CC48C', 0.007, 2);
    // Distant tree line.
    for (let x = 30; x < W; x += 140) if (x > x0 - 80 && x < x1 + 80 && (x / 140) % 3 !== 1) this.paperTree(g, x + ((x * 7) % 50), TOP - 6, 0.45, '#6FA46A');
    // Pasture.
    g.fillStyle = '#7FB069'; g.fillRect(x0, TOP - 8, x1 - x0, 4000);
    // Worn dirt path from the barn past the trough to the training gate.
    g.strokeStyle = '#D9C095'; g.lineWidth = 46; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(330, this.sy(170)); g.bezierCurveTo(500, this.sy(420), 1000, this.sy(430), 1290, this.sy(400));
    g.bezierCurveTo(1650, this.sy(370), 1900, this.sy(470), 2350, this.sy(470)); g.stroke();
    g.strokeStyle = 'rgba(43,33,24,.08)'; g.lineWidth = 2; g.setLineDash([8, 10]); g.stroke(); g.setLineDash([]);
    // Grass tufts and flowers.
    for (const tf of this.tufts) {
      if (tf.x < x0 || tf.x > x1) continue;
      const y = this.sy(tf.y);
      g.fillStyle = tf.c; g.beginPath(); g.moveTo(tf.x - 8 * tf.s, y); g.lineTo(tf.x - 3 * tf.s, y - 12 * tf.s); g.lineTo(tf.x, y - 3); g.lineTo(tf.x + 4 * tf.s, y - 14 * tf.s); g.lineTo(tf.x + 8 * tf.s, y); g.closePath(); g.fill();
    }
    for (const f of this.flowers) {
      if (f.x < x0 || f.x > x1) continue;
      const y = this.sy(f.y);
      g.fillStyle = f.c; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.beginPath(); g.arc(f.x + Math.cos(a) * 3.2, y + Math.sin(a) * 2.4, 2.4, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#E2A93B'; g.beginPath(); g.arc(f.x, y, 1.8, 0, Math.PI * 2); g.fill();
    }
    // Pond.
    g.fillStyle = '#5E9B5A'; g.beginPath(); g.ellipse(POND.x, this.sy(POND.y) + 4, POND.rx + 10, POND.ry * TILT + 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7FB6C9'; g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.ellipse(POND.x, this.sy(POND.y), POND.rx, POND.ry * TILT, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,251,242,.7)'; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const w = 30 + ((t * 20 + i * 40) % 80); g.globalAlpha = 1 - w / 110; g.beginPath(); g.ellipse(POND.x - 40 + i * 40, this.sy(POND.y) - 4 + i * 6, w * 0.6, w * 0.18, 0, 0, Math.PI * 2); g.stroke(); }
    g.globalAlpha = 1;
    // Lily pads.
    g.fillStyle = '#4F8A5B'; for (const [lx, ly] of [[1680, 648], [1770, 680], [1735, 628]]) { g.beginPath(); g.ellipse(lx, this.sy(ly), 14, 6, 0, 0.3, Math.PI * 2); g.lineTo(lx, this.sy(ly)); g.fill(); }
    // Shadows on the ground (tree shade, under the horse).
    g.fillStyle = 'rgba(43,33,24,.16)';
    g.beginPath(); g.ellipse(1300, this.sy(300), 190, 70, 0, 0, Math.PI * 2); g.fill();
    // Back fence.
    this.fenceRun(g, FENCE.x0, FENCE.x1, FENCE.y0, x0, x1, null);
    // Side fences (the right one has the training gate).
    this.sideFence(g, FENCE.x0, null);
    this.sideFence(g, FENCE.x1, [420, 540]);

    // Depth-sorted props and the horse.
    const items: { y: number; draw: () => void }[] = [
      { y: BARN.y1, draw: () => this.barn(g) },
      { y: 245, draw: () => this.trough(g, 700, 245) },
      ...BALES.map((b) => ({ y: b.y, draw: () => this.hay(g, b.x, b.y) })),
      { y: 245, draw: () => this.bigTree(g, 1290, 245, t) },
      { y: 470, draw: () => this.gateSign(g, 2290, 470) },
      { y: 820, draw: () => this.paperTree(g, 140, this.sy(820), 1, '#5E9B5A') },
      { y: 760, draw: () => this.paperTree(g, 2210, this.sy(760), 0.9, '#4F8A5B') },
      { y: 300, draw: () => this.paperTree(g, 1960, this.sy(300), 0.8, '#5E9B5A') },
      { y: this.y, draw: () => this.drawHorse(g) },
      ...this.life.items(g, (y) => this.sy(y), this.y),
    ];
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    // Dust.
    for (const d of this.dust) { d.life -= dt; d.r += 18 * dt; }
    this.dust = this.dust.filter((d) => d.life > 0);
    for (const d of this.dust) { g.fillStyle = `rgba(169,143,110,${d.life})`; g.beginPath(); g.arc(d.x, this.sy(d.y) - 4, d.r, 0, Math.PI * 2); g.fill(); }
    this.life.drawFireflies(g, (y) => this.sy(y), t);
    // Front fence last (in front of everything).
    this.fenceRun(g, FENCE.x0, FENCE.x1, FENCE.y1, x0, x1, null);
    // Station marker: a bobbing paper arrow over the station you're next to.
    if (this.near) {
      const s = this.near;
      const top = s.id === 'barn' ? this.sy(60) - 200 : s.id === 'shade' ? this.sy(245) - 240 : s.id === 'train' ? this.sy(470) - 120 : this.sy(245) - 70;
      const bob = Math.sin(t * 5) * 5;
      g.fillStyle = '#FFD23F'; g.strokeStyle = INK; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(s.x - 14, top + bob); g.lineTo(s.x + 14, top + bob); g.lineTo(s.x + 14, top + 14 + bob); g.lineTo(s.x + 24, top + 14 + bob); g.lineTo(s.x, top + 36 + bob); g.lineTo(s.x - 24, top + 14 + bob); g.lineTo(s.x - 14, top + 14 + bob); g.closePath(); g.fill(); g.stroke();
    }
    void viewH;
  }

  private drawHorse(g: CanvasRenderingContext2D): void {
    const x = this.x; const y = this.sy(this.y);
    const lift = this.jump ? Math.sin(Math.PI * Math.min(1, this.jump.t / this.jump.dur)) * this.jump.h : 0;
    const sc = this.scene;
    const lying = sc?.kind === 'rest' && sc.stage === 'act' && sc.t > 0.35 && sc.t < 3.0;
    const eating = sc?.kind === 'feed' && sc.stage === 'act';
    const grazing = eating || (!this.jump && !sc && this.still > 3.5 && this.gait === 'stand' && this.facing !== 'back');
    const shrink = 1 - lift / 160;
    g.fillStyle = 'rgba(43,33,24,.22)'; g.beginPath(); g.ellipse(x, y, (this.facing === 'left' || this.facing === 'right' || grazing ? 74 : 40) * shrink, 12 * shrink, 0, 0, Math.PI * 2); g.fill();
    let img: CanvasImageSource | null | undefined;
    let w: number; let h: number; let ax: number; let ay: number;
    const pose = this.jump ? 0.3 : this.gait === 'stand' ? 0 : this.phase; // legs tucked mid-leap
    if (this.facing === 'front' && !grazing) { img = this.front[Math.floor(pose * FB_FRAMES) % FB_FRAMES]; w = 200 * K; h = 270 * K; ax = 0.5; ay = 258 / 270; }
    else if (this.facing === 'back') { img = this.back[Math.floor(pose * FB_FRAMES) % FB_FRAMES]; w = 200 * K; h = 270 * K; ax = 0.5; ay = 258 / 270; }
    else {
      const cycle = this.jump || this.gait === 'canter' ? this.run : this.side;
      img = lying ? this.lieImg : grazing ? this.graze : this.gait === 'stand' && !this.jump ? this.stand : cycle[Math.floor(pose * SIDE_FRAMES) % SIDE_FRAMES];
      w = SIDE_W; h = 290 * K; ax = 150 / 320; ay = 266 / 290;
    }
    if (!img) return;
    const jig = this.paw > 0 ? Math.sin(this.paw * 30) * 1.5 : eating ? Math.sin(performance.now() / 70) * 1.2 : 0;
    g.save();
    g.translate(x + jig, y - lift);
    if (this.jump && (this.facing === 'left' || this.facing === 'right')) g.rotate((this.facing === 'right' ? -1 : 1) * Math.cos(Math.PI * this.jump.t / this.jump.dur) * 0.22);
    if (this.facing === 'left' || (grazing && this.facing === 'front' && this.heading > Math.PI / 2)) g.scale(-1, 1);
    g.drawImage(img, -w * ax, -h * ay, w, h);
    g.restore();
  }

  // ---------- paper props ----------
  private cloud(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    g.fillStyle = PAPER; g.strokeStyle = 'rgba(43,33,24,.25)'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 22 * s, Math.PI * 0.5, Math.PI * 1.5); g.arc(x + 26 * s, y - 14 * s, 26 * s, Math.PI, Math.PI * 2); g.arc(x + 56 * s, y, 20 * s, Math.PI * 1.5, Math.PI * 0.5); g.closePath(); g.fill(); g.stroke();
  }

  private hills(g: CanvasRenderingContext2D, x0: number, x1: number, base: number, amp: number, col: string, f: number, ph: number): void {
    g.fillStyle = col; g.strokeStyle = 'rgba(43,33,24,.2)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, base + amp);
    for (let x = x0; x <= x1; x += 20) g.lineTo(x, base - Math.sin(x * f + ph) * amp * 0.5 - Math.sin(x * f * 2.3 + ph) * amp * 0.2);
    g.lineTo(x1, base + amp + 60); g.lineTo(x0, base + amp + 60); g.closePath(); g.fill(); g.stroke();
  }

  private paperTree(g: CanvasRenderingContext2D, x: number, y: number, s: number, col: string): void {
    g.fillStyle = 'rgba(43,33,24,.18)'; g.beginPath(); g.ellipse(x + 8 * s, y, 36 * s, 9 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8A5A36'; g.strokeStyle = INK; g.lineWidth = 2;
    g.fillRect(x - 6 * s, y - 50 * s, 12 * s, 50 * s); g.strokeRect(x - 6 * s, y - 50 * s, 12 * s, 50 * s);
    g.fillStyle = col;
    for (const [dx, dy, r] of [[0, -96, 34], [-24, -70, 28], [24, -70, 28], [0, -64, 26]] as const) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.fillStyle = 'rgba(255,251,242,.18)'; g.beginPath(); g.arc(x - 10 * s, y - 106 * s, 12 * s, 0, Math.PI * 2); g.fill();
  }

  private bigTree(g: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const sy = this.sy(y);
    g.fillStyle = '#7A4E2E'; g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x - 22, sy); g.lineTo(x - 14, sy - 140); g.lineTo(x + 14, sy - 140); g.lineTo(x + 24, sy); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - 10, sy - 100); g.lineTo(x - 60, sy - 160); g.stroke();
    const sway = Math.sin(t * 0.8) * 3;
    g.fillStyle = '#4F8A5B';
    for (const [dx, dy, r] of [[-90, -170, 60], [90, -170, 60], [-50, -230, 70], [50, -230, 70], [0, -270, 70], [0, -180, 72]] as const) { g.beginPath(); g.arc(x + dx + sway, sy + dy, r, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.fillStyle = '#6FAE66';
    for (const [dx, dy, r] of [[-60, -250, 26], [30, -290, 22], [70, -200, 20]] as const) { g.beginPath(); g.arc(x + dx + sway, sy + dy, r, 0, Math.PI * 2); g.fill(); }
    // A rope swing for character.
    g.strokeStyle = '#C9A27A'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x + 50 + sway, sy - 150); g.lineTo(x + 50, sy - 60); g.moveTo(x + 80 + sway, sy - 150); g.lineTo(x + 80, sy - 60); g.stroke();
    g.fillStyle = '#8A5A36'; g.fillRect(x + 44, sy - 62, 42, 8); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x + 44, sy - 62, 42, 8);
  }

  private barn(g: CanvasRenderingContext2D): void {
    const x0 = BARN.x0; const x1 = BARN.x1; const base = this.sy(BARN.y1); const top = base - 170; const mid = (x0 + x1) / 2;
    g.strokeStyle = INK; g.lineWidth = 3;
    // Shadow.
    g.fillStyle = 'rgba(43,33,24,.18)'; g.fillRect(x0 + 14, base - 4, x1 - x0, 18);
    // Walls.
    g.fillStyle = '#C8452D'; g.beginPath(); g.moveTo(x0, base); g.lineTo(x0, top); g.lineTo(mid, top - 90); g.lineTo(x1, top); g.lineTo(x1, base); g.closePath(); g.fill(); g.stroke();
    // Boards.
    g.strokeStyle = 'rgba(43,33,24,.18)'; g.lineWidth = 2;
    for (let x = x0 + 24; x < x1; x += 24) { g.beginPath(); g.moveTo(x, base); g.lineTo(x, Math.max(top - 90 * (1 - Math.abs(x - mid) / (mid - x0)), top - 90)); g.stroke(); }
    // Roof trim.
    g.strokeStyle = PAPER; g.lineWidth = 9; g.beginPath(); g.moveTo(x0 - 16, top + 10); g.lineTo(mid, top - 96); g.lineTo(x1 + 16, top + 10); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 - 20, top + 15); g.lineTo(mid, top - 101); g.lineTo(x1 + 20, top + 15); g.stroke();
    // Hayloft window.
    g.fillStyle = '#3A2A1B'; g.fillRect(mid - 26, top - 46, 52, 40); g.strokeStyle = PAPER; g.lineWidth = 5; g.strokeRect(mid - 26, top - 46, 52, 40);
    g.fillStyle = '#E2C46A'; g.beginPath(); g.moveTo(mid - 22, top - 8); g.lineTo(mid - 8, top - 22); g.lineTo(mid + 10, top - 12); g.lineTo(mid + 22, top - 8); g.closePath(); g.fill();
    // Big doors with the white X.
    const dw = 120; const dh = 110;
    g.fillStyle = '#9E3523'; g.fillRect(mid - dw / 2, base - dh, dw, dh);
    g.strokeStyle = PAPER; g.lineWidth = 6; g.strokeRect(mid - dw / 2, base - dh, dw, dh);
    g.beginPath(); g.moveTo(mid, base - dh); g.lineTo(mid, base);
    g.moveTo(mid - dw / 2, base - dh); g.lineTo(mid, base); g.lineTo(mid - dw / 2, base);
    g.moveTo(mid + dw / 2, base - dh); g.lineTo(mid, base); g.lineTo(mid + dw / 2, base); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(mid - dw / 2 - 3, base - dh - 3, dw + 6, dh + 3);
    // Sign.
    g.fillStyle = PAPER; g.strokeStyle = INK; g.lineWidth = 2; g.fillRect(mid - 60, top + 6, 120, 26); g.strokeRect(mid - 60, top + 6, 120, 26);
    g.fillStyle = INK; g.font = '900 15px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('THE BARN', mid, top + 20);
    // Lantern.
    if (this.tod > 0.7) { g.fillStyle = `rgba(255,214,90,${(this.tod - 0.7) * 1.2})`; g.beginPath(); g.arc(x1 - 40, top + 40, 26, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#FFD23F'; g.beginPath(); g.arc(x1 - 40, top + 40, 9, 0, Math.PI * 2); g.fill(); g.stroke();
  }

  private trough(g: CanvasRenderingContext2D, x: number, y: number): void {
    const sy = this.sy(y);
    g.fillStyle = 'rgba(43,33,24,.2)'; g.beginPath(); g.ellipse(x + 6, sy + 4, 80, 14, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2.5;
    g.fillStyle = '#7A5634'; g.fillRect(x - 62, sy - 18, 10, 18); g.fillRect(x + 52, sy - 18, 10, 18);
    g.beginPath(); g.moveTo(x - 72, sy - 56); g.lineTo(x + 72, sy - 56); g.lineTo(x + 60, sy - 16); g.lineTo(x - 60, sy - 16); g.closePath();
    g.fillStyle = '#A06A3E'; g.fill(); g.stroke();
    g.fillStyle = '#E2C46A'; g.beginPath(); g.ellipse(x, sy - 56, 70, 10, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = '#B8962F'; g.lineWidth = 2; for (let i = -50; i <= 50; i += 14) { g.beginPath(); g.moveTo(x + i, sy - 58); g.lineTo(x + i + 8, sy - 64); g.stroke(); }
    // Carrots peeking out.
    g.fillStyle = '#E2793B'; g.strokeStyle = INK; g.lineWidth = 1.5;
    for (const dx of [-30, 18]) { g.beginPath(); g.moveTo(x + dx, sy - 60); g.lineTo(x + dx + 18, sy - 66); g.lineTo(x + dx + 4, sy - 54); g.closePath(); g.fill(); g.stroke(); }
  }

  private hay(g: CanvasRenderingContext2D, x: number, y: number): void {
    const sy = this.sy(y);
    g.fillStyle = 'rgba(43,33,24,.18)'; g.fillRect(x - 40, sy - 4, 90, 12);
    g.fillStyle = '#E2C46A'; g.strokeStyle = '#B8962F'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(x - 44, sy - 44, 88, 44, 8); g.fill(); g.stroke();
    g.strokeStyle = '#6B4A2B'; g.beginPath(); g.moveTo(x - 20, sy - 44); g.lineTo(x - 20, sy); g.moveTo(x + 20, sy - 44); g.lineTo(x + 20, sy); g.stroke();
  }

  private gateSign(g: CanvasRenderingContext2D, x: number, y: number): void {
    const sy = this.sy(y);
    g.strokeStyle = INK; g.lineWidth = 2.5;
    g.fillStyle = '#8A5A36'; g.fillRect(x - 4, sy - 90, 8, 90); g.strokeRect(x - 4, sy - 90, 8, 90);
    g.fillStyle = PAPER; g.beginPath(); g.moveTo(x - 66, sy - 112); g.lineTo(x + 50, sy - 112); g.lineTo(x + 68, sy - 96); g.lineTo(x + 50, sy - 80); g.lineTo(x - 66, sy - 80); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = INK; g.font = '900 14px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TRAINING →', x, sy - 96);
  }

  /** A post-and-rail fence along a row of depth y. */
  private fenceRun(g: CanvasRenderingContext2D, a: number, b: number, y: number, x0: number, x1: number, gap: [number, number] | null): void {
    const sy = this.sy(y);
    g.strokeStyle = INK; g.lineWidth = 2;
    g.fillStyle = PAPER;
    const l = Math.max(a, x0); const r = Math.min(b, x1);
    for (const h of [32, 16]) { g.fillRect(l, sy - h - 5, r - l, 7); g.strokeRect(l, sy - h - 5, r - l, 7); }
    for (let x = a; x <= b; x += 80) { if (x < x0 - 20 || x > x1 + 20 || (gap && x > gap[0] && x < gap[1])) continue; g.fillRect(x - 5, sy - 44, 10, 44); g.strokeRect(x - 5, sy - 44, 10, 44); }
  }

  private sideFence(g: CanvasRenderingContext2D, x: number, gap: [number, number] | null): void {
    if (x < this.camX - 60 || x > this.camX + 2000) { /* still cheap; draw anyway */ }
    g.strokeStyle = INK; g.lineWidth = 2; g.fillStyle = PAPER;
    const rails = (ya: number, yb: number) => { for (const h of [32, 16]) { g.beginPath(); g.moveTo(x - 3, this.sy(ya) - h); g.lineTo(x + 3, this.sy(ya) - h - 5); g.lineTo(x + 3, this.sy(yb) - h - 5); g.lineTo(x - 3, this.sy(yb) - h); g.closePath(); g.fill(); g.stroke(); } };
    if (gap) { rails(FENCE.y0, gap[0]); rails(gap[1], FENCE.y1); } else rails(FENCE.y0, FENCE.y1);
    for (let y = FENCE.y0; y <= FENCE.y1; y += 80) { if (gap && y > gap[0] && y < gap[1]) continue; g.fillRect(x - 5, this.sy(y) - 44, 10, 44); g.strokeRect(x - 5, this.sy(y) - 44, 10, 44); }
    if (gap) {
      // An open gate swung outward.
      const ya = this.sy(gap[0]);
      g.fillStyle = PAPER;
      g.beginPath(); g.moveTo(x, ya - 44); g.lineTo(x + 90, ya - 64); g.lineTo(x + 90, ya - 14); g.lineTo(x, ya); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(x, ya - 22); g.lineTo(x + 90, ya - 40); g.stroke();
    }
  }
}
