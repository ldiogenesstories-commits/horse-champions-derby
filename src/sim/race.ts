// Horse Champions Derby — race engine.
// Fixed-step, seeded, renderer-agnostic. One instance = one race.

import { makeRng } from './rng';
import { RACE_DISTANCE, MAX_LANE, LAP, railProgress, lapInfo } from './track';
import {
  DEFAULT_TUNING,
  type Entrant,
  type HorseState,
  type Phase,
  type RaceEvent,
  type RunningStyle,
  type TrackPlan,
  type Tuning,
} from './types';

export const STEP = 1 / 30;

// Race landmarks are measured in meters so they hold across distances.
const START_LEN = 150; // the break
const STRETCH_LEFT = 132; // top of the home stretch
const DRIVE_LEFT = 180; // when riders start driving in earnest
const CALL_LEFT = 216; // "down the stretch they come"
/** Meters before the finish where the closing phase starts. */
function closeLen(d: number): number { return 360 + 0.1 * (d - LAP); }
/** Meters before the finish where a Late Kick fires. */
function kickLen(d: number): number { return 250 + 0.1 * (d - LAP); }

export type DistancePref = 'sprint' | 'mile' | 'classic' | 'endurance';
const DIST_ORDER: DistancePref[] = ['sprint', 'mile', 'classic', 'endurance'];
export function distanceClass(d: number): DistancePref {
  return d <= 1300 ? 'sprint' : d <= 1900 ? 'mile' : d <= 2700 ? 'classic' : 'endurance';
}

const STYLE_FOR_PLAN: Record<TrackPlan, RunningStyle> = {
  lead: 'front',
  stalk: 'stalker',
  mid: 'mid',
  lag: 'closer',
};

export interface PlayerInput {
  hold?: boolean;
  whip?: boolean;
  /** Request a lane (0 = rail). The jockey attempts it; it can fail. */
  lane?: number;
  auto?: boolean;
  track?: HorseState['plan']['track'];
  close?: HorseState['plan']['close'];
  lanePref?: HorseState['plan']['lane'];
}

export class Race {
  readonly horses: HorseState[];
  readonly events: RaceEvent[] = [];
  readonly distance: number;
  readonly distClass: DistancePref;
  private finalLapCalled = false;
  t = 0;
  finished = false;
  private rng: () => number;
  private leaderId = '';
  private stretchCalled = false;
  private finishCount = 0;
  tuning: Tuning;

  constructor(entrants: Entrant[], seed: number, tuning: Tuning = DEFAULT_TUNING, distance: number = RACE_DISTANCE) {
    this.distance = distance;
    this.distClass = distanceClass(distance);
    this.rng = makeRng(seed);
    this.tuning = { ...tuning };
    this.horses = entrants.map((e, i) => {
      const gate = e.def.stats.gate / 100;
      let startDelay = 0.12 + (1 - gate) * 0.45 + this.rng() * 0.12;
      if (e.plan.start === 'fast') startDelay -= 0.08;
      if (e.plan.start === 'settle') startDelay += 0.1;
      let stumbled = false;
      // Fiery horses with poor gate skill can stumble on a Fast Break.
      const stumbleOdds = e.plan.start === 'fast' ? 0.12 * (1 - gate) * (0.5 + e.def.fire) : 0.03 * (1 - gate);
      if (this.rng() < stumbleOdds) {
        startDelay += 0.7;
        stumbled = true;
      }
      return {
        def: e.def,
        plan: { ...e.plan },
        auto: e.auto,
        isPlayer: !!e.isPlayer,
        post: i,
        dist: 0,
        lane: Math.min(i * 0.9, MAX_LANE),
        targetLane: Math.min(i * 0.9, MAX_LANE),
        speed: 0,
        energy: e.startEnergy ?? 100,
        confidence: Math.min(e.confidence ?? e.def.boldness, e.confidenceCap ?? 100),
        confCap: e.confidenceCap ?? 100,
        buff: e.buff,
        boxedTotal: 0,
        overRaced: false,
        energyAtClose: -1,
        holdFightT: 0,
        holding: false,
        surgeT: 0,
        lastWhipT: -10,
        whipCount: 0,
        blocked: false,
        boxed: false,
        boxedT: 0,
        startDelay: Math.max(0.05, startDelay),
        stumbled,
        finished: false,
        finishTime: 0,
        place: 0,
        rank: i + 1,
        phase: 'gate' as Phase,
      };
    });
    this.emit('And they\'re off!', 'big', undefined, 'start');
  }

  get player(): HorseState | undefined {
    return this.horses.find((h) => h.isPlayer);
  }

