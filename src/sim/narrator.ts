// Race narrator: turns the raw race into natural, readable calls.
// - One line at a time, each held long enough to read (no flicker).
// - Lead changes only once a lead is real (hysteresis); a tight battle
//   becomes a single "locked together" call instead of a ping-pong.
// - Calls at track landmarks, varied phrasing, racing margin language.
// Tone: classic track announcer with a cartoon wink.
import type { Race } from './race';
import { ordinal } from './race';
import { trackParam, lapInfo } from './track';
import type { HorseState } from './types';

export interface Call {
  id: number;
  text: string;
  kind: 'info' | 'player' | 'big';
}

interface Pending {
  text: string;
  kind: Call['kind'];
  priority: number;
  hold: number;
  queuedAt: number;
  sticky?: boolean;
}

// Priorities: higher interrupts lower.
const P_FIELD = 1;
const P_LANDMARK = 2;
const P_PLAYER = 3;
const P_BIG = 4;
const P_FINISH = 5;

const LINES = {
  start: ["And they're off!", 'The gates fly open, and away they go!', "They're off and running!"],
  firstLeader: ['{lead} breaks sharply and shows the way.', '{lead} jumps out quickest.', '{lead} pops out of the gate like toast!'],
  firstTurn: ['Into the first turn, {lead} leads the parade.', 'Around the clubhouse turn, {lead} in front.'],
  turn: ['Into the turn, {lead} still leads.', 'Around the bend, {lead} out in front.'],
  backstretch: ['Down the backstretch, {lead} by {margin}.{you}', 'Along the backstretch, it’s {lead} in front.{you}', 'Racing down the back side, {lead} leads.{you}'],
  farTurn: ['Around the far turn, here come the closers!', 'Into the far turn, {lead} still in charge… for now.', 'Far turn! The pack is bunching up!'],
  pastStands: ['Past the stands, {togo} to go! {lead} leads.', 'That’s {done} down, {togo} to go. {lead} out in front.'],
  order: ['{lead} leads, {second} second, {third} third.{you}', 'Up front it’s {lead}, with {second} tracking in second.{you}', '{lead} sets the pace; {second} is lurking.{you}'],
  orderClear: ['{lead} is {margin} clear of {second}.{you}', '{lead} in front by {margin}.{you}'],
  orderTight: ['{lead} and {second} lead the way together.{you}', 'Nothing between {lead} and {second} up front.{you}'],
  finalLap: ['Ding ding! The bell! Final lap!', 'The bell rings: one lap to go!'],
  stretch: ['Down the stretch they come!', 'Here they come down the lane!', 'Into the home stretch!'],
  leadChange: ['{name} takes over!', '{name} grabs the lead!', 'And now it’s {name} in front!', '{name} pokes a nose in front!'],
  duel: ['{a} and {b}, locked together!', '{a} and {b}, neck and neck!', 'Head to head: {a} and {b}!', '{a} and {b}: you couldn’t fit a carrot between them!'],
  drawOff: ['{name} is drawing off!', '{name} has switched on the afterburners!', '{name} is opening up. See you later!'],
  rally: ['{name} is flying on the outside!', '{name} is eating up ground!', 'Look at {name} rally!'],
  playerUp: ['{name} is on the move!', '{name} picks them off one by one!', 'Here comes {name}!'],
  playerDown: ['{name} is backing up.', '{name} drifts back through the field.', '{name} has cried enough… or has it?'],
  playerBoxed: ['{name} is boxed in, looking for room!', 'Traffic jam! {name} needs a gap!', '{name} has nowhere to go!'],
  playerFree: ['{name} finds a seam!', '{name} slips through the gap!', 'Daylight for {name}!'],
  fieldBoxed: ['{name} is stuck in traffic.', '{name} is looking for running room.'],
  stumble: ['{name} stumbles at the start! Oops!', '{name} breaks a step slow.'],
  overWhip: ['Easy on the whip! {name} is losing heart.', '{name}’s rider is getting after it… maybe too much.'],
  autoOn: ['Auto jockey takes the reins.', 'Auto jockey: “I’ve got this.”'],
  autoOff: ['You’re back in the saddle!', 'You take back the reins!'],
  closing: ['Closing time for {name}: {plan}!'],
  photo: ['It’s a photo!', 'Too close to call! Check the camera!'],
  win: ['{name} wins it by {margin}!', '{name} gets there by {margin}!', 'It’s {name}, by {margin}!'],
  winAway: ['{name} wins going away!', '{name} wins by daylight!', '{name} wins hands down!'],
  winWire: ['{name}, wire to wire! Never headed!'],
  playerWin: ['{name} wins it by {margin}! What a ride!', 'YES! {name} by {margin}!'],
  playerFinish: ['{name} crosses the line {place}.', '{name} finishes {place}.'],
} as const;

