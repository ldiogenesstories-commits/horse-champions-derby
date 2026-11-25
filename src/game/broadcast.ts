// TV broadcast: a paper-craft "live TV" presentation of the race for the big screen.
// A trackside camera follows the leaders with full-body galloping horses over layered
// paper scenery; a director cuts to the overhead oval (the Phaser view underneath) and
// pops comic-book panels on big moments; TV graphics show the race, the leader, a mini
// map, and the final-1,000 m countdown (a nod to Derby Owners Club's main screen).
import type { Race } from '../sim/race';
import type { HorseDef, HorseState } from '../sim/types';
import { trackPoint } from '../sim/track';
import { DEFAULT_JOCKEY, type Jockey, type SilksPattern } from './jockey';
import { portraitSVG } from './portrait';
import { puppetFrames, puppetFrontFrames } from './puppet';
import { loadScenery, tileRun, tileX, type Scenery } from './scenery';

const FRAMES = 12; // gallop poses per horse
const STRIDE_M = 7; // metres per full gallop cycle
const HORSE_M = 3.4; // how many track metres one horse sprite spans
const SPRITE_W = 420; // px each pose is rendered at
const PATTERNS: SilksPattern[] = ['hoops', 'stripes', 'diamonds', 'stars', 'chevron', 'halves', 'sash', 'solid'];

type Shot = 'track' | 'aerial' | 'close' | 'rail' | 'headon' | 'winner';
const SHOT_LABEL: Record<Shot, string> = { track: 'TRACKSIDE', aerial: 'AERIAL VIEW', close: 'CLOSE-UP', rail: 'RAIL CAM', headon: 'HEAD-ON', winner: 'WINNER CAM' };
// The director's rotation between big moments (seconds of race time per shot).
const PLAYLIST: [Shot, number][] = [['track', 6], ['close', 4.5], ['track', 4], ['rail', 4], ['headon', 5], ['track', 5], ['close', 4], ['aerial', 4.5]];
const FRONT_FRAMES = 8;
const FX_LEN = 1.7; // seconds the final-stretch freeze holds

interface Cut { until: number; html: string }

/** A jockey for computer horses, dressed in the horse's racing colour. */
export function cpuJockey(def: HorseDef): Jockey {
  return { ...DEFAULT_JOCKEY, name: '', pattern: PATTERNS[def.number % PATTERNS.length], primary: def.color, secondary: '#FFFBF2', cap: def.color };
}

