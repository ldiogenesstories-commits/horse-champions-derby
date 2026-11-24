// TV broadcast: a paper-craft "live TV" presentation of the race for the big screen.
// A trackside camera follows the leaders with full-body galloping horses over layered
// paper scenery; a director cuts to the overhead oval (the Phaser view underneath) and
// pops comic-book panels on big moments; TV graphics show the race, the leader, a mini
// map, and the final-1,000 m countdown (a nod to Derby Owners Club's main screen).
import type { Race } from '../sim/race';
import type { HorseDef, HorseState } from '../sim/types';
import { trackPoint } from '../sim/track';
import { DEFAULT_LOOK, horseBodySVG } from './horseBody';
import { DEFAULT_JOCKEY, riderSVG, type Jockey, type SilksPattern } from './jockey';
import { portraitSVG } from './portrait';

const FRAMES = 8; // gallop poses per horse
const STRIDE_M = 7; // metres per full gallop cycle
const HORSE_M = 3.4; // how many track metres one horse sprite spans
const SPRITE_W = 300; // px each pose is rendered at
const PATTERNS: SilksPattern[] = ['hoops', 'stripes', 'diamonds', 'stars', 'chevron', 'halves', 'sash', 'solid'];

type Shot = 'track' | 'aerial';

interface Cut { until: number; html: string }

const loadImage = (svg: string): Promise<HTMLImageElement> => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = rej;
  const s = svg.includes('xmlns=') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
});

/** A jockey for computer horses, dressed in the horse's racing colour. */
export function cpuJockey(def: HorseDef): Jockey {
  return { ...DEFAULT_JOCKEY, name: '', pattern: PATTERNS[def.number % PATTERNS.length], primary: def.color, secondary: '#FFFBF2', cap: def.color };
}

export class Broadcast {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ui: HTMLElement;
  private race: Race | null = null;
  private frames = new Map<string, HTMLImageElement[]>();
  private names = new Map<string, string>(); // horse id -> jockey name (family players)
  private raf = 0;
  private last = 0;
  private cam = 0;
  private shot: Shot = 'aerial';
  private shotUntil = 0;
  private nextAerial = 16;
  private evIndex = 0;
  private cut: Cut | null = null;
  private cutCooldown = 0;
  private leaderCutAt = -99;
  private lastLeaderCut = -1;
  private dust: { x: number; y: number; r: number; life: number }[] = [];
  private bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  private onShot: (s: Shot) => void;