type LineKey = keyof typeof LINES;

/** Turn a gap in meters into racing language. */
export function marginWords(m: number): string {
  if (m < 0.35) return 'a nose';
  if (m < 0.7) return 'a head';
  if (m < 1.3) return 'a neck';
  if (m < 1.9) return 'half a length';
  if (m < 3.2) return 'a length';
  if (m < 5.5) return 'a couple of lengths';
  if (m < 9) return 'three lengths';
  return 'a country mile';
}

export class Narrator {
  current: Call = { id: 0, text: '', kind: 'big' };
  private curPriority = 0;
  private curUntil = 0;
  private curSticky = false;
  private curShownAt = 0;
  private lastLap = 1;
  private clock = 0; // real seconds
  private queue: Pending[] = [];
  private scheduled: { at: number; p: Pending }[] = [];
  private nextId = 1;
  private lastLine: Partial<Record<LineKey, number>> = {};
  private cooldown: Record<string, number> = {};
  private eventIdx = 0;
  private mentioned = new Set<number>();
  // Race-reading state
  private leaderId = '';
  private candId = '';
  private candSince = 0;
  private firstLeaderCalled = false;
  private duelKey = '';
  private duelSince = -1;
  private duelCalled = false;
  private drawOffCalled = false;
  private lastSeg = '';
  private seenFirstTurn = false;
  private ranks = new Map<string, { t: number; rank: number }[]>();
  private sampleT = 0;
  private playerWasBoxed = false;
  private ledAll = new Map<string, boolean>();
  private finishHandled = false;
  private rng: () => number;

  constructor(seed = 1) {
    let a = seed >>> 0;
    this.rng = () => {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 4294967296;
    };
  }

