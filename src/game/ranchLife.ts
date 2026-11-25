// Ranch life: wild critters (butterflies, rabbits, songbirds) and your unlocked barn
// friends roaming the pasture. Wild ones scatter when your horse comes close; friends
// trot along behind for a bit. Tap a creature and your horse heads over and, more often
// than not, gets to play: a butterfly lands on its nose, a rabbit races alongside,
// Biscuit hops up for a ride, the Puddle Twins fall in line…
import { CRITTER_SVG, FRIENDS, type FriendId } from './critters';
import { critterSound } from './sfx';

const INK = '#2B2118';
const PAPER = '#FFFBF2';

type Wild = 'butterfly' | 'rabbit' | 'bird';
export type CritterKind = Wild | Exclude<FriendId, 'spider'>;
type Play = 'nose' | 'back' | 'race' | 'line' | 'circle';
type State = 'idle' | 'wander' | 'flee' | 'follow' | 'play' | 'gone';

const PLAY: Record<CritterKind, Play> = { butterfly: 'nose', bird: 'back', rabbit: 'race', cat: 'back', hen: 'back', goat: 'race', ducks: 'line', owl: 'circle' };
const WILD: Wild[] = ['butterfly', 'rabbit', 'bird'];
const FRIEND_HOME: Record<Exclude<FriendId, 'spider'>, { x: number; y: number }> = {
  cat: { x: 560, y: 200 }, hen: { x: 820, y: 320 }, goat: { x: 1060, y: 230 }, ducks: { x: 1600, y: 730 }, owl: { x: 1450, y: 70 },
};
// Size each friend's SVG is drawn at on the ranch (world-screen units, width).
const FRIEND_W: Record<Exclude<FriendId, 'spider'>, number> = { cat: 40, hen: 38, goat: 54, ducks: 52, owl: 36 };
const BUTTERFLY_COLORS = ['#F7A8B8', '#FFD23F', '#9CC3D5', '#E2793B', '#FFFBF2'];
const BIRD_COLORS = ['#2F5D9E', '#C8452D', '#8C6A3E', '#E2A93B'];

export interface HorseView {
  x: number; y: number; speed: number; heading: number;
  facing: 'right' | 'left' | 'front' | 'back';
  moving: boolean;
  grazing: boolean; // head down (side sprite, even when facing front)
  flip: boolean; // side sprite drawn facing left
}

interface Critter {
  kind: CritterKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  home: { x: number; y: number };
  state: State;
  t: number; // time left in the current state
  dir: 1 | -1;
  phase: number;
  color: string;
  cool: number; // seconds before it will follow / react again
  slot: number; // for the duck line / circling angle
}

const BOUNDS = { x0: 90, x1: 2310, y0: 95, y1: 850 };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clampX = (x: number) => Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, x));
const clampY = (y: number) => Math.max(BOUNDS.y0, Math.min(BOUNDS.y1, y));
const isWild = (k: CritterKind): k is Wild => (WILD as string[]).includes(k);

export class RanchLife {
  private list: Critter[] = [];
  private imgs = new Map<string, HTMLImageElement>();
  private engaged: Critter | null = null;
  private engageT = 0;
  private fireflies = Array.from({ length: 22 }, () => ({ x: rnd(1150, 1850), y: rnd(250, 800), z: rnd(20, 90), p: Math.random() * 6 }));
  /** Time of day 0 (sunrise) .. 1 (golden evening); the owl comes out late. */
  tod = 0;

  constructor(
    private toast: (text: string) => void,
    private horseName: () => string,
  ) {
    for (let i = 0; i < 6; i++) this.add('butterfly', { x: rnd(300, 2200), y: rnd(250, 820) });
    for (let i = 0; i < 3; i++) this.add('rabbit', { x: rnd(400, 2200), y: rnd(450, 830) });
    for (let i = 0; i < 4; i++) this.add('bird', { x: rnd(400, 2200), y: rnd(200, 800) });
  }