  constructor(host: HTMLElement, onShot: (s: Shot) => void) {
    this.onShot = onShot;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bc-canvas';
    this.ui = document.createElement('div');
    this.ui.className = 'bc-ui';
    host.append(this.canvas, this.ui);
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** Render every horse's gallop poses (with its look and jockey) before the race. */
  async load(race: Race, jockeys: Map<string, Jockey>): Promise<void> {
    this.race = race;
    this.names.clear();
    const jobs = race.horses.map(async (h) => {
      const j = jockeys.get(h.def.id) ?? cpuJockey(h.def);
      if (jockeys.has(h.def.id) && j.name && j.name !== 'You') this.names.set(h.def.id, j.name);
      const imgs = await Promise.all(Array.from({ length: FRAMES }, (_, f) =>
        loadImage(horseBodySVG(h.def, h.def.look ?? DEFAULT_LOOK, { pose: f / FRAMES, rider: riderSVG(j) }).replace('<svg ', `<svg width="${SPRITE_W}" height="${Math.round(SPRITE_W * 290 / 320)}" `))));
      this.frames.set(h.def.id, imgs);
    });
    await Promise.all(jobs);
    // Mini-map bounds from the oval itself.
    const xs: number[] = []; const ys: number[] = [];
    for (let d = 0; d < 1200; d += 20) { const p = trackPoint(d, 0, race.distance); xs.push(p.x); ys.push(p.y); }
    this.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  start(): void {
    if (!this.race) return;
    this.cam = 0;
    this.evIndex = 0;
    this.shot = 'aerial';
    this.shotUntil = 3; // the break, from above
    this.nextAerial = 18;
    this.onShot('aerial');
    this.ui.innerHTML = `
      <div class="bc-bug"><b>HORSE CHAMPIONS DERBY</b><span id="bc-race"></span></div>
      <div class="bc-shot" id="bc-shot"></div>
      <div class="bc-count" id="bc-count" hidden></div>
      <div class="bc-leader" id="bc-leader"></div>
      <div class="bc-cut" id="bc-cut" hidden></div>`;
    this.last = performance.now();
    const loop = (now: number) => { this.frame(now); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ui.innerHTML = '';
    this.canvas.style.display = 'none';
  }

  destroy(): void { this.stop(); this.canvas.remove(); this.ui.remove(); }

  setTitle(t: string): void { const el = this.ui.querySelector('#bc-race'); if (el) el.textContent = t; }

  // ---------- director ----------
  private setShot(s: Shot, until: number): void {
    if (s !== this.shot) { this.shot = s; this.onShot(s); }
    this.shotUntil = until;
    this.canvas.style.display = s === 'track' ? 'block' : 'none';
    const label = this.ui.querySelector('#bc-shot') as HTMLElement | null;
    if (label) label.textContent = s === 'aerial' ? 'AERIAL VIEW' : 'TRACKSIDE';
  }

  private direct(r: Race): void {
    const t = r.t;
    const left = r.distance - Math.max(...r.horses.map((h) => h.dist));
    // Stay trackside for the drive home; otherwise check in from above now and then.
    if (this.shot === 'aerial' && t >= this.shotUntil) this.setShot('track', Infinity);
    else if (this.shot === 'track' && t >= this.nextAerial && left > 450 && !r.finished) {
      this.setShot('aerial', t + 4.5);
      this.nextAerial = t + 20;
    }
    // Comic-panel cut-ins on big moments.
    while (this.evIndex < r.events.length) {
      const ev = r.events[this.evIndex++];
      if (t < this.cutCooldown) continue;
      const h = ev.horse !== undefined ? r.horses.find((x) => x.def.number === ev.horse) : undefined;
      const big: Record<string, string> = { leader: 'TAKES THE LEAD!', stretch: 'HOME STRETCH!', finalLap: 'FINAL LAP!', stumble: 'STUMBLE!', win: 'WINS IT!' };
      const cap = ev.code ? big[ev.code] : undefined;
      if (!cap) continue;
      const who = h ?? r.standings()[0];
      // Lead changes can flicker between two noses: only celebrate a real, new leader.
      if (ev.code === 'leader') {
        if (t < 6 || t - this.leaderCutAt < 12 || who.def.number === this.lastLeaderCut) continue;
        this.leaderCutAt = t; this.lastLeaderCut = who.def.number;
      }
      this.showCut(who, cap, t + (ev.code === 'win' ? 3 : 1.6));
      this.cutCooldown = t + 3.2;
    }
    if (this.cut && t > this.cut.until) { this.cut = null; (this.ui.querySelector('#bc-cut') as HTMLElement).hidden = true; }
  }

  private showCut(h: HorseState, caption: string, until: number): void {
    const el = this.ui.querySelector('#bc-cut') as HTMLElement;
    const who = this.names.get(h.def.id);
    el.innerHTML = `<div class="bc-cut-panel" style="--silk:${h.def.color}">
      <div class="bc-cut-face">${portraitSVG(h.def, 220)}</div>
      <div class="bc-cut-text"><b>${caption}</b><span>No. ${h.def.number} ${h.def.name}${who ? ` · ${who}` : ''}</span></div></div>`;
    el.hidden = false;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    this.cut = { until, html: el.innerHTML };
  }

  // ---------- drawing ----------
  private frame(now: number): void {
    const r = this.race;
    if (!r) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.direct(r);
    this.graphics(r);
    if (this.shot !== 'track') return;

    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const spriteH = h * 0.3;
    const spriteW = spriteH * 320 / 290;
    const ppm = spriteW / HORSE_M;
    // Camera follows the front of the field, keeping the leader at ~68% across.
    const lead = Math.max(...r.horses.map((x) => x.dist));
    // The front-runner's distance never jumps, so the camera can ride it exactly (no lag);
    // ease only the framing, which widens as the race nears the wire.
    const frame = r.finished ? 0.12 : 0.24;
    this.cam = lead - (w * frame) / ppm;
    const sx = (d: number, depth: number) => w / 2 + (d - this.cam) * ppm * depth;

    // Sky and paper hills.
    const sky = g.createLinearGradient(0, 0, 0, h * 0.45);
    sky.addColorStop(0, '#8FBFD3'); sky.addColorStop(1, '#E3EFF2');
    g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.45);
    this.hills(g, w, h, -this.cam * ppm * 0.08);
    this.stands(g, w, h, -this.cam * ppm * 0.3);
    // Infield turf strip, far rail, track.
    const trackTop = h * 0.5;
    const trackBot = h * 0.93;
    g.fillStyle = '#4F8A5B'; g.fillRect(0, h * 0.42, w, trackTop - h * 0.42);
    g.fillStyle = '#C9A27A'; g.fillRect(0, trackTop, w, trackBot - trackTop);
    // Harrow lines in the dirt, moving with the ground.
    g.strokeStyle = 'rgba(43,33,24,0.08)'; g.lineWidth = 2;
    const stripe = 2.5 * ppm;
    const off = (-(this.cam * ppm)) % stripe;
    for (let x = off - stripe; x < w + stripe; x += stripe) { g.beginPath(); g.moveTo(x, trackTop); g.lineTo(x - 30, trackBot); g.stroke(); }
    this.rail(g, w, trackTop, 0.82, ppm, 18);
    this.poles(g, r, w, trackTop, ppm, sx);

    // Horses, far lane first; feet on their lane's ground line.
    const laneY = (lane: number) => trackTop + (trackBot - trackTop) * (0.32 + 0.085 * Math.min(7, lane));
    const depthOf = (lane: number) => 0.88 + 0.035 * Math.min(7, lane);
    const drawn = [...r.horses].sort((a, b) => a.lane - b.lane);
    for (const hs of drawn) {
      const imgs = this.frames.get(hs.def.id);
      if (!imgs) continue;
      const depth = depthOf(hs.lane);
      const x = sx(hs.dist, depth);
      const y = laneY(hs.lane);
      const sw = spriteW * depth;
      const sh = spriteH * depth;
      if (x < -sw || x > w + sw) continue;
      const moving = hs.speed > 0.5 && !(hs.finished && hs.speed < 1);
      const pose = moving ? Math.floor(((hs.dist / STRIDE_M) % 1) * FRAMES) : 0;
      // Hoof dust.
      if (moving && Math.random() < dt * 14) this.dust.push({ x: x - sw * 0.35, y: y - 4, r: 4 + Math.random() * 6, life: 0.6 });
      g.drawImage(imgs[pose], x - sw / 2, y - sh * 0.93, sw, sh);
      // Saddle-cloth number (and a family player's name tag).
      const bx = x - sw * 0.06;
      const by = y - sh * 0.6;
      g.fillStyle = hs.def.color; g.strokeStyle = '#2B2118'; g.lineWidth = 2;
      g.beginPath(); g.arc(bx, by, 11 * depth, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = isLight(hs.def.color) ? '#2B2118' : '#FFFBF2';
      g.font = `900 ${Math.round(12 * depth)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(hs.def.number), bx, by + 0.5);
      const tag = this.names.get(hs.def.id);
      if (tag) this.nameTag(g, tag, x + sw * 0.1, y - sh * 1.02, depth);
    }
    // Dust puffs.
    for (const d of this.dust) { d.life -= dt; d.x -= 30 * dt; d.r += 14 * dt; }
    this.dust = this.dust.filter((d) => d.life > 0);
    for (const d of this.dust) { g.fillStyle = `rgba(169,143,110,${Math.max(0, d.life)})`; g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill(); }
    // Near rail in the foreground.
    this.rail(g, w, trackBot + 4, 1.25, ppm, 26);
    g.fillStyle = '#4F8A5B'; g.fillRect(0, trackBot + 10, w, h - trackBot - 10);
    this.minimap(g, r, w, h);
  }

  private hills(g: CanvasRenderingContext2D, w: number, h: number, off: number): void {
    const tile = 520;
    g.fillStyle = '#A9C8A0';
    for (let x = (off % tile) - tile; x < w + tile; x += tile) {
      g.beginPath(); g.moveTo(x, h * 0.42);
      g.quadraticCurveTo(x + 130, h * 0.22, x + 260, h * 0.36);
      g.quadraticCurveTo(x + 390, h * 0.26, x + 520, h * 0.42);
      g.closePath(); g.fill();
    }
  }

  private stands(g: CanvasRenderingContext2D, w: number, h: number, off: number): void {
    // A paper grandstand with a cheering crowd (dots) and bunting.
    const tile = 640;
    const top = h * 0.24;
    const bot = h * 0.42;
    const crowd = ['#C8452D', '#2F5D9E', '#E2A93B', '#FFFBF2', '#3E8E8A', '#7A3E8E', '#E48AA6'];
    for (let x = (off % tile) - tile; x < w + tile; x += tile) {
      g.fillStyle = '#E9DCC0'; g.fillRect(x + 40, top, 420, bot - top);
      g.fillStyle = '#C8452D'; g.beginPath(); g.moveTo(x + 30, top); g.lineTo(x + 250, top - h * 0.07); g.lineTo(x + 470, top); g.closePath(); g.fill();
      g.strokeStyle = '#2B2118'; g.lineWidth = 2; g.strokeRect(x + 40, top, 420, bot - top);
      for (let i = 0; i < 90; i++) {
        const cx = x + 52 + (i % 30) * 13.5;
        const cy = top + 10 + Math.floor(i / 30) * ((bot - top - 14) / 3) + ((i * 7) % 3);
        g.fillStyle = crowd[(i * 5 + Math.floor(x / tile)) % crowd.length];
        g.beginPath(); g.arc(cx, cy, 4.2, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 9; i++) {
        g.fillStyle = i % 2 ? '#FFD23F' : '#2F5D9E';
        const fx = x + 60 + i * 46;
        g.beginPath(); g.moveTo(fx, top + 2); g.lineTo(fx + 16, top + 2); g.lineTo(fx + 8, top + 14); g.closePath(); g.fill();
      }
    }
  }

  private rail(g: CanvasRenderingContext2D, w: number, y: number, depth: number, ppm: number, postH: number): void {
    const gap = 4 * ppm * depth;
    const off = (-(this.cam * ppm * depth)) % gap;
    g.fillStyle = '#FFFBF2'; g.strokeStyle = '#2B2118'; g.lineWidth = 1.5;
    for (let x = off - gap; x < w + gap; x += gap) { g.fillRect(x, y - postH, 5 * depth, postH); g.strokeRect(x, y - postH, 5 * depth, postH); }
    g.fillRect(0, y - postH, w, 6 * depth); g.beginPath(); g.moveTo(0, y - postH); g.lineTo(w, y - postH); g.stroke();
  }

  private poles(g: CanvasRenderingContext2D, r: Race, w: number, y: number, ppm: number, sx: (d: number, depth: number) => number): void {
    // Distance poles every 200 m (remaining) and the finish post.
    for (let left = 0; left <= r.distance; left += 200) {
      const d = r.distance - left;
      const x = sx(d, 0.82);
      if (x < -60 || x > w + 60) continue;
      if (left === 0) {
        for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#FFFBF2' : '#C8452D'; g.fillRect(x - 5, y - 120 + i * 15, 10, 15); }
        g.strokeStyle = '#2B2118'; g.lineWidth = 2; g.strokeRect(x - 5, y - 120, 10, 120);
        g.fillStyle = '#FFD23F'; g.fillRect(x - 40, y - 150, 80, 26); g.strokeRect(x - 40, y - 150, 80, 26);
        g.fillStyle = '#2B2118'; g.font = '900 15px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FINISH', x, y - 137);
        // Finish line across the track.
        g.fillStyle = 'rgba(255,251,242,0.85)'; g.fillRect(sx(d, 1) - 3, y, 6, 400);
      } else {
        g.fillStyle = '#2B2118'; g.fillRect(x - 2, y - 70, 4, 70);
        g.fillStyle = '#FFFBF2'; g.beginPath(); g.arc(x, y - 78, 15, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#2B2118'; g.font = '900 11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(left), x, y - 78);
      }
    }
    void ppm;
  }

  private nameTag(g: CanvasRenderingContext2D, text: string, x: number, y: number, depth: number): void {
    g.font = `900 ${Math.round(14 * depth)}px system-ui, sans-serif`;
    const tw = g.measureText(text).width + 14;
    g.fillStyle = '#FFFBF2'; g.strokeStyle = '#2B2118'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(x - tw / 2, y - 12, tw, 24, 6); g.fill(); g.stroke();
    g.fillStyle = '#2B2118'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 1);
  }

  private minimap(g: CanvasRenderingContext2D, r: Race, w: number, h: number): void {
    const mw = Math.min(220, w * 0.2);
    const mh = mw * 0.55;
    const x0 = w - mw - 16;
    const y0 = h - mh - 16;
    g.fillStyle = 'rgba(255,251,242,0.9)'; g.strokeStyle = '#2B2118'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(x0 - 8, y0 - 8, mw + 16, mh + 16, 12); g.fill(); g.stroke();
    const b = this.bounds;
    const px = (p: { x: number; y: number }) => ({ x: x0 + ((p.x - b.minX) / (b.maxX - b.minX)) * mw, y: y0 + ((p.y - b.minY) / (b.maxY - b.minY)) * mh });
    g.strokeStyle = '#C9A27A'; g.lineWidth = 10; g.beginPath();
    for (let d = 0; d <= 1200; d += 20) { const q = px(trackPoint(d, 0, r.distance)); if (d === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y); }
    g.closePath(); g.stroke();
    for (const hs of [...r.horses].sort((a, c) => a.dist - c.dist)) {
      const q = px(trackPoint(hs.dist, 0, r.distance));
      g.fillStyle = hs.def.color; g.strokeStyle = '#2B2118'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(q.x, q.y, this.names.has(hs.def.id) ? 8 : 6, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }

  private graphics(r: Race): void {
    const lead = r.standings()[0];
    const leader = this.ui.querySelector('#bc-leader') as HTMLElement | null;
    if (leader && lead) {
      const who = this.names.get(lead.def.id);
      const txt = `<i style="background:${lead.def.color}"></i><span>${r.finished ? 'WINNER' : 'LEADER'}</span><b>No. ${lead.def.number} ${lead.def.name}</b>${who ? `<em>${who}</em>` : ''}`;
      if (leader.dataset.k !== txt) { leader.dataset.k = txt; leader.innerHTML = txt; }
    }
    const count = this.ui.querySelector('#bc-count') as HTMLElement | null;
    if (count) {
      const left = r.distance - Math.max(...r.horses.map((x) => x.dist));
      const shown = left <= 1000 && left > 0 && !r.finished;
      count.hidden = !shown;
      if (shown) {
        const step = Math.ceil(left / 100) * 100;
        if (count.dataset.v !== String(step)) { count.dataset.v = String(step); count.innerHTML = `<b>${step}</b><span>m to go</span>`; count.classList.remove('tick'); void count.offsetWidth; count.classList.add('tick'); }
      }
    }
  }
}

function isLight(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}