  /** Apply input for one horse (by id). */
  input(id: string, inp: PlayerInput): void {
    const h = this.horses.find((x) => x.def.id === id);
    if (!h || h.finished) return;
    if (inp.auto !== undefined) {
      h.auto = inp.auto;
      if (inp.auto) h.holding = false;
      this.emit(inp.auto ? `Auto jockey takes the reins for No. ${h.def.number}.` : `No. ${h.def.number}'s rider takes back control.`, 'player', h, inp.auto ? 'autoOn' : 'autoOff');
    }
    if (inp.track) h.plan.track = inp.track;
    if (inp.close) h.plan.close = inp.close;
    if (inp.lanePref) {
      h.plan.lane = inp.lanePref;
      h.targetLane = inp.lanePref === 'rail' ? 0 : 1.5;
    }
    if (h.auto) return;
    if (inp.hold !== undefined) h.holding = inp.hold;
    if (inp.lane !== undefined) h.targetLane = Math.max(0, Math.min(MAX_LANE, inp.lane));
    if (inp.whip) this.whip(h);
  }

  private whip(h: HorseState): void {
    if (h.phase === 'gate') return;
    const prog = h.dist / this.distance;
    const sinceLast = this.t - h.lastWhipT;
    h.lastWhipT = this.t;
    h.whipCount++;
    const power = this.tuning.whipPower;
    if (h.energy > 0) {
      // Focused horses (and keen ones) answer the whip more sharply.
      const keen = h.buff === 'inForm' && h.def.need === 'lazy' ? 1.2 : 1;
      h.speed += (0.5 + (h.def.stats.accel / 100) * 0.7) * power * keen;
      h.surgeT = 1.3;
      h.energy -= this.toGo(h) < DRIVE_LEFT ? 1 : 2;
    }
    // Confidence: too much whip, or whipping a horse early, costs trust.
    if (sinceLast < 0.9) {
      h.confidence -= 6;
      if (h.isPlayer && h.confidence < 55) this.emit(`Easy on the whip! No. ${h.def.number} is losing heart.`, 'player', h, 'overWhip');
    } else if (prog < 0.5) {
      h.confidence -= h.def.style === 'closer' ? 4 : 2;
    } else if (this.toGo(h) < closeLen(this.distance)) {
      h.confidence += 1.5;
    }
    h.confidence = clamp(h.confidence, 0, h.confCap);
  }

  /** Advance the race by `dt` seconds of race time (call with STEP). */
  step(dt = STEP): void {
    if (this.finished) return;
    this.t += dt;
    const order = [...this.horses].sort((a, b) => b.dist - a.dist);
    order.forEach((h, i) => (h.rank = i + 1));

    for (const h of this.horses) {
      if (h.finished) {
        h.dist += h.speed * dt * 0.6; // gallop out past the line
        h.speed *= 0.985;
        continue;
      }
      this.updateHorse(h, dt, order);
    }

    // Leader change commentary.
    const leader = order.find((h) => !h.finished) ?? order[0];
    if (leader && leader.def.id !== this.leaderId && this.t > 3) {
      this.leaderId = leader.def.id;
      this.emit(`No. ${leader.def.number} ${leader.def.name} takes the lead!`, leader.isPlayer ? 'player' : 'info', leader, 'leader');
    } else if (leader && !this.leaderId) {
      this.leaderId = leader.def.id;
    }
    if (leader && !this.finalLapCalled) {
      const { lap, laps } = lapInfo(leader.dist, this.distance);
      if (laps > 1 && lap === laps) {
        this.finalLapCalled = true;
        this.emit('Ding ding! Final lap!', 'big', undefined, 'finalLap');
      }
    }
    if (!this.stretchCalled && leader && this.distance - leader.dist < CALL_LEFT) {
      this.stretchCalled = true;
      this.emit('Down the stretch they come!', 'big', undefined, 'stretch');
    }
    if (this.horses.every((h) => h.finished)) this.finished = true;
  }