  /** Which barn friends are unlocked (the spider stays home in her web). */
  setFriends(ids: FriendId[]): void {
    const want = ids.filter((f): f is Exclude<FriendId, 'spider'> => f !== 'spider');
    this.list = this.list.filter((c) => isWild(c.kind) || want.includes(c.kind as Exclude<FriendId, 'spider'>));
    for (const f of want) {
      if (this.list.some((c) => c.kind === f)) continue;
      this.add(f, FRIEND_HOME[f]);
      if (!this.imgs.has(f)) {
        const img = new Image();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(CRITTER_SVG[f].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
        this.imgs.set(f, img);
      }
    }
  }

  private add(kind: CritterKind, at: { x: number; y: number }): void {
    this.list.push({
      kind, x: at.x + rnd(-40, 40), y: at.y + rnd(-30, 30), z: kind === 'butterfly' ? rnd(20, 50) : 0,
      vx: 0, vy: 0, vz: 0, home: { ...at }, state: 'idle', t: rnd(0.5, 3), dir: Math.random() < 0.5 ? 1 : -1,
      phase: Math.random() * 10, color: kind === 'butterfly' ? BUTTERFLY_COLORS[Math.floor(Math.random() * 5)] : BIRD_COLORS[Math.floor(Math.random() * 4)],
      cool: 0, slot: this.list.filter((c) => c.kind === kind).length,
    });
  }

  // ---------- where the horse's nose and back are (world x, screen-y offset above the ground) ----------
  private nose(h: HorseView): { x: number; y: number; up: number } {
    const s = h.flip ? -1 : 1;
    if (h.grazing) return { x: h.x + 84 * s, y: h.y, up: 74 };
    if (h.facing === 'front') return { x: h.x + 2, y: h.y + 4, up: 72 };
    if (h.facing === 'back') return { x: h.x, y: h.y - 4, up: 112 };
    return { x: h.x + 80 * s, y: h.y, up: 104 };
  }
  private back(h: HorseView): { x: number; y: number; up: number } {
    if (!h.grazing && (h.facing === 'front' || h.facing === 'back')) return { x: h.x, y: h.y, up: 92 };
    return { x: h.x + (h.flip ? -6 : 6), y: h.y, up: 86 };
  }

  // ---------- simulation ----------
  update(dt: number, h: HorseView): { goTo?: { x: number; y: number } } {
    let goTo: { x: number; y: number } | undefined;
    for (const c of this.list) {
      c.phase += dt;
      c.cool = Math.max(0, c.cool - dt);
      c.t -= dt;
      const dx = c.x - h.x;
      const dy = (c.y - h.y) * 1.3;
      const d = Math.hypot(dx, dy);
      const owlAway = c.kind === 'owl' && this.tod < 0.7;

      // Your horse is coming to play with this one.
      if (c === this.engaged) {
        this.engageT -= dt;
        if (c.state !== 'play' && d < 95) {
          this.engaged = null;
          const friend = !isWild(c.kind);
          if (Math.random() < (friend ? 0.85 : 0.7)) this.startPlay(c);
          else this.decline(c, h);
        } else if (this.engageT <= 0) this.engaged = null;
      }

      switch (c.state) {
        case 'play': this.stepPlay(c, h, dt); break;
        case 'gone':
          if (c.t <= 0) { // a fresh one drifts back in somewhere else
            c.x = rnd(300, 2200); c.y = rnd(220, 820); c.state = 'idle'; c.t = rnd(1, 3);
            c.z = c.kind === 'bird' ? 260 : c.kind === 'butterfly' ? 120 : 0;
          }
          break;
        case 'flee':
          c.x += c.vx * dt; c.y += c.vy * dt; c.z = Math.max(0, c.z + c.vz * dt);
          if (c.kind === 'rabbit') c.z = Math.abs(Math.sin(c.phase * 9)) * 16;
          if (c.kind === 'bird' && c.z > 420) { c.state = 'gone'; c.t = rnd(6, 14); }
          if (c.kind === 'butterfly' && c.z > 160) { c.state = 'gone'; c.t = rnd(4, 10); }
          if (c.t <= 0) { c.state = 'idle'; c.t = rnd(1, 3); }
          c.x = clampX(c.x); c.y = clampY(c.y);
          break;
        case 'follow': {
          // Trot along behind the horse (ducks keep a little line).
          const back = 70 + c.slot * 30 + (c.kind === 'ducks' ? 10 : 0);
          const tx = h.x - Math.cos(h.heading) * back + (c.kind === 'ducks' ? 0 : 30 * (c.slot % 2 ? 1 : -1));
          const ty = h.y - Math.sin(h.heading) * back * 0.8 + 18;
          this.seek(c, tx, ty, Math.max(70, Math.min(260, h.speed + 40)), dt);
          c.z = c.kind === 'goat' ? Math.abs(Math.sin(c.phase * 8)) * 8 : Math.abs(Math.sin(c.phase * 12)) * 3;
          if (c.t <= 0 || d > 520) { c.state = 'wander'; c.t = rnd(3, 6); c.cool = 9; c.vx = c.home.x; c.vy = c.home.y; }
          break;
        }
        default: {
          // Wild critters scatter from a horse on the move.
          if (isWild(c.kind) && c !== this.engaged && d < (h.moving ? 150 + h.speed * 0.35 : 60) && (h.moving || c.kind !== 'butterfly')) { this.flee(c, h); break; }
          // Friends tag along when the horse trots by.
          if (!isWild(c.kind) && !owlAway && c.kind !== 'owl' && c.cool <= 0 && h.moving && h.speed > 60 && d < 190) {
            c.state = 'follow'; c.t = rnd(4, 6.5); critterSound(c.kind); break;
          }
          this.idle(c, dt);
        }
      }
    }
    if (this.engaged && this.engaged.state !== 'play') goTo = { x: this.engaged.x, y: this.engaged.y };
    return { goTo };
  }

  private seek(c: Critter, tx: number, ty: number, speed: number, dt: number): void {
    const dx = tx - c.x; const dy = ty - c.y; const d = Math.hypot(dx, dy);
    if (d > 2) { const s = Math.min(d, speed * dt); c.x += (dx / d) * s; c.y += (dy / d) * s; if (Math.abs(dx) > 3) c.dir = dx > 0 ? 1 : -1; }
    c.x = clampX(c.x); c.y = clampY(c.y);
  }

  private idle(c: Critter, dt: number): void {
    if (c.kind === 'butterfly') {
      // Lazy loops.
      c.vx += rnd(-60, 60) * dt; c.vy += rnd(-40, 40) * dt;
      c.vx = Math.max(-40, Math.min(40, c.vx)); c.vy = Math.max(-25, Math.min(25, c.vy));
      c.x = clampX(c.x + c.vx * dt); c.y = clampY(c.y + c.vy * dt);
      c.z += (35 + Math.sin(c.phase * 1.7) * 18 - c.z) * Math.min(1, dt * 2);
      if (Math.abs(c.vx) > 3) c.dir = c.vx > 0 ? 1 : -1;
      return;
    }
    if (c.kind === 'bird' && c.z > 0) { c.z = Math.max(0, c.z - 160 * dt); return; } // landing
    if (c.kind === 'owl') { c.x = c.home.x; c.y = c.home.y; c.z = 0; return; }
    if (c.state === 'wander') {
      const home = !isWild(c.kind) ? c.home : null;
      const hop = c.kind === 'rabbit' || c.kind === 'bird';
      this.seek(c, c.vx, c.vy, hop ? 110 : c.kind === 'ducks' ? 40 : 55, dt);
      c.z = hop ? Math.abs(Math.sin(c.phase * (c.kind === 'bird' ? 14 : 8))) * (c.kind === 'bird' ? 5 : 12) : 0;
      if (c.t <= 0 || Math.hypot(c.vx - c.x, c.vy - c.y) < 4) { c.state = 'idle'; c.t = rnd(1.5, 4); c.z = 0; void home; }
      return;
    }
    c.z = 0;
    if (c.t <= 0) {
      // Pick a little stroll (friends stay near home).
      const base = isWild(c.kind) ? { x: c.x, y: c.y } : c.home;
      const r = c.kind === 'rabbit' ? 120 : c.kind === 'bird' ? 70 : c.kind === 'ducks' ? 80 : 110;
      c.vx = clampX(base.x + rnd(-r, r)); c.vy = clampY(base.y + rnd(-r * 0.6, r * 0.6));
      c.state = 'wander'; c.t = rnd(1.5, 3.5);
    }
  }

  private flee(c: Critter, h: HorseView): void {
    const dx = c.x - h.x || 1; const dy = c.y - h.y; const d = Math.hypot(dx, dy) || 1;
    const sp = c.kind === 'rabbit' ? 320 : c.kind === 'bird' ? 260 : 170;
    c.vx = (dx / d) * sp; c.vy = (dy / d) * sp * 0.6;
    c.vz = c.kind === 'bird' ? 220 : c.kind === 'butterfly' ? 60 : 0;
    c.dir = c.vx > 0 ? 1 : -1;
    c.state = 'flee'; c.t = c.kind === 'rabbit' ? 0.9 : 3;
    if (c.kind !== 'butterfly') critterSound(c.kind);
  }

  // ---------- playing ----------
  private startPlay(c: Critter): void {
    c.state = 'play'; c.t = c.kind === 'rabbit' || c.kind === 'goat' ? 7 : 6.5; c.slot = 0;
    critterSound(c.kind);
    const n = this.horseName();
    const f = FRIENDS.find((x) => x.id === c.kind)?.name;
    const msg: Record<CritterKind, string> = {
      butterfly: `A butterfly landed on ${n}'s nose!`,
      bird: `A songbird hops onto ${n}'s back for a ride.`,
      rabbit: `Race you! A rabbit is racing alongside ${n}.`,
      cat: `${f} hops up onto ${n}'s back. Giddy-up!`,
      hen: `${f} flaps up and hitches a ride.`,
      goat: `${f} wants to race! Boing, boing, boing.`,
      ducks: `${f} fall in line behind ${n}.`,
      owl: `${f} swoops down and circles ${n}. Hoo!`,
    };
    this.toast(msg[c.kind]);
  }

  private decline(c: Critter, h: HorseView): void {
    const f = FRIENDS.find((x) => x.id === c.kind)?.name;
    const msg: Record<CritterKind, string> = {
      butterfly: 'The butterfly flutters off. Maybe next time!',
      bird: 'Tweet! The bird was feeling shy.',
      rabbit: 'The rabbit bolts into the grass. Too quick!',
      cat: `${f} is busy being a cat right now.`,
      hen: `${f} has important pecking to do.`,
      goat: `${f} is chewing something. Probably not food.`,
      ducks: `${f} are having a nap.`,
      owl: `${f} keeps one eye closed. Not now.`,
    };
    this.toast(msg[c.kind]);
    if (isWild(c.kind)) this.flee(c, h);
    else { c.cool = 4; critterSound(c.kind); }
  }

  private stepPlay(c: Critter, h: HorseView, dt: number): void {
    const mode = PLAY[c.kind];
    if (mode === 'nose' || mode === 'back') {
      const p = mode === 'nose' ? this.nose(h) : this.back(h);
      // Settle on: ease in, then ride along exactly.
      const k = Math.min(1, dt * 8);
      c.x += (p.x - c.x) * k; c.y += (p.y - c.y) * k;
      c.z += (p.up + (c.kind === 'butterfly' ? Math.sin(c.phase * 2) * 2 : 0) - c.z) * k;
      c.dir = h.flip ? -1 : 1;
    } else if (mode === 'race') {
      // Run alongside (just in front of the horse, nearer the camera).
      const side = 46;
      const ahead = h.moving ? 30 : 0;
      const tx = h.x + Math.cos(h.heading) * ahead - Math.sin(h.heading) * side;
      const ty = h.y + Math.sin(h.heading) * ahead + Math.cos(h.heading) * side * 0.8 + 20;
      if (h.moving) this.seek(c, tx, ty, h.speed + 120, dt);
      else { c.slot += dt * 2.4; this.seek(c, h.x + Math.cos(c.slot) * 110, h.y + Math.sin(c.slot) * 70, 220, dt); } // hop rings around a standing horse
      c.z = Math.abs(Math.sin(c.phase * (c.kind === 'rabbit' ? 11 : 8))) * (c.kind === 'rabbit' ? 18 : 12);
    } else if (mode === 'line') {
      const back = 80;
      this.seek(c, h.x - Math.cos(h.heading) * back, h.y - Math.sin(h.heading) * back * 0.8 + 18, Math.max(80, h.speed + 40), dt);
      c.z = Math.abs(Math.sin(c.phase * 12)) * 3;
    } else {
      // circle: loops around the horse's head.
      c.slot += dt * 2.6;
      c.x = h.x + Math.cos(c.slot) * 120; c.y = h.y + Math.sin(c.slot) * 60; c.z = 130 + Math.sin(c.slot * 2) * 20;
      c.dir = -Math.sin(c.slot) > 0 ? 1 : -1;
    }
    if (c.t <= 0) {
      if (isWild(c.kind)) this.flee(c, h);
      else { c.state = 'wander'; c.t = 3; c.cool = 8; c.vx = c.home.x; c.vy = c.home.y; c.z = 0; }
    }
  }

  /** A tap at screen-world coords: returns true if it was on a critter (the horse heads over). */
  tap(wx: number, wsy: number, sy: (y: number) => number): boolean {
    let best: Critter | null = null;
    let bd = 46;
    for (const c of this.list) {
      if (c.state === 'gone' || c.state === 'play' || (c.kind === 'owl' && this.tod < 0.7)) continue;
      const size = isWild(c.kind) ? (c.kind === 'butterfly' ? 14 : 16) : FRIEND_W[c.kind as Exclude<FriendId, 'spider'>] / 2;
      const d = Math.hypot(wx - c.x, wsy - (sy(c.y) - c.z - size));
      if (d < bd + size * 0.5) { bd = d; best = c; }
    }
    if (!best) return false;
    this.engaged = best;
    this.engageT = 7;
    critterSound(best.kind);
    if (best.kind === 'owl') { this.engaged = null; this.startPlay(best); } // the owl comes to you
    return true;
  }

  /** The player steered away: stop heading for that critter. */
  cancel(): void { this.engaged = null; }

  get playing(): boolean { return this.list.some((c) => c.state === 'play'); }

  // ---------- drawing ----------
  /** Depth-sortable draw calls (y = depth row), merged into the ranch's own sort. */
  items(g: CanvasRenderingContext2D, sy: (y: number) => number, horseY: number): { y: number; draw: () => void }[] {
    const out: { y: number; draw: () => void }[] = [];
    for (const c of this.list) {
      if (c.state === 'gone' || (c.kind === 'owl' && this.tod < 0.7 && c.state !== 'play')) continue;
      const riding = c.state === 'play' && (PLAY[c.kind] === 'nose' || PLAY[c.kind] === 'back' || PLAY[c.kind] === 'circle');
      out.push({ y: riding ? horseY + 0.5 : c.y, draw: () => this.drawOne(g, c, sy) });
    }
    return out;
  }

  private drawOne(g: CanvasRenderingContext2D, c: Critter, sy: (y: number) => number): void {
    const x = c.x; const gy = sy(c.y); const y = gy - c.z;
    const onHorse = c.state === 'play' && (PLAY[c.kind] === 'nose' || PLAY[c.kind] === 'back');
    // Ground shadow (not while perched on the horse).
    if (!onHorse && c.kind !== 'owl') {
      g.fillStyle = `rgba(43,33,24,${Math.max(0.05, 0.18 - c.z / 900)})`;
      g.beginPath(); g.ellipse(x, gy, c.kind === 'butterfly' ? 6 : c.kind === 'goat' ? 22 : 13, 4, 0, 0, Math.PI * 2); g.fill();
    }
    g.save();
    g.translate(x, y);
    if (c.dir < 0) g.scale(-1, 1);
    g.strokeStyle = INK; g.lineWidth = 1.6; g.lineJoin = 'round'; g.lineCap = 'round';
    if (c.kind === 'butterfly') this.butterfly(g, c);
    else if (c.kind === 'rabbit') this.rabbit(g, c);
    else if (c.kind === 'bird') this.bird(g, c);
    else {
      const img = this.imgs.get(c.kind);
      if (img?.complete && img.naturalWidth) {
        const w = FRIEND_W[c.kind];
        const h = w * img.naturalHeight / img.naturalWidth;
        // Friends face right in their art; a little waddle when moving.
        const tilt = c.state === 'follow' || c.state === 'wander' || PLAY[c.kind] === 'race' && c.state === 'play' ? Math.sin(c.phase * 10) * 0.08 : 0;
        g.rotate(tilt);
        g.drawImage(img, -w / 2, -h, w, h);
      }
    }
    g.restore();
  }

  private butterfly(g: CanvasRenderingContext2D, c: Critter): void {
    const perched = c.state === 'play';
    const flap = Math.abs(Math.sin(c.phase * (perched ? 3 : 16)));
    const wy = 0.25 + flap * 0.75;
    g.fillStyle = c.color;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * 5, -6, 6, 8 * wy, s * 0.5, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(s * 4, 2, 4, 5 * wy, -s * 0.4, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.fillStyle = INK; g.beginPath(); g.ellipse(0, -2, 1.6, 6, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(0, -8); g.lineTo(-3, -13); g.moveTo(0, -8); g.lineTo(3, -13); g.lineWidth = 1; g.stroke();
  }

  private rabbit(g: CanvasRenderingContext2D, c: Critter): void {
    const run = c.z > 1;
    const stretch = run ? 1.15 : 1;
    g.fillStyle = '#C9B48F';
    // Body, head, ears, tail.
    g.beginPath(); g.ellipse(-4, -10, 13 * stretch, 9, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(10, -17, 7, 6.5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    const ear = run ? -0.6 : -0.25 + Math.sin(c.phase * 2) * 0.08;
    for (const dx of [7, 12]) { g.save(); g.translate(dx, -22); g.rotate(ear); g.beginPath(); g.ellipse(0, -8, 2.6, 8, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore(); }
    g.fillStyle = PAPER; g.beginPath(); g.arc(-17, -12, 4, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.arc(13, -18, 1.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#F7A8B8'; g.beginPath(); g.arc(17, -16, 1.4, 0, Math.PI * 2); g.fill();
  }

  private bird(g: CanvasRenderingContext2D, c: Critter): void {
    const flying = c.z > 2 && c.state !== 'play';
    g.fillStyle = c.color;
    g.beginPath(); g.ellipse(0, -7, 8, 6.5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.arc(6, -12, 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#E2A93B'; g.beginPath(); g.moveTo(10, -13); g.lineTo(15, -12); g.lineTo(10, -10.5); g.closePath(); g.fill();
    g.fillStyle = INK; g.beginPath(); g.arc(7.5, -13, 1, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-7, -8); g.lineTo(-13, -11); g.lineTo(-12, -5); g.closePath(); g.fillStyle = c.color; g.fill(); g.stroke();
    // Wing: flapping when airborne, tucked otherwise.
    g.fillStyle = PAPER;
    const a = flying ? Math.sin(c.phase * 30) * 0.9 : 0.15;
    g.save(); g.translate(-1, -8); g.rotate(-a); g.beginPath(); g.ellipse(-3, flying ? -5 : 0, 6, 3.2, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore();
    if (!flying) { g.beginPath(); g.moveTo(-1, -1); g.lineTo(-1, 2); g.moveTo(2, -1); g.lineTo(2, 2); g.stroke(); }
  }

  /** Evening fireflies over the pond and under the big tree (screen-world coords). */
  drawFireflies(g: CanvasRenderingContext2D, sy: (y: number) => number, t: number): void {
    const on = Math.max(0, (this.tod - 0.72) / 0.28);
    if (on <= 0) return;
    for (const f of this.fireflies) {
      const glow = (Math.sin(t * 2.2 + f.p * 3) + 1) / 2;
      const fx = f.x + Math.sin(t * 0.6 + f.p) * 30;
      const fy = sy(f.y) - f.z - Math.sin(t * 0.9 + f.p * 2) * 12;
      g.globalAlpha = on * glow;
      g.fillStyle = 'rgba(255,230,120,.35)'; g.beginPath(); g.arc(fx, fy, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#FFF2A8'; g.beginPath(); g.arc(fx, fy, 2.2, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
}
