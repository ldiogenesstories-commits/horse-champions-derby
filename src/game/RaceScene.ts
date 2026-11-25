// Greybox race view. Draws the oval and horses as numbered tokens,
// runs the sim on a fixed step, and handles drag-to-change-lane.
import Phaser from 'phaser';
import { Race, STEP } from '../sim/race';
import { MAX_LANE, RADIUS, STRAIGHT, trackParam } from '../sim/track';
import type { HorseState } from '../sim/types';

export interface StageLayout {
  landscape: boolean;
  width: number;
  height: number;
  infield: { x: number; y: number; w: number; h: number };
}

export interface SceneHooks {
  onLayout: (l: StageLayout) => void;
  onTick: (race: Race) => void;
  onFinish: (race: Race) => void;
  onLaneRequest: (lane: number) => void;
}

const K_STRAIGHT = STRAIGHT / RADIUS;

export class RaceScene extends Phaser.Scene {
  private race!: Race;
  private hooks!: SceneHooks;
  private gameSpeed = 1;
  private acc = 0;
  private finishTimer = -1;
  private trackG!: Phaser.GameObjects.Graphics;
  private horseG!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private youLabel!: Phaser.GameObjects.Text;
  private playerSVG = '';
  private playerImg: Phaser.GameObjects.Image | null = null;
  // Render geometry (px)
  private r = 100;
  private s = 200;
  private laneSp = 6;
  private cx = 0;
  private cy = 0;
  private landscape = false;
  private tokR = 9;
  private dpr = 1;
  // Drag-to-lane
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private dragLane = 0;
  private dragBaseLane = 0;

  constructor() {
    super('race');
  }

  setDpr(dpr: number): void {
    this.dpr = dpr;
  }

  /** The player's token is drawn as its (styled) portrait. */
  setPlayerPortrait(svg: string): void {
    this.playerSVG = svg;
    if (this.trackG) this.loadPortrait();
  }

  private loadPortrait(): void {
    if (!this.playerSVG) return;
    const key = `pp-${Date.now()}`;
    const img = new Image();
    img.onload = () => {
      this.textures.addImage(key, img);
      this.playerImg?.destroy();
      this.playerImg = this.add.image(-100, -100, key).setDepth(4.5);
    };
    // As a standalone image, the SVG must declare its namespace.
    const svg = this.playerSVG.includes('xmlns=') ? this.playerSVG : this.playerSVG.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  private youText = 'YOU';
  /** Label shown over your token (your jockey's name). */
  setYouLabel(text: string): void {
    this.youText = text;
    this.youLabel?.setText(text);
  }

  /** Hold the race clock (e.g. while a curtain is up, or for a finish freeze-frame). */
  private held = false;
  private holdUntil = 0;
  setHeld(on: boolean): void { this.held = on; if (!on) this.acc = 0; }
  freeze(ms: number): void { this.holdUntil = performance.now() + ms; }

  setup(race: Race, hooks: SceneHooks, gameSpeed: number): void {
    this.race = race;
    this.hooks = hooks;
    this.gameSpeed = gameSpeed;
    this.acc = 0;
    this.finishTimer = -1;
    if (this.trackG) {
      this.buildLabels();
      this.layout();
    }
  }

  create(): void {
    this.trackG = this.add.graphics();
    this.horseG = this.add.graphics();
    const d = this.dpr;
    this.youLabel = this.add.text(0, 0, this.youText, { fontFamily: 'system-ui, sans-serif', fontSize: `${10 * d}px`, fontStyle: '900', color: '#FFD23F', backgroundColor: '#111111', padding: { x: 4 * d, y: 1 * d } }).setOrigin(0.5, 1).setDepth(5);
    this.buildLabels();
    this.loadPortrait();
    this.scale.on('resize', () => this.layout());
    this.layout();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => this.onUp());
    this.input.on('pointerupoutside', () => this.onUp());
  }