  private updateHorse(h: HorseState, dt: number, order: HorseState[]): void {
    const s = h.def.stats;
    const prog = h.dist / this.distance;

    // Gate.
    if (this.t < h.startDelay) {
      h.phase = 'gate';
      return;
    }
    if (h.phase === 'gate') {
      h.phase = 'start';
      if (h.stumbled) this.emit(`No. ${h.def.number} stumbles at the break!`, h.isPlayer ? 'player' : 'info', h, 'stumble');
    }
    const prevPhase = h.phase;
    const toGo = this.toGo(h);
    h.phase = h.dist < START_LEN ? 'start' : toGo > closeLen(this.distance) ? 'track' : 'close';
    if (prevPhase !== h.phase && h.phase === 'close') {
      h.energyAtClose = h.energy;
      // Ran too hard too early: little left for the finish.
      if (h.energy < 22 && h.place === 0) h.overRaced = true;
    }
    if (h.isPlayer && prevPhase !== h.phase && h.phase === 'close') {
      this.emit(`Closing time for No. ${h.def.number}: ${closeName(h.plan.close)}.`, 'player', h, 'closing');
    }

    // ---- Desired pace as a fraction of top speed ----
    let f = this.planPace(h, prog);

    // Auto/CPU riding: lanes, plus a measured drive in the stretch.
    if (h.auto) {
      this.autoLane(h, order);
      if (toGo < DRIVE_LEFT - 10 && this.t - h.lastWhipT > 1.7 + this.rng() * 0.6) this.whip(h);
    }

    const need = h.def.need;
    // In Form: this horse's Need-weakness is under control for the race.
    const inForm = h.buff === 'inForm';
    // Intense horses want to go now; they fight a hold (unless composed).
    if (need === 'intense' && h.phase !== 'close' && !inForm) f += h.phase === 'start' ? 0.03 : 0.01;

    // Manual hold.
    if (!h.auto && h.holding) {
      const fights = need === 'intense' && !inForm;
      f = Math.min(f, fights ? 0.92 : 0.89);
      if (fights) h.holdFightT += dt;
    }

    // Lazy horses idle in the stretch unless urged (whip) or In Form.
    if (need === 'lazy' && !inForm && toGo < DRIVE_LEFT + 60) f = Math.min(f, h.surgeT > 0 ? 1.0 : 0.95);

    // Fatigue caps.
    if (h.energy <= 0) f = Math.min(f, 0.8);
    else if (h.energy < 20) f = Math.min(f, 0.82 + (h.energy / 20) * 0.16);

    // Surge after a whip. Applied after fatigue: a tired horse can still
    // dig deep for its rider (scaled by guts).
    if (h.surgeT > 0) {
      const deep = h.energy > 0 ? 1 : 0.5 + s.guts / 200;
      f += (toGo < DRIVE_LEFT ? 0.085 : 0.05) * this.tuning.whipPower * deep;
      h.surgeT -= dt;
    }

    // Confidence multiplier.
    const confMul = 0.94 + (h.confidence / 100) * 0.1;
    const top = (19.4 + (s.speed / 100) * 3) * this.aptitude(h); // m/s
    let target = top * f * confMul;
    if (h.phase === 'start' && h.plan.start === 'fast') target *= 1.03;

    // ---- Traffic: blocked by a horse just ahead in the same lane ----
    h.blocked = false;
    const ahead = this.horseAhead(h);
    if (ahead && target > ahead.speed) {
      const strength = this.tuning.blockingStrength;
      target = Math.min(target, ahead.speed + 0.05 + (1 - strength) * 2);
      h.blocked = true;
    }
    const sideOut = this.laneClear(h, +1);
    const sideIn = this.laneClear(h, -1);
    const wasBoxed = h.boxed;
    h.boxed = h.blocked && !sideOut && (h.lane < 0.5 || !sideIn);
    h.boxedT = h.boxed ? h.boxedT + dt : 0;
    if (h.boxed) h.boxedTotal += dt;
    // Loners hate being crowded: boxing hurts double.
    if (h.boxed) h.confidence = clamp(h.confidence - (need === 'loner' && !h.buff ? 5 : 2.5) * dt, 0, h.confCap);
    if (h.boxed && !wasBoxed && h.phase !== 'start' && (h.isPlayer || h.rank <= 3)) {
      this.emit(`No. ${h.def.number} is boxed in${h.lane < 0.5 ? ' on the rail' : ''}!`, h.isPlayer ? 'player' : 'info', h, 'boxed');
    }

    // ---- Speed integration ----
    const accelRate = 1.4 + (s.accel / 100) * 2.2;
    if (h.speed < target) h.speed = Math.min(target, h.speed + accelRate * dt);
    else h.speed = Math.max(target, h.speed - 3.2 * dt);

    // ---- Energy ----
    const effort = h.speed / top;
    // Longer races: less drain per second, but the stamina stat matters more.
    const lenK = Math.pow(LAP / this.distance, 0.85);
    const stamK = Math.pow(80 / (40 + s.stamina), 1 + (this.distance - LAP) / 3000);
    let drain = 3.0 * Math.pow(Math.max(effort, 0), 6) * stamK * lenK * this.tuning.staminaDrain;
    // Fiery horses held back fight the jockey and waste energy.
    if (f < 0.88 && h.phase !== 'close') drain += 0.35 * h.def.fire;
    if (!h.auto && h.holding) drain -= need === 'intense' && !h.buff ? 0.25 : 0.5;
    if (need === 'lazy') drain *= 0.97; // economical, if unambitious
    if (need === 'intense' && !h.buff && h.phase === 'track') drain *= 1.02;
    if (need === 'loner' && h.lane >= 1.2) drain *= 0.96; // happier with room
    // A well-timed drive in the stretch runs on adrenaline.
    if (h.surgeT > 0 && toGo < DRIVE_LEFT + 10) drain *= 0.45;
    // Drafting: tucked in behind another horse saves energy.
    const drafting = this.drafting(h);
    if (drafting) drain *= (0.85 - 0.065 * (this.distance / LAP - 1)) * (need === 'social' ? 0.92 : 1);
    // Setting the pace in front is tiring.
    // (costlier the longer the race: front-runners shine in sprints)
    if (h.rank === 1 && h.phase !== 'start') drain *= 1.05 + 0.16 * (this.distance / LAP - 1);
    // Relaxed galloping is economical.
    if (f < 0.9) drain *= 0.8;
    h.energy = clamp(h.energy - drain * dt, 0, 100);

    // Style match: running the way it likes builds confidence.
    if (h.phase === 'track') {
      const match = STYLE_FOR_PLAN[h.plan.track] === h.def.style;
      h.confidence = clamp(h.confidence + (match ? 0.6 : -0.45) * dt, 0, h.confCap);
    }
    // Needs that play on the horse's mind during the race.
    if (h.phase !== 'start') {
      let dc = 0;
      const formed = h.buff === 'inForm';
      if (need === 'social' && !formed && !this.nearAny(h, 7)) dc -= 0.6; // lonely out there
      if (need === 'showoff') dc += h.rank === 1 ? 0.8 : h.rank >= 6 && !formed ? -0.5 : 0;
      if (dc) h.confidence = clamp(h.confidence + dc * dt, 0, h.confCap);
    }

    // ---- Lane movement (a request the horse attempts) ----
    this.moveLane(h, dt);

    // ---- Advance ----
    const before = h.dist;
    h.dist += railProgress(h.dist, h.lane, h.speed * dt, this.distance);
    if (h.dist >= this.distance && before < this.distance) {
      const frac = (this.distance - before) / (h.dist - before);
      h.finished = true;
      h.finishTime = this.t - dt + frac * dt;
      h.place = ++this.finishCount;
      h.phase = 'done';
      if (h.place === 1) this.emit(`No. ${h.def.number} ${h.def.name} wins it!`, 'big', h, 'win');
      else if (h.isPlayer) this.emit(`No. ${h.def.number} finishes ${ordinal(h.place)}.`, 'player', h, 'playerFinish');
    }
  }