export class Broadcast {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ui: HTMLElement;
  private race: Race | null = null;
  private frames = new Map<string, CanvasImageSource[]>();
  private fronts = new Map<string, CanvasImageSource[]>();
  private sc: Scenery | null = null;
  private pl = 0;
  private focus = '';
  private focusTurn = 0;
  private railAt = 0;
  private finale = false;
  /** The final-stretch freeze: a comic-book beat 100 m out (runs once per race). */
  private fx: { start: number; hero: string; snap: Map<string, { dist: number; lane: number }> } | null = null;
  private fxDone = false;
  private sil = new WeakMap<CanvasImageSource, HTMLCanvasElement>();
  private camLane = 3;
  private names = new Map<string, string>(); // horse id -> jockey name (family players)
  private raf = 0;
  private last = 0;
  private cam = 0;
  private shot: Shot = 'aerial';
  private shotUntil = 0;
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
    this.sc = await loadScenery();
    const jobs = race.horses.map(async (h) => {
      const j = jockeys.get(h.def.id) ?? cpuJockey(h.def);
      if (jockeys.has(h.def.id) && j.name && j.name !== 'You') this.names.set(h.def.id, j.name);
      // Side-on: the jointed felt puppet (recoloured for this horse's coat and rider's silks).
      this.frames.set(h.def.id, await puppetFrames(h.def, j, FRAMES, SPRITE_W));
      // Head-on: the front-view felt puppet, same recolouring.
      this.fronts.set(h.def.id, await puppetFrontFrames(h.def, j, FRONT_FRAMES, 280, 378));
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
    this.pl = 0;
    this.finale = false;
    this.fx = null;
    this.fxDone = false;
    this.focusTurn = 0;
    this.leaderCutAt = -99;
    this.lastLeaderCut = -1;
    this.cutCooldown = 0;
    this.onShot('aerial');
    this.ui.innerHTML = `
      <div class="bc-bug"><b>HORSE CHAMPIONS DERBY</b><span id="bc-race"></span></div>
      <div class="bc-shot" id="bc-shot"></div>
      <div class="bc-count" id="bc-count" hidden></div>
      <div class="bc-leader" id="bc-leader"></div>
      <div class="bc-cut" id="bc-cut" hidden></div>`;
    this.shot = 'track';
    this.setShot('aerial', 3);
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
    if (s !== this.shot) { this.shot = s; this.onShot(s); this.dust = []; }
    this.shotUntil = until;
    this.canvas.style.display = s === 'aerial' ? 'none' : 'block';
    const label = this.ui.querySelector('#bc-shot') as HTMLElement | null;
    if (!label) return;
    const f = this.race?.horses.find((x) => x.def.id === this.focus);
    label.textContent = (s === 'close' || s === 'winner') && f ? `${SHOT_LABEL[s]} · No. ${f.def.number}` : SHOT_LABEL[s];
  }

  /** Who the close-up follows: take turns between family players' horses and the leader. */
  private pickFocus(r: Race): string {
    const people = r.horses.filter((x) => this.names.has(x.def.id) && !x.finished);
    const lead = r.standings()[0];
    const pool = [lead, ...people];
    const pick = pool[this.focusTurn++ % pool.length] ?? lead;
    return pick.def.id;
  }

  private direct(r: Race): void {
    const t = r.t;
    const lead = Math.max(...r.horses.map((h) => h.dist));
    const left = r.distance - lead;
    if (r.finished && this.shot !== 'winner') {
      // Wire-to-wire done: hold a close-up on the winner.
      this.focus = r.standings()[0].def.id;
      this.setShot('winner', Infinity);
    } else if (!r.finished && !this.finale && left < 240 && t > 4) {
      // The drive home: head-on as they bear down on us, then side-on to the wire.
      this.finale = true;
      this.setShot('headon', Infinity);
    } else if (this.finale && this.shot === 'headon' && left < 75) {
      this.setShot('track', Infinity);
    } else if (!this.finale && !r.finished && t >= this.shotUntil) {
      const [shot, len] = PLAYLIST[this.pl++ % PLAYLIST.length];
      if (shot === 'close') this.focus = this.pickFocus(r);
      if (shot === 'rail') this.railAt = lead + 13; // the camera waits by the rail just ahead of the leader
      this.setShot(shot, t + len);
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

  /** A black cut-out of a pose (cached), for shadow-puppet rivals and ink outlines. */
  private silhouette(img: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
    let c = this.sil.get(img);
    if (!c) {
      c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#17110C'; g.fillRect(0, 0, c.width, c.height);
      this.sil.set(img, c);
    }
    return c;
  }

  /** Viewtiful moment: yellow burst, speed lines, rivals as shadow puppets, the leader inked in full colour, BREAKAWAY! */
  private drawFinale(g: CanvasRenderingContext2D, r: Race, w: number, h: number, el: number): void {
    const fx = this.fx!;
    const hero = r.horses.find((x) => x.def.id === fx.hero)!;
    const hs = fx.snap.get(hero.def.id)!;
    const zoom = 1 + Math.min(1, el / FX_LEN) * 0.08;
    g.save();
    g.translate(w / 2, h / 2); g.scale(zoom, zoom); g.translate(-w / 2, -h / 2);
    const vx = w * 0.64; const vy = h * 0.5;
    const burst = g.createRadialGradient(vx, vy, 0, vx, vy, Math.max(w, h) * 0.8);
    burst.addColorStop(0, '#FFF6C4'); burst.addColorStop(0.45, '#FFD23F'); burst.addColorStop(1, '#F59A23');
    g.fillStyle = burst; g.fillRect(-w, -h, w * 3, h * 3);
    // Speed lines radiating from behind the hero, creeping round.
    g.strokeStyle = 'rgba(23,17,12,0.85)'; g.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + el * 0.15;
      const r0 = Math.min(w, h) * (0.32 + (i % 3) * 0.06);
      g.lineWidth = [2, 6, 3, 9][i % 4];
      g.beginPath(); g.moveTo(vx + Math.cos(a) * r0, vy + Math.sin(a) * r0); g.lineTo(vx + Math.cos(a) * w * 1.6, vy + Math.sin(a) * w * 1.6); g.stroke();
    }
    // Halftone dots fading in from the bottom-left corner.
    g.fillStyle = '#E8343F';
    const step = Math.max(14, w / 70);
    for (let y = h * 0.45; y < h + step; y += step) {
      for (let x = (Math.floor(y / step) % 2) * step / 2; x < w * 0.55; x += step) {
        const k = Math.max(0, 1 - Math.hypot(x / (w * 0.55), (h - y) / (h * 0.55)));
        if (k > 0.05) { g.beginPath(); g.arc(x, y, step * 0.42 * k, 0, Math.PI * 2); g.fill(); }
      }
    }
    // Shadow-puppet stage floor.
    const ground = h * 0.8;
    g.fillStyle = '#17110C'; g.fillRect(-w, ground, w * 3, h * 2);
    const spriteH = h * 0.36;
    const spriteW = spriteH * 320 / 290;
    const poseOf = (dist: number) => Math.floor(((dist / STRIDE_M) % 1) * FRAMES);
    // Rivals: black cut-outs, farthest lane first, around the hero.
    const rivals = [...r.horses].filter((x) => x.def.id !== hero.def.id).sort((a, b) => fx.snap.get(b.def.id)!.lane - fx.snap.get(a.def.id)!.lane);
    for (const rv of rivals) {
      const sn = fx.snap.get(rv.def.id)!;
      const imgs = this.frames.get(rv.def.id) as (HTMLCanvasElement[] | undefined);
      if (!imgs) continue;
      const depth = 0.8 + 0.03 * Math.min(7, sn.lane);
      // Squeeze the field so the chasers stay in frame: the further back, the less extra room.
      const gap = Math.max(0, hs.dist - sn.dist);
      const x = vx - spriteW * 0.55 - Math.sqrt(gap) * w * 0.07;
      const y = ground - (7 - Math.min(7, sn.lane)) * h * 0.012;
      if (x < -spriteW || x > w + spriteW) continue;
      g.drawImage(this.silhouette(imgs[poseOf(sn.dist)]), x - spriteW * depth / 2, y - spriteH * depth * 0.93, spriteW * depth, spriteH * depth);
    }
    // The hero in full colour with a thick ink outline and a hard drop shadow.
    const himgs = this.frames.get(hero.def.id) as (HTMLCanvasElement[] | undefined);
    if (himgs) {
      const img = himgs[poseOf(hs.dist)];
      const hw = spriteW * 1.55; const hh = spriteH * 1.55;
      const hx = vx - hw / 2; const hy = ground + h * 0.02 - hh * 0.93;
      const ink = this.silhouette(img);
      g.drawImage(ink, hx + 10, hy + 8, hw, hh);
      const o = Math.max(3, w / 320);
      for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]]) g.drawImage(ink, hx + dx, hy + dy, hw, hh);
      g.drawImage(img, hx, hy, hw, hh);
      // Close-up panel: the hero's head, top left.
      const px0 = w * 0.04; const py0 = h * 0.08; const px1 = w * 0.4; const py1 = h * 0.42;
      g.save();
      g.beginPath(); g.moveTo(px0, py0); g.lineTo(px1, py0); g.lineTo(px1 - w * 0.05, py1); g.lineTo(px0, py1); g.closePath();
      g.fillStyle = '#E8343F'; g.fill();
      g.clip();
      g.strokeStyle = 'rgba(255,210,63,0.8)'; g.lineWidth = 5;
      for (let i = 0; i < 6; i++) { const y = py0 + (py1 - py0) * (0.15 + i * 0.15); g.beginPath(); g.moveTo(px0, y); g.lineTo(px0 + (px1 - px0) * (0.25 + (i % 3) * 0.1), y); g.stroke(); }
      const zw = hw * 2.2; const zh = hh * 2.2;
      g.drawImage(img, px1 - zw * 0.92, py0 - zh * 0.02, zw, zh);
      g.restore();
      g.lineJoin = 'round';
      g.beginPath(); g.moveTo(px0, py0); g.lineTo(px1, py0); g.lineTo(px1 - w * 0.05, py1); g.lineTo(px0, py1); g.closePath();
      g.strokeStyle = '#FFFBF2'; g.lineWidth = 12; g.stroke();
      g.strokeStyle = '#17110C'; g.lineWidth = 5; g.stroke();
    }
    // Lettering.
    const pop = Math.min(1, el / 0.25);
    const size = h * 0.15 * (0.6 + 0.4 * pop);
    g.save();
    g.translate(w * 0.69, h * 0.2); g.rotate(-0.12);
    g.font = `italic 900 ${Math.round(size)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.fillStyle = '#17110C'; g.fillText('BREAKAWAY!', 10, 10);
    g.strokeStyle = '#17110C'; g.lineWidth = size * 0.14; g.strokeText('BREAKAWAY!', 0, 0);
    g.fillStyle = '#E8343F'; g.fillText('BREAKAWAY!', 0, 0);
    g.restore();
    const who = this.names.get(hero.def.id);
    const cap = `No. ${hero.def.number} ${hero.def.name}${who ? ` · ${who}` : ''}`;
    g.font = `900 ${Math.round(h * 0.035)}px system-ui, sans-serif`;
    const tw = g.measureText(cap).width + 24;
    g.fillStyle = '#17110C'; g.fillRect(w * 0.04, h * 0.44, tw, h * 0.06);
    g.fillStyle = '#FFD23F'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(cap, w * 0.04 + 12, h * 0.47);
    g.restore();
    // White flash in and out.
    const flash = el < 0.12 ? 1 - el / 0.12 : el > FX_LEN - 0.15 ? (el - (FX_LEN - 0.15)) / 0.15 : 0;
    if (flash > 0) { g.fillStyle = `rgba(255,251,242,${flash})`; g.fillRect(0, 0, w, h); }
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
    // The drive home: freeze for a beat, rivals in shadow, the leader in full colour.
    const left = r.distance - Math.max(...r.horses.map((x) => x.dist));
    if (!this.fxDone && !r.finished && r.t > 4 && left < 110) {
      this.fxDone = true;
      const hero = r.standings()[0];
      this.fx = { start: now, hero: hero.def.id, snap: new Map(r.horses.map((x) => [x.def.id, { dist: x.dist, lane: x.lane }])) };
      (this.ui.querySelector('#bc-cut') as HTMLElement | null)?.setAttribute('hidden', '');
    }
    if (this.fx) {
      const el = (now - this.fx.start) / 1000;
      if (el < FX_LEN) {
        const c0 = this.canvas;
        const dpr0 = Math.min(window.devicePixelRatio || 1, 2);
        c0.style.display = 'block';
        if (c0.width !== Math.round(c0.clientWidth * dpr0) || c0.height !== Math.round(c0.clientHeight * dpr0)) { c0.width = Math.round(c0.clientWidth * dpr0); c0.height = Math.round(c0.clientHeight * dpr0); }
        this.ctx.setTransform(dpr0, 0, 0, dpr0, 0, 0);
        this.drawFinale(this.ctx, r, c0.clientWidth, c0.clientHeight, el);
        return;
      }
      this.fx = null;
      this.canvas.style.display = this.shot === 'aerial' ? 'none' : 'block';
    }
    if (this.shot === 'aerial') return;
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.shot === 'headon') this.drawHeadOn(g, r, w, h, dt);
    else this.drawSide(g, r, w, h, dt);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.shot !== 'winner') this.minimap(g, r, w, h);
  }

  /** Side-on shots: wide trackside, close-up on one horse, fixed rail cam, winner cam. */
  private drawSide(g: CanvasRenderingContext2D, r: Race, w: number, h: number, dt: number): void {
    const shot = this.shot;
    const spriteH = h * 0.3;
    const spriteW = spriteH * 320 / 290;
    const ppm = spriteW / HORSE_M;
    const trackTop = h * 0.5;
    const trackBot = h * 0.93;
    const laneY = (lane: number) => trackTop + (trackBot - trackTop) * (0.32 + 0.085 * Math.min(7, lane));
    const depthOf = (lane: number) => 0.88 + 0.035 * Math.min(7, lane);
    const lead = Math.max(...r.horses.map((x) => x.dist));
    const focus = r.horses.find((x) => x.def.id === this.focus) ?? r.standings()[0];
    let zoom = 1;
    let pivotX = w / 2;
    let pivotY = h / 2;
    if (shot === 'track') this.cam = lead - (w * (r.finished ? 0.12 : 0.24)) / ppm;
    else if (shot === 'rail') { this.cam = this.railAt; zoom = 1.45; pivotY = h * 0.78; }
    else {
      // Close-up / winner cam: lock onto one horse, telephoto.
      zoom = shot === 'winner' ? 2.4 : 2.1;
      this.cam = focus.dist;
      pivotX = w / 2;
      pivotY = laneY(focus.lane) - spriteH * depthOf(focus.lane) * 0.42;
    }
    if (zoom !== 1) {
      // Scale the whole scene about the pivot, then put the pivot at the frame's centre line.
      g.translate(w / 2, shot === 'rail' ? pivotY : h * 0.55);
      g.scale(zoom, zoom);
      g.translate(-pivotX, -pivotY);
    }
    const sx = (d: number, depth: number) => w / 2 + (d - this.cam) * ppm * depth;
    // Draw a little past the frame edges so zoomed shots never show a seam.
    const L = -w; const R = 2 * w;
    const sky = g.createLinearGradient(0, -h, 0, h * 0.45);
    sky.addColorStop(0, '#6FA8C2'); sky.addColorStop(1, '#E3EFF2');
    g.fillStyle = sky; g.fillRect(L, -h, R - L, h * 1.45);
    if (this.sc) this.backdrop(g, this.sc, L, R, w, h, ppm);
    else { this.hills(g, L, R, h, -this.cam * ppm * 0.08); this.stands(g, L, R, h, -this.cam * ppm * 0.3); }
    g.fillStyle = '#4F8A5B'; g.fillRect(L, h * 0.42, R - L, trackTop - h * 0.42);
    g.fillStyle = '#C9A27A'; g.fillRect(L, trackTop, R - L, trackBot - trackTop);
    g.strokeStyle = 'rgba(43,33,24,0.08)'; g.lineWidth = 2;
    const stripe = 2.5 * ppm;
    const off = (-(this.cam * ppm)) % stripe;
    for (let x = L + off - stripe; x < R + stripe; x += stripe) { g.beginPath(); g.moveTo(x, trackTop); g.lineTo(x - 30, trackBot); g.stroke(); }
    if (shot === 'close' || shot === 'winner') {
      // Speed lines streak past behind the horse.
      g.strokeStyle = 'rgba(255,251,242,0.55)'; g.lineWidth = 2;
      const k = (performance.now() / 4) % 300;
      for (let i = 0; i < 14; i++) {
        const y = trackTop - 60 + ((i * 53) % 140);
        const x = R - ((k * (1 + (i % 3) * 0.5) + i * 97) % (R - L));
        if (!r.finished || shot === 'close') { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 70 + (i % 4) * 25, y); g.stroke(); }
      }
    }
    this.rail(g, L, R, trackTop, 0.82, ppm, 18);
    this.poles(g, r, L, R, trackTop, sx);

    const drawn = [...r.horses].sort((a, b) => a.lane - b.lane);
    for (const hs of drawn) {
      const imgs = this.frames.get(hs.def.id);
      if (!imgs) continue;
      const depth = depthOf(hs.lane);
      const x = sx(hs.dist, depth);
      const y = laneY(hs.lane);
      const sw = spriteW * depth;
      const sh = spriteH * depth;
      if (x < L - sw || x > R + sw) continue;
      const moving = hs.speed > 0.5;
      const pose = moving ? Math.floor(((hs.dist / STRIDE_M) % 1) * FRAMES) : 0;
      if (moving && Math.random() < dt * 14) this.dust.push({ x: x - sw * 0.35, y: y - 4, r: 4 + Math.random() * 6, life: 0.6 });
      g.drawImage(imgs[pose], x - sw / 2, y - sh * 0.93, sw, sh);
      // Number cloth on the barrel, below the rider.
      const bx = x - sw * 0.1;
      const by = y - sh * 0.47;
      g.fillStyle = hs.def.color; g.strokeStyle = '#2B2118'; g.lineWidth = 2;
      g.beginPath(); g.arc(bx, by, 11 * depth, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = isLight(hs.def.color) ? '#2B2118' : '#FFFBF2';
      g.font = `900 ${Math.round(12 * depth)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(hs.def.number), bx, by + 0.5);
      const tag = this.names.get(hs.def.id);
      if (tag && zoom === 1) this.nameTag(g, tag, x + sw * 0.1, y - sh * 1.02, depth);
    }
    for (const d of this.dust) { d.life -= dt; d.x -= 30 * dt; d.r += 14 * dt; }
    this.dust = this.dust.filter((d) => d.life > 0);
    for (const d of this.dust) { g.fillStyle = `rgba(169,143,110,${Math.max(0, d.life)})`; g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill(); }
    this.rail(g, L, R, trackBot + 4, 1.25, ppm, 26);
    g.fillStyle = '#4F8A5B'; g.fillRect(L, trackBot + 10, R - L, h * 2);
    // When the rail-cam has seen them all go by, cut away early.
    if (shot === 'rail' && r.horses.every((x) => sx(x.dist, 1) > w * 1.25)) this.shotUntil = 0;
  }

  /** Head-on dolly: the camera rolls backwards ahead of the leader, the field charging at us. */
  private drawHeadOn(g: CanvasRenderingContext2D, r: Race, w: number, h: number, dt: number): void {
    const lead = Math.max(...r.horses.map((x) => x.dist));
    const camD = Math.min(lead + 15, r.distance + 6);
    const f = h * 3.1;
    const horizon = h * 0.34;
    const camH = 1.7;
    const LW = 1.25; // a touch wider than real lanes so the field reads
    // Pan sideways to keep the leader in front of the lens.
    const leader = r.horses.reduce((a, b) => (b.dist > a.dist ? b : a));
    const want = Math.max(0.6, Math.min(6.5, leader.lane + 0.6));
    this.camLane = this.dust.length === 0 ? want : this.camLane + (want - this.camLane) * Math.min(1, dt * 1.5);
    const proj = (dist: number, lane: number) => {
      const z = Math.max(0.5, camD - dist);
      return { x: w / 2 + (lane - this.camLane) * LW * f / z, y: horizon + camH * f / z, s: f / z, z };
    };
    // Sky, far hills and the grandstand off to the outside.
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#6FA8C2'); sky.addColorStop(1, '#E3EFF2');
    g.fillStyle = sky; g.fillRect(0, 0, w, horizon);
    const sc = this.sc;
    if (sc) {
      // Felt sky: paper sun, drifting clouds, hills on the horizon (panning a little with the camera).
      const sun = h * 0.14;
      g.drawImage(sc.sun, w * 0.78, h * 0.02, sun, sun);
      tileRun(g, [{ img: sc.cloud1, height: h * 0.075, gap: w * 0.35 }, { img: sc.cloud2, height: h * 0.06, gap: w * 0.5 }], -w, 2 * w, -performance.now() * 0.006, h * 0.15);
      tileX(g, sc.hills, -w, 2 * w, -this.camLane * 40, horizon + 4, h * 0.14);
    } else {
      g.fillStyle = '#A9C8A0';
      g.beginPath(); g.moveTo(0, horizon); g.quadraticCurveTo(w * 0.25, horizon - h * 0.1, w * 0.5, horizon - h * 0.02); g.quadraticCurveTo(w * 0.75, horizon - h * 0.12, w, horizon); g.closePath(); g.fill();
    }
    // Ground: infield (inside the inner rail), dirt, then the apron by the stands.
    g.fillStyle = '#4F8A5B'; g.fillRect(0, horizon, w, h - horizon);
    const far = 400;
    const quad = (l1: number, l2: number, color: string) => {
      const a = proj(camD - far, l1); const b = proj(camD - far, l2); const c = proj(camD - 1.2, l2); const d = proj(camD - 1.2, l1);
      g.fillStyle = color; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fill();
    };
    quad(-0.8, 9.5, '#C9A27A');
    quad(9.5, 30, '#E9DCC0');
    // Felt scenery standing beside the track like stage flats, farthest first:
    // cardboard grandstands outside the rail, felt trees in the infield.
    if (sc) {
      const flats: { d: number; lane: number; img: HTMLImageElement; m: number }[] = [];
      const first = (step: number, off: number) => Math.ceil((camD - 160 - off) / step) * step + off;
      for (let d = first(48, 0); d < camD - 4; d += 48) flats.push({ d, lane: 15.5, img: sc.stands, m: 7.5 });
      for (let d = first(16, 5); d < camD - 3; d += 16) flats.push({ d, lane: -4, img: [sc.tree1, sc.tree2, sc.tree3][Math.abs(Math.floor(d / 16)) % 3], m: 5 });
      flats.sort((x, y) => x.d - y.d);
      for (const f of flats) {
        const p = proj(f.d, f.lane);
        const hh = f.m * p.s;
        const ww = hh * f.img.naturalWidth / f.img.naturalHeight;
        if (p.x - ww / 2 > w || p.x + ww / 2 < 0) continue;
        g.drawImage(f.img, p.x - ww / 2, p.y - hh, ww, hh);
      }
    } else {
      const a = proj(camD - far, 12); const d = proj(camD - 2, 12);
      const top = (p: { y: number; s: number }) => p.y - 9 * p.s;
      g.fillStyle = '#E9DCC0'; g.strokeStyle = '#2B2118'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x, top(a)); g.lineTo(d.x, top(d)); g.lineTo(d.x, d.y); g.closePath(); g.fill(); g.stroke();
      const crowd = ['#C8452D', '#2F5D9E', '#E2A93B', '#FFFBF2', '#3E8E8A', '#7A3E8E', '#E48AA6'];
      for (let k = 3; k < 120; k += 1.6) {
        const p = proj(camD - k, 12);
        if (p.x > w + 50) continue;
        for (let row = 0; row < 3; row++) {
          g.fillStyle = crowd[(Math.floor(k * 3) + row * 2) % crowd.length];
          g.beginPath(); g.arc(p.x, p.y - (2.2 + row * 2.3) * p.s, Math.max(1, 0.42 * p.s), 0, Math.PI * 2); g.fill();
        }
      }
    }
    // Harrow lines and rails with posts rushing toward the camera.
    const posts = (lane: number, hgt: number) => {
      const p0 = proj(camD - far, lane); const p1 = proj(camD - 1.2, lane);
      const t0 = { x: p0.x, y: p0.y - hgt * p0.s }; const t1 = { x: p1.x, y: p1.y - hgt * p1.s };
      g.strokeStyle = '#FFFBF2'; g.lineWidth = 1; 
      const first = Math.ceil((camD - 120) / 4) * 4;
      for (let d = first; d < camD - 1.5; d += 4) {
        const p = proj(d, lane);
        g.fillStyle = '#FFFBF2'; g.fillRect(p.x - 0.06 * p.s, p.y - hgt * p.s, 0.12 * p.s, hgt * p.s);
      }
      g.strokeStyle = '#2B2118'; g.lineWidth = 1.5;
      g.fillStyle = '#FFFBF2';
      g.beginPath(); g.moveTo(t0.x, t0.y); g.lineTo(t1.x, t1.y); g.lineTo(t1.x, t1.y + 0.12 * p1.s); g.lineTo(t0.x, t0.y + 1); g.closePath(); g.fill(); g.stroke();
    };
    g.strokeStyle = 'rgba(43,33,24,0.1)'; g.lineWidth = 2;
    for (let d = Math.ceil((camD - 150) / 3) * 3; d < camD - 1.5; d += 3) {
      const a = proj(d, -0.8); const b = proj(d, 9.5);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    // Finish line across the track when it's in view.
    if (r.distance < camD - 1.2) {
      const a = proj(r.distance, -0.8); const b = proj(r.distance, 9.5);
      g.strokeStyle = 'rgba(255,251,242,0.9)'; g.lineWidth = Math.max(2, 0.25 * a.s);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    posts(-0.8, 1.1);
    posts(9.5, 1.1);
    // The field, farthest first.
    const order = [...r.horses].sort((a, b) => a.dist - b.dist);
    for (const hs of order) {
      const imgs = this.fronts.get(hs.def.id);
      if (!imgs) continue;
      const p = proj(hs.dist, hs.lane);
      if (p.z < 2.5) continue;
      const hgt = 2.7 * p.s;
      const wid = hgt * 200 / 270;
      const moving = hs.speed > 0.5;
      const pose = moving ? Math.floor(((hs.dist / STRIDE_M) % 1) * FRONT_FRAMES) : 0;
      if (moving && Math.random() < dt * 10) this.dust.push({ x: p.x + (Math.random() - 0.5) * wid * 0.6, y: p.y - 0.1 * p.s, r: 0.2 * p.s, life: 0.5 });
      g.drawImage(imgs[pose], p.x - wid / 2, p.y - hgt * 0.96, wid, hgt);
      const by = p.y - hgt * 0.66;
      const br = Math.max(6, 0.19 * p.s);
      g.fillStyle = hs.def.color; g.strokeStyle = '#2B2118'; g.lineWidth = 2;
      g.beginPath(); g.arc(p.x - wid * 0.36, by, br, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = isLight(hs.def.color) ? '#2B2118' : '#FFFBF2';
      g.font = `900 ${Math.round(br * 1.1)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(hs.def.number), p.x - wid * 0.36, by + 0.5);
      const tag = this.names.get(hs.def.id);
      if (tag && p.z < 45) this.nameTag(g, tag, p.x, p.y - hgt * 1.04, Math.min(1.4, Math.max(0.7, p.s / 40)));
    }
    for (const d of this.dust) { d.life -= dt; d.y -= 8 * dt; d.r *= 1 + dt * 1.5; }
    this.dust = this.dust.filter((d) => d.life > 0);
    for (const d of this.dust) { g.fillStyle = `rgba(169,143,110,${Math.max(0, d.life * 0.9)})`; g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill(); }
  }

  /** Felt scenery: paper sun, drifting clouds, hills, then the grandstand and trees, each at its own parallax. */
  private backdrop(g: CanvasRenderingContext2D, sc: Scenery, L: number, R: number, w: number, h: number, ppm: number): void {
    const sun = h * 0.17;
    g.drawImage(sc.sun, w * 0.8 - sun / 2, h * 0.03, sun, sun);
    tileRun(g, [{ img: sc.cloud1, height: h * 0.09, gap: w * 0.32 }, { img: sc.cloud2, height: h * 0.075, gap: w * 0.45 }], L, R, -this.cam * ppm * 0.03 - performance.now() * 0.004, h * 0.17);
    tileX(g, sc.hills, L, R, -this.cam * ppm * 0.08, h * 0.44, h * 0.2);
    tileRun(g, [
      { img: sc.stands, height: h * 0.24, gap: h * 0.04 },
      { img: sc.tree1, height: h * 0.19, gap: h * 0.02 },
      { img: sc.tree2, height: h * 0.16, gap: h * 0.03 },
      { img: sc.tree3, height: h * 0.2, gap: h * 0.12 },
    ], L, R, -this.cam * ppm * 0.3, h * 0.435);
  }

  private hills(g: CanvasRenderingContext2D, L: number, R: number, h: number, off: number): void {
    const tile = 520;
    g.fillStyle = '#A9C8A0';
    for (let x = L + (off % tile) - tile; x < R + tile; x += tile) {
      g.beginPath(); g.moveTo(x, h * 0.42);
      g.quadraticCurveTo(x + 130, h * 0.22, x + 260, h * 0.36);
      g.quadraticCurveTo(x + 390, h * 0.26, x + 520, h * 0.42);
      g.closePath(); g.fill();
    }
  }

  private stands(g: CanvasRenderingContext2D, L: number, R: number, h: number, off: number): void {
    // A paper grandstand with a cheering crowd (dots) and bunting.
    const tile = 640;
    const top = h * 0.24;
    const bot = h * 0.42;
    const crowd = ['#C8452D', '#2F5D9E', '#E2A93B', '#FFFBF2', '#3E8E8A', '#7A3E8E', '#E48AA6'];
    for (let x = L + (off % tile) - tile; x < R + tile; x += tile) {
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

  private rail(g: CanvasRenderingContext2D, L: number, R: number, y: number, depth: number, ppm: number, postH: number): void {
    if (this.sc) { tileX(g, this.sc.fence, L, R, -(this.cam * ppm * depth), y + 3, postH * 1.7, false); return; }
    const gap = 4 * ppm * depth;
    const off = (-(this.cam * ppm * depth)) % gap;
    g.fillStyle = '#FFFBF2'; g.strokeStyle = '#2B2118'; g.lineWidth = 1.5;
    for (let x = L + off - gap; x < R + gap; x += gap) { g.fillRect(x, y - postH, 5 * depth, postH); g.strokeRect(x, y - postH, 5 * depth, postH); }
    g.fillRect(L, y - postH, R - L, 6 * depth); g.beginPath(); g.moveTo(L, y - postH); g.lineTo(R, y - postH); g.stroke();
  }

  private poles(g: CanvasRenderingContext2D, r: Race, L: number, R: number, y: number, sx: (d: number, depth: number) => number): void {
    // Distance poles every 200 m (remaining) and the finish post.
    for (let left = 0; left <= r.distance; left += 200) {
      const d = r.distance - left;
      const x = sx(d, 0.82);
      if (x < L - 60 || x > R + 60) continue;
      if (left === 0) {
        if (this.sc) g.drawImage(this.sc.finish, x - 12, y - 128, 128 * this.sc.finish.naturalWidth / this.sc.finish.naturalHeight, 128);
        else { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#FFFBF2' : '#C8452D'; g.fillRect(x - 5, y - 120 + i * 15, 10, 15); } }
        g.strokeStyle = '#2B2118'; g.lineWidth = 2;
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