  /** Advance with real elapsed seconds; returns the call to display. */
  update(race: Race, realDt: number): Call {
    this.clock += realDt;
    this.readEvents(race);
    this.readRace(race);
    this.playerResult(race);
    // Fire scheduled calls.
    for (const s of [...this.scheduled]) {
      if (this.clock >= s.at) {
        this.scheduled.splice(this.scheduled.indexOf(s), 1);
        this.push(s.p);
      }
    }
    // Advance the queue when the current line has had its time.
    if (!this.curSticky && this.clock >= this.curUntil && this.queue.length) {
      this.queue = this.queue.filter((q) => this.clock - q.queuedAt < 3.5 || q.priority >= P_BIG);
      this.queue.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt);
      const next = this.queue.shift();
      if (next) this.show(next);
    }
    return this.current;
  }

  // ---------- Display plumbing ----------
  private push(p: Pending): void {
    const free = !this.curSticky && this.clock >= this.curUntil;
    // Let a line breathe before anything (short of the finish) interrupts it.
    const canInterrupt = p.priority > this.curPriority && (this.clock - this.curShownAt >= 0.9 || p.priority >= P_FINISH);
    if (free || canInterrupt) {
      if (this.curSticky && p.priority < P_FINISH) {
        this.enqueue(p);
        return;
      }
      this.show(p);
    } else {
      this.enqueue(p);
    }
  }

  private enqueue(p: Pending): void {
    if (this.queue.some((q) => q.text === p.text)) return;
    this.queue.push(p);
    if (this.queue.length > 3) {
      this.queue.sort((a, b) => b.priority - a.priority || b.queuedAt - a.queuedAt);
      this.queue.length = 3;
    }
  }

  private show(p: Pending): void {
    this.current = { id: this.nextId++, text: p.text, kind: p.kind };
    this.curPriority = p.priority;
    this.curUntil = this.clock + p.hold;
    this.curSticky = !!p.sticky;
    this.curShownAt = this.clock;
  }

  private say(key: LineKey, vars: Record<string, string>, kind: Call['kind'], priority: number, opts: { hold?: number; sticky?: boolean; delay?: number } = {}): void {
    const pool = LINES[key];
    let i = Math.floor(this.rng() * pool.length);
    if (pool.length > 1 && i === this.lastLine[key]) i = (i + 1) % pool.length;
    this.lastLine[key] = i;
    const text = pool[i].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
    const p: Pending = { text, kind, priority, hold: opts.hold ?? (priority >= P_PLAYER ? 2.8 : 2.5), queuedAt: this.clock, sticky: opts.sticky };
    if (opts.delay) this.scheduled.push({ at: this.clock + opts.delay, p });
    else this.push(p);
  }

  private ready(key: string, cd: number): boolean {
    if ((this.cooldown[key] ?? -1e9) > this.clock) return false;
    this.cooldown[key] = this.clock + cd;
    return true;
  }

  /** "No. 7 Gale Runner" on first mention, "Gale Runner" after. */
  private name(h: HorseState): string {
    if (this.mentioned.has(h.def.number)) return h.def.name;
    this.mentioned.add(h.def.number);
    return `No. ${h.def.number} ${h.def.name}`;
  }

  // ---------- Raw sim events ----------
  private readEvents(race: Race): void {
    const evs = race.events;
    for (; this.eventIdx < evs.length; this.eventIdx++) {
      const e = evs[this.eventIdx];
      const h = race.horses.find((x) => x.def.number === e.horse);
      switch (e.code) {
        case 'start':
          this.say('start', {}, 'big', P_BIG, { hold: 2 });
          break;
        case 'stumble':
          if (h) this.say('stumble', { name: this.name(h) }, h.isPlayer ? 'player' : 'info', h.isPlayer ? P_PLAYER : P_FIELD);
          break;
        case 'finalLap':
          this.say('finalLap', {}, 'big', P_BIG);
          break;
        case 'stretch':
          this.say('stretch', {}, 'big', P_BIG);
          break;
        case 'overWhip':
          if (h && this.ready('overWhip', 8)) this.say('overWhip', { name: h.def.name }, 'player', P_PLAYER);
          break;
        case 'boxed':
          if (h?.isPlayer) {
            if (this.ready('pBoxed', 7)) this.say('playerBoxed', { name: h.def.name }, 'player', P_PLAYER);
          } else if (h && this.ready('fBoxed', 12)) {
            this.say('fieldBoxed', { name: this.name(h) }, 'info', P_FIELD);
          }
          break;
        case 'autoOn':
          this.say('autoOn', {}, 'player', P_PLAYER, { hold: 1.8 });
          break;
        case 'autoOff':
          this.say('autoOff', {}, 'player', P_PLAYER, { hold: 1.8 });
          break;
        case 'closing':
          if (h) this.say('closing', { name: h.def.name, plan: closeName(h.plan.close) }, 'player', P_PLAYER - 0.5);
          break;
        case 'win':
          if (h) this.callFinish(race, h);
          break;
        // 'leader' and 'playerFinish' are handled by the narrator itself.
      }
    }
  }

  // ---------- Reading the race ----------
  private readRace(race: Race): void {
    const running = race.horses.filter((h) => !h.finished);
    if (!running.length || race.t < 0.5) return;
    const order = [...race.horses].sort((a, b) => b.dist - a.dist);
    const lead = order[0];
    const second = order[1];
    const gap = lead.dist - second.dist;
    const player = race.player;
    const toGo = race.distance - lead.dist;

    // Wire-to-wire bookkeeping (after the break).
    if (lead.dist > 150) {
      for (const h of race.horses) if (!this.ledAll.has(h.def.id)) this.ledAll.set(h.def.id, true);
      for (const h of race.horses) if (h !== lead) this.ledAll.set(h.def.id, false);
    }

    // Rank history for rally / drop detection (sampled every 0.5 s of race time).
    if (race.t - this.sampleT >= 0.5) {
      this.sampleT = race.t;
      order.forEach((h, i) => {
        const hist = this.ranks.get(h.def.id) ?? [];
        hist.push({ t: race.t, rank: i + 1 });
        while (hist.length && race.t - hist[0].t > 4.5) hist.shift();
        this.ranks.set(h.def.id, hist);
      });
    }

    if (race.finished || lead.finished) return;

    // First leader after the break.
    if (!this.firstLeaderCalled && lead.dist > 110) {
      this.firstLeaderCalled = true;
      this.leaderId = lead.def.id;
      this.say('firstLeader', { lead: this.name(lead) }, lead.isPlayer ? 'player' : 'info', P_LANDMARK);
    }

    // Duel: top two within a head for a beat → one "locked together" call.
    const pairKey = [lead.def.id, second.def.id].sort().join('|');
    if (gap < 0.7 && lead.dist > 300) {
      if (this.duelKey !== pairKey) {
        this.duelKey = pairKey;
        this.duelSince = race.t;
        this.duelCalled = false;
      } else if (!this.duelCalled && race.t - this.duelSince > 1.0 && (toGo < 400 || this.ready('duel', 20))) {
        this.duelCalled = true;
        const involvesPlayer = lead.isPlayer || second.isPlayer;
        this.say('duel', { a: this.name(lead), b: this.name(second) }, involvesPlayer ? 'player' : 'info', toGo < 400 ? P_BIG - 0.5 : P_LANDMARK + 0.5, { hold: 3 });
      }
    } else if (gap > 2.5) {
      this.duelKey = '';
      this.duelCalled = false;
    }
    const inDuel = this.duelKey === pairKey && gap < 2.5;

    // Lead change with hysteresis: a lead must be real and hold.
    if (lead.def.id !== this.candId) {
      this.candId = lead.def.id;
      this.candSince = race.t;
    }
    if (this.firstLeaderCalled && this.candId !== this.leaderId && !inDuel && gap >= 1.2 && race.t - this.candSince >= 1.5) {
      this.leaderId = this.candId;
      this.say('leadChange', { name: this.name(lead) }, lead.isPlayer ? 'player' : 'info', lead.isPlayer ? P_PLAYER : P_LANDMARK + 0.5);
    }

    // Landmarks, keyed off the leader's spot on the oval (after the break).
    const seg = trackParam(lead.dist, race.distance).seg;
    const { lap, laps } = lapInfo(lead.dist, race.distance);
    const pRank = player ? order.indexOf(player) + 1 : 0;
    const youAfter = (named: number) => (player && !player.finished && pRank > named ? ` ${player.def.name} sits ${ordinal(pRank)}.` : '');
    const you = youAfter(1);
    const vars = () => ({ lead: this.name(lead), margin: marginWords(gap), you });
    if (!this.firstLeaderCalled) {
      this.lastSeg = seg;
    } else if (seg !== this.lastSeg) {
      this.lastSeg = seg;
      const finalLap = lap === laps;
      let named = true;
      if (seg === 'top') {
        this.say(this.seenFirstTurn ? 'turn' : 'firstTurn', vars(), 'info', P_LANDMARK);
        this.seenFirstTurn = true;
      } else if (seg === 'left') {
        this.say('backstretch', vars(), 'info', P_LANDMARK);
      } else if (seg === 'bottom' && finalLap) {
        this.say('farTurn', vars(), 'info', P_LANDMARK);
      } else named = false;
      // A landmark that names the leader makes a separate lead-change call redundant.
      if (named) this.leaderId = lead.def.id;
    }
    // Crossing the finish line mid-race (multi-lap races). The bell covers the final lap.
    if (lap !== this.lastLap) {
      this.lastLap = lap;
      if (lap < laps) {
        const togo = laps - lap + 1;
        this.say('pastStands', { ...vars(), togo: `${togo} laps`, done: lap - 1 === 1 ? 'one' : String(lap - 1) }, 'info', P_LANDMARK);
        this.leaderId = lead.def.id;
      }
    }

    // Quiet spell mid-race: give the running order.
    if (this.firstLeaderCalled && toGo > 250 && this.clock - this.curShownAt > 9 && !this.queue.length && this.ready('order', 9)) {
      const third = order[2];
      this.leaderId = lead.def.id;
      const key = gap < 1.3 ? 'orderTight' : gap > 3.2 ? 'orderClear' : 'order';
      const named = key === 'order' ? 3 : 2;
      this.say(key, { lead: this.name(lead), margin: marginWords(gap), second: this.name(second), third: third ? this.name(third) : '', you: youAfter(named) }, 'info', P_FIELD);
    }

    // Drawing off in the stretch.
    if (!this.drawOffCalled && toGo < 300 && gap > 6) {
      this.drawOffCalled = true;
      this.say('drawOff', { name: this.name(lead) }, lead.isPlayer ? 'player' : 'info', lead.isPlayer ? P_PLAYER + 0.5 : P_LANDMARK + 0.5);
    }

    // Rallies and the player's moves.
    for (const h of running) {
      const hist = this.ranks.get(h.def.id);
      if (!hist || hist.length < 6) continue;
      const delta = hist[0].rank - hist[hist.length - 1].rank; // + = moved up
      if (h.dist < 200) continue;
      if (h.isPlayer) {
        if (delta >= 2 && this.ready('pUp', 9)) this.say('playerUp', { name: h.def.name }, 'player', P_PLAYER);
        else if (delta <= -2 && h.phase !== 'start' && this.ready('pDown', 12)) this.say('playerDown', { name: h.def.name }, 'player', P_PLAYER - 0.5);
      } else if (h.phase === 'close' && delta >= 2 && this.ready('rally', 7)) {
        this.say('rally', { name: this.name(h) }, 'info', P_LANDMARK);
      }
    }
    if (player) {
      if (this.playerWasBoxed && !player.boxed && !player.blocked && this.ready('pFree', 6)) this.say('playerFree', { name: player.def.name }, 'player', P_PLAYER);
      this.playerWasBoxed = player.boxed;
    }
  }

  private callFinish(race: Race, winner: HorseState): void {
    if (this.finishHandled) return;
    this.finishHandled = true;
    const others = race.horses.filter((h) => h !== winner).sort((a, b) => b.dist - a.dist);
    const second = others[0];
    const m = Math.max(0, race.distance - second.dist);
    const margin = marginWords(m);
    const name = winner.def.name;
    const kind = winner.isPlayer ? 'player' : 'big';
    let delay = 0;
    if (m < 0.35) {
      this.say('photo', {}, 'big', P_FINISH, { hold: 1.4 });
      delay = 1.4;
    }
    if (winner.isPlayer) this.say('playerWin', { name, margin }, kind, P_FINISH, { delay, sticky: true, hold: 3 });
    else if (this.ledAll.get(winner.def.id) && m >= 1.3) this.say('winWire', { name }, kind, P_FINISH, { delay, hold: 3 });
    else if (m >= 5.5) this.say('winAway', { name }, kind, P_FINISH, { delay, hold: 3 });
    else this.say('win', { name, margin }, kind, P_FINISH, { delay, hold: 3 });
    // Then the player's own result, once they cross.
    if (race.player && !winner.isPlayer) this.pendingPlayerFinish = true;
  }

  private pendingPlayerFinish = false;

  private playerResult(race: Race): void {
    const p = race.player;
    if (!this.pendingPlayerFinish || !p?.finished) return;
    this.pendingPlayerFinish = false;
    this.say('playerFinish', { name: p.def.name, place: ordinal(p.place) }, 'player', P_FINISH, { delay: 2.6, sticky: true, hold: 3 });
  }
}

function closeName(c: HorseState['plan']['close']): string {
  return { early: 'Early Move', late: 'Late Kick', protect: 'Protect the Lead', dig: 'Dig In' }[c];
}