  /** Pace fraction from the horse's 3-phase plan (the jockey's instinct). */
  private planPace(h: HorseState, prog: number): number {
    const p = h.plan;
    if (h.phase === 'start') {
      return p.start === 'fast' ? 1.0 : p.start === 'steady' ? 0.94 : 0.9;
    }
    if (h.phase === 'track') {
      const base = { lead: 0.955, stalk: 0.94, mid: 0.932, lag: 0.922 }[p.track];
      let f = base;
      if (p.track === 'lead' && h.rank > 1) f += 0.02;
      if (p.track === 'stalk' && h.rank === 1) f -= 0.02;
      if (p.track === 'stalk' && h.rank > 4) f += 0.015;
      if (p.track === 'mid' && h.rank > 6) f += 0.015;
      return f;
    }
    // Closing.
    const kick = 1 + (h.def.stats.accel / 100) * 0.05;
    switch (p.close) {
      case 'early':
        return 0.98 + (h.def.stats.stamina / 100) * 0.02 + (h.energy / 100) * 0.05;
      case 'late':
        // Saved energy turns into a bigger finishing burst.
        return this.toGo(h) > kickLen(this.distance) ? 0.935 : (1.05 + (h.energy / 100) * 0.1) * kick;
      case 'protect':
        return h.rank === 1 ? 0.965 : 0.99;
      case 'dig': {
        const rival = this.horses.some((o) => o !== h && !o.finished && Math.abs(o.dist - h.dist) < 3);
        return 0.975 + (rival ? (h.def.stats.guts / 100) * 0.05 : 0);
      }
    }
  }