  private buildLabels(): void {
    this.labels.forEach((l) => l.destroy());
    this.labels = this.race.horses.map((h) =>
      this.add.text(0, 0, String(h.def.number), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: '900',
        color: textOn(h.def.color),
      }).setOrigin(0.5).setDepth(4),
    );
  }

  /** Fit the stadium into the available space. */
  private layout(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const d = this.dpr;
    this.landscape = W > H * 1.15;
    this.laneSp = Phaser.Math.Clamp(Math.min(W, H) / d / 60, 4.5, 7.5) * d;
    const band = (MAX_LANE + 1) * this.laneSp;
    const side = this.landscape ? 118 * d : 0; // room for edge buttons
    const longAvail = (this.landscape ? W - side * 2 : H) - 2 * band - 16 * d;
    const shortAvail = (this.landscape ? H : W) - 2 * band - 16 * d;
    this.r = Math.max(30, Math.min(shortAvail / 2, longAvail / (2 + K_STRAIGHT)));
    this.s = this.r * K_STRAIGHT;
    this.cx = W / 2;
    this.cy = H / 2;
    this.tokR = Phaser.Math.Clamp(this.laneSp / d * 1.25, 6.5, 9.5) * d;
    this.drawTrack();

    const padA = this.r - 12 * d; // across the infield
    const padL = this.s / 2 + this.r * 0.5; // along the infield
    const inf = this.landscape
      ? { x: this.cx - padL, y: this.cy - padA, w: padL * 2, h: padA * 2 }
      : { x: this.cx - padA, y: this.cy - padL, w: padA * 2, h: padL * 2 };
    const infield = { x: inf.x / d, y: inf.y / d, w: inf.w / d, h: inf.h / d };
    this.hooks?.onLayout({ landscape: this.landscape, width: W / d, height: H / d, infield });
  }

  /** Local (portrait) stadium coords → screen. */
  private toScreen(x: number, y: number): { x: number; y: number } {
    return this.landscape ? { x: this.cx - y, y: this.cy + x } : { x: this.cx + x, y: this.cy + y };
  }

  /** Race distance + lane → screen position. */
  private point(dist: number, lane: number): { x: number; y: number } {
    const { seg, frac } = trackParam(dist, this.race.distance);
    const off = (lane + 0.5) * this.laneSp;
    const r = this.r + off;
    const half = this.s / 2;
    let x = 0;
    let y = 0;
    if (seg === 'right') { x = r; y = half - frac * this.s; }
    else if (seg === 'left') { x = -r; y = -half + frac * this.s; }
    else if (seg === 'top') { const th = frac * Math.PI; x = r * Math.cos(th); y = -half - r * Math.sin(th); }
    else { const th = Math.PI + frac * Math.PI; x = r * Math.cos(th); y = half - r * Math.sin(th); }
    return this.toScreen(x, y);
  }

  private stadium(g: Phaser.GameObjects.Graphics, radius: number, fill: number | null, stroke?: { w: number; c: number }): void {
    const w = radius * 2;
    const h = this.s + radius * 2;
    const tl = this.landscape ? { x: this.cx - h / 2, y: this.cy - w / 2 } : { x: this.cx - w / 2, y: this.cy - h / 2 };
    const rw = this.landscape ? h : w;
    const rh = this.landscape ? w : h;
    if (fill !== null) { g.fillStyle(fill, 1); g.fillRoundedRect(tl.x, tl.y, rw, rh, radius); }
    if (stroke) { g.lineStyle(stroke.w, stroke.c, 1); g.strokeRoundedRect(tl.x, tl.y, rw, rh, radius); }
  }

  private drawTrack(): void {
    const g = this.trackG;
    g.clear();
    const outer = this.r + (MAX_LANE + 1) * this.laneSp + 4 * this.dpr;
    const d = this.dpr;
    this.stadium(g, outer + 6 * d, 0xd9c7a6);
    this.stadium(g, outer, 0xb98b5e, { w: 3 * d, c: 0xfffbf2 });
    this.stadium(g, this.r, 0x3e6b48, { w: 3 * d, c: 0xfffbf2 });
    // Furlong poles every 200 m on the inner rail.
    for (let k = 1; k < 6; k++) {
      const a = this.point(this.race.distance - k * 200, -0.6);
      g.fillStyle(0xfffbf2, 1);
      g.fillCircle(a.x, a.y, 2 * this.dpr);
    }
    // Finish line (checkered).
    const steps = MAX_LANE + 2;
    for (let i = 0; i < steps; i++) {
      const a = this.point(this.race.distance, i - 1);
      g.fillStyle(i % 2 ? 0x2b2118 : 0xfffbf2, 1);
      const q = 3 * this.dpr;
      g.fillRect(a.x - q, a.y - q, q * 2, q * 2);
    }
  }

  update(_t: number, deltaMs: number): void {
    if (!this.race) return;
    if (this.held || performance.now() < this.holdUntil) { this.acc = 0; this.drawHorses(); return; }
    this.acc += Math.min(deltaMs, 100) / 1000 * this.gameSpeed;
    let n = 0;
    while (this.acc >= STEP && n < 12) {
      this.race.step(STEP);
      this.acc -= STEP;
      n++;
    }
    this.drawHorses();
    this.hooks.onTick(this.race);
    if (this.race.finished && this.finishTimer < 0) this.finishTimer = 1.6;
    if (this.finishTimer > 0) {
      this.finishTimer -= deltaMs / 1000;
      if (this.finishTimer <= 0) {
        this.finishTimer = 0;
        this.hooks.onFinish(this.race);
      }
    }
  }

  private drawHorses(): void {
    const g = this.horseG;
    g.clear();
    const order = [...this.race.horses].sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0) || a.dist - b.dist);
    const d = this.dpr;
    const t = this.race.t;
    for (const h of order) {
      const idx = this.race.horses.indexOf(h);
      const p = this.point(h.dist, h.lane);
      const color = Phaser.Display.Color.HexStringToColor(h.def.color).color;
      // Speed lines when surging after a whip.
      if (h.surgeT > 0) {
        const back = this.point(h.dist - 9, h.lane);
        const dx = back.x - p.x;
        const dy = back.y - p.y;
        g.lineStyle(2 * d, 0x111111, 0.6);
        for (const o of [-4, 0, 4]) {
          const nx = -dy / 9 * o * 0.5;
          const ny = dx / 9 * o * 0.5;
          g.lineBetween(p.x + dx * 0.9 + nx, p.y + dy * 0.9 + ny, p.x + dx * 1.8 + nx, p.y + dy * 1.8 + ny);
        }
      }
      if (h.isPlayer) {
        g.fillStyle(0x111111, 1);
        g.fillCircle(p.x, p.y, this.tokR + 4 * d);
        g.fillStyle(0xffd23f, 1);
        g.fillCircle(p.x, p.y, this.tokR + 2.5 * d);
      } else {
        g.fillStyle(0xfffbf2, 1);
        g.fillCircle(p.x, p.y, this.tokR + 1.5 * d);
      }
      if (h.boxed && Math.floor(t * 4) % 2 === 0) {
        g.lineStyle(3 * d, 0xe63946, 1);
        g.strokeCircle(p.x, p.y, this.tokR + 6 * d);
      }
      g.fillStyle(color, 1);
      g.fillCircle(p.x, p.y, this.tokR);
      const lab = this.labels[idx];
      if (h.isPlayer && this.playerImg) {
        // A bit bigger than other tokens so the look reads on a phone.
        const size = (this.tokR + 2.5 * d) * 2.3;
        this.playerImg.setPosition(p.x, p.y).setDisplaySize(size, size).setDepth(4.5 + h.dist / 10000);
        g.fillStyle(0x111111, 1);
        g.fillCircle(p.x, p.y, size / 2 + 2 * d);
        g.fillStyle(0xffd23f, 1);
        g.fillCircle(p.x, p.y, size / 2 + 0.5 * d);
        lab.setVisible(false);
      }
      lab.setPosition(p.x, p.y);
      lab.setFontSize(Math.round(this.tokR * 1.15));
      lab.setDepth(4 + h.dist / 10000);
      if (h.isPlayer) {
        // Keep the name tag on screen even when the horse is at the edge.
        const half = this.youLabel.width / 2 + 2 * d;
        const lx = Phaser.Math.Clamp(p.x, half, this.scale.width - half);
        this.youLabel.setPosition(lx, p.y - (this.playerImg ? (this.tokR + 2.5 * d) * 1.15 + 4 * d : this.tokR + 5 * d));
        this.youLabel.setDepth(6);
      }
    }
    // Lane-drag ghost.
    const pl = this.race.player;
    if (this.dragging && pl) {
      const target = this.point(pl.dist + 6, this.dragLane);
      g.lineStyle(3 * this.dpr, 0xffd23f, 1);
      g.strokeCircle(target.x, target.y, this.tokR + 3 * this.dpr);
      const cur = this.point(pl.dist, pl.lane);
      g.lineBetween(cur.x, cur.y, target.x, target.y);
    } else if (pl && !pl.finished && Math.abs(pl.targetLane - pl.lane) > 0.3) {
      // Show a pending lane request.
      const target = this.point(pl.dist + 6, pl.targetLane);
      g.lineStyle(2 * this.dpr, 0xffd23f, 0.8);
      g.strokeCircle(target.x, target.y, this.tokR);
    }
  }

  // ---------- Drag your horse to change lanes ----------
  private onDown(p: Phaser.Input.Pointer): void {
    const pl = this.race?.player;
    if (!pl || pl.finished || pl.auto) return;
    const pos = this.point(pl.dist, pl.lane);
    if (Phaser.Math.Distance.Between(p.x, p.y, pos.x, pos.y) > Math.max(40 * this.dpr, this.tokR * 4)) return;
    this.dragging = true;
    this.dragStart = { x: p.x, y: p.y };
    this.dragBaseLane = Math.round(pl.lane);
    this.dragLane = this.dragBaseLane;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const pl = this.race?.player;
    if (!this.dragging || !pl) return;
    const a = this.point(pl.dist, 0);
    const b = this.point(pl.dist, 1);
    const nx = b.x - a.x;
    const ny = b.y - a.y;
    const len = Math.hypot(nx, ny) || 1;
    const proj = ((p.x - this.dragStart.x) * nx + (p.y - this.dragStart.y) * ny) / len;
    this.dragLane = Phaser.Math.Clamp(this.dragBaseLane + Math.round(proj / (18 * this.dpr)), 0, MAX_LANE);
  }

  private onUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.dragLane !== this.dragBaseLane) this.hooks.onLaneRequest(this.dragLane);
  }

  /** For keyboard lane nudges. */
  nudgeLane(dir: number): void {
    const pl = this.race?.player;
    if (!pl || pl.auto) return;
    const base = Math.round(pl.targetLane);
    this.hooks.onLaneRequest(Phaser.Math.Clamp(base + dir, 0, MAX_LANE));
  }
}

function textOn(hex: string): string {
  const c = Phaser.Display.Color.HexStringToColor(hex);
  const lum = (0.299 * c.red + 0.587 * c.green + 0.114 * c.blue) / 255;
  return lum > 0.6 ? '#2B2118' : '#FFFBF2';
}

export type { HorseState };