  private toGo(h: HorseState): number {
    return this.distance - h.dist;
  }

  /** Distance aptitude: a horse is a step slower for each class away from its best. */
  private aptitude(h: HorseState): number {
    const pref = h.def.distancePref;
    if (!pref) return 1;
    const steps = Math.abs(DIST_ORDER.indexOf(pref) - DIST_ORDER.indexOf(this.distClass));
    return 1 - steps * 0.012;
  }

  lap(h: HorseState): { lap: number; laps: number } {
    return lapInfo(Math.min(h.dist, this.distance), this.distance);
  }

  private nearAny(h: HorseState, m: number): boolean {
    return this.horses.some((o) => o !== h && !o.finished && Math.abs(o.dist - h.dist) < m);
  }

  private drafting(h: HorseState): boolean {
    return this.horses.some((o) => o !== h && !o.finished && o.dist - h.dist > 0 && o.dist - h.dist < 6 && Math.abs(o.lane - h.lane) < 0.9);
  }

  private horseAhead(h: HorseState): HorseState | undefined {
    let best: HorseState | undefined;
    for (const o of this.horses) {
      if (o === h || o.finished) continue;
      const gap = o.dist - h.dist;
      if (gap > 0 && gap < 3.2 && Math.abs(o.lane - h.lane) < 0.85) {
        if (!best || gap < best.dist - h.dist) best = o;
      }
    }
    return best;
  }

  /** Is there room to move one lane in direction `dir` (+1 = out)? */
  private laneClear(h: HorseState, dir: number): boolean {
    const dest = h.lane + dir;
    if (dest < 0 || dest > MAX_LANE) return false;
    for (const o of this.horses) {
      if (o === h || o.finished) continue;
      const gap = o.dist - h.dist;
      if (gap > -2.6 && gap < 2.6 && Math.abs(o.lane - dest) < 0.75) return false;
    }
    return true;
  }

  private moveLane(h: HorseState, dt: number): void {
    const diff = h.targetLane - h.lane;
    if (Math.abs(diff) < 0.02) return;
    const dir = Math.sign(diff);
    // Agility sets how quickly (and cleanly) a horse changes lanes.
    const rate = (0.45 + (h.def.stats.agility / 100) * 0.9) * dt;
    const probe = h.lane + dir * 0.6;
    let clear = true;
    for (const o of this.horses) {
      if (o === h || o.finished) continue;
      const gap = o.dist - h.dist;
      if (gap > -2.4 && gap < 2.4 && Math.abs(o.lane - probe) < 0.6 && Math.sign(o.lane - h.lane) === dir) {
        clear = false;
        break;
      }
    }
    if (!clear) return; // keep trying next tick
    const move = Math.min(Math.abs(diff), rate) * dir;
    h.lane = clamp(h.lane + move, 0, MAX_LANE);
    h.energy = clamp(h.energy - Math.abs(move) * 1.6, 0, 100); // repositioning costs energy
  }

  private autoLane(h: HorseState, _order: HorseState[]): void {
    const pref = h.plan.lane === 'rail' ? 0 : 1.5;
    if (h.phase === 'start') {
      h.targetLane = Math.max(pref, Math.min(h.lane, pref + 2));
      return;
    }
    // If stuck behind a slower horse and the plan wants to go, look for room outside.
    const wantsToGo = h.phase === 'close' || h.plan.track === 'lead' || h.plan.track === 'stalk';
    if (h.blocked && wantsToGo && this.laneClear(h, +1)) {
      h.targetLane = Math.min(MAX_LANE, Math.round(h.lane) + 1);
      return;
    }
    // Closers swing out for a clear run home before kicking.
    if (h.phase === 'close' && h.plan.close === 'late' && this.toGo(h) < STRETCH_LEFT && h.blocked) {
      h.targetLane = Math.min(MAX_LANE, Math.max(h.targetLane, 3));
      return;
    }
    if (!h.blocked && Math.abs(h.targetLane - pref) > 0.1 && this.rng() < 0.01) {
      h.targetLane = pref;
    }
  }

  private emit(text: string, kind: RaceEvent['kind'], h?: HorseState, code?: RaceEvent['code']): void {
    this.events.push({ t: this.t, text, kind, horse: h?.def.number, code });
  }

  standings(): HorseState[] {
    return [...this.horses].sort((a, b) => {
      if (a.finished && b.finished) return a.place - b.place;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function closeName(c: HorseState['plan']['close']): string {
  return { early: 'Early Move', late: 'Late Kick', protect: 'Protect the Lead', dig: 'Dig In' }[c];
}
