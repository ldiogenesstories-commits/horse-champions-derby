// Core data types for the Horse Champions Derby race engine.
// The engine is pure TypeScript (no Phaser) so it can run headless for
// balance tests, CPU/Auto horses, and later as the host-authoritative sim.

export type StartPlan = 'fast' | 'steady' | 'settle';
export type TrackPlan = 'lead' | 'stalk' | 'mid' | 'lag';
export type ClosePlan = 'early' | 'late' | 'protect' | 'dig';
export type LanePref = 'rail' | 'wide';
export type RunningStyle = 'front' | 'stalker' | 'mid' | 'closer';
/** What drives a horse (second personality layer). */
export type Need = 'lazy' | 'intense' | 'social' | 'loner' | 'showoff';
/** One-race boost earned from a perfect post-race greeting: the horse's Need-flaw is under control. */
export type Buff = 'inForm';
export type Phase = 'gate' | 'start' | 'track' | 'close' | 'done';

/** All stats are 1–100. */
export interface Stats {
  speed: number;
  stamina: number;
  accel: number;
  guts: number;
  gate: number;
  agility: number;
}

export interface HorseDef {
  id: string;
  number: number;
  name: string;
  color: string;
  stats: Stats;
  style: RunningStyle;
  /** Fire: 0 = calm, 1 = fiery. With Natural Confidence it sets the Temperament type. */
  fire: number;
  /** Natural confidence (1–100), inherited like any trait. Sets where a young horse starts. */
  boldness: number;
  /** What drives it: shapes how it races and what it needs after a race. */
  need?: Need;
  /** Visible genetics for portraits (later: inherited from sire and dam). */
  coat?: 'bay' | 'chestnut' | 'grey' | 'black' | 'palomino' | 'dapple' | 'roan';
  marking?: 'none' | 'star' | 'blaze' | 'snip';
  /** Coat and marking genes (two each); what shows is whichever is dominant. Older horses have none. */
  genes?: { coat: [NonNullable<HorseDef['coat']>, NonNullable<HorseDef['coat']>]; marking: [NonNullable<HorseDef['marking']>, NonNullable<HorseDef['marking']>] };
  /** Best race length. */
  sex?: 'mare' | 'stallion';
  /** Parents' names, for foals you breed. */
  sire?: string;
  dam?: string;
  generation?: number;
  /** A 'shining star' foal's standout stat. */
  spark?: 'speed' | 'stamina' | 'accel' | 'guts' | 'gate' | 'agility';
  sparks?: ('speed' | 'stamina' | 'accel' | 'guts' | 'gate' | 'agility')[];
  /** Hidden: the highest each stat can ever be trained. */
  potential?: { speed: number; stamina: number; accel: number; guts: number; gate: number; agility: number };
  /** Grooming look (player horses); portraits and race tokens show it. */
  look?: import('../game/horseBody').Look;
  /** Family tree: parents, grandparents and great-grandparents. */
  pedigree?: import('./pedigree').Pedigree;
  /** Named bloodline founded by a Champion sire, passed down the sire line. */
  line?: import('./pedigree').Line;
  /** Hidden career arc: when the horse peaks and starts to slow down. */
  arc?: import('./arc').Arc;
  /** Breeding: foals this horse has had on its home ranch. */
  foals?: number;
  distancePref?: 'sprint' | 'mile' | 'classic' | 'endurance';
}

export interface RacePlan {
  start: StartPlan;
  track: TrackPlan;
  close: ClosePlan;
  lane: LanePref;
}

export interface Entrant {
  def: HorseDef;
  plan: RacePlan;
  /** CPU horses and Auto-jockey riders both use auto = true. */
  auto: boolean;
  /** Starting confidence (carries over between races via praise/scold). */
  confidence?: number;
  /** Most confidence this horse can hold right now (grows with Trust and good races). */
  confidenceCap?: number;
  buff?: Buff;
  /** Starting energy (fatigue from training lowers it). Default 100. */
  startEnergy?: number;
  isPlayer?: boolean;
}

export interface HorseState {
  def: HorseDef;
  plan: RacePlan;
  auto: boolean;
  isPlayer: boolean;
  post: number;
  /** Rail-equivalent distance covered (m). */
  dist: number;
  /** Lane position, 0 = inner rail. Fractional while moving. */
  lane: number;
  targetLane: number;
  speed: number;
  /** 0–100 energy remaining. */
  energy: number;
  /** 0–confCap. */
  confidence: number;
  /** Current confidence ceiling for this horse. */
  confCap: number;
  buff?: Buff;
  // Race history, read after the race to judge the horse's mood.
  boxedTotal: number;
  overRaced: boolean;
  energyAtClose: number;
  holdFightT: number;
  holding: boolean;
  surgeT: number;
  lastWhipT: number;
  whipCount: number;
  blocked: boolean;
  boxed: boolean;
  boxedT: number;
  startDelay: number;
  stumbled: boolean;
  finished: boolean;
  finishTime: number;
  place: number;
  rank: number;
  phase: Phase;
}

export interface RaceEvent {
  t: number;
  text: string;
  /** Horse number this event is about, if any. */
  horse?: number;
  kind: 'info' | 'player' | 'big';
  /** Machine-readable event type, used by the narrator. */
  code?: 'start' | 'autoOn' | 'autoOff' | 'overWhip' | 'leader' | 'finalLap' | 'stretch' | 'stumble' | 'closing' | 'boxed' | 'win' | 'playerFinish';
}

/** Tunables exposed in the prototype's Tune panel. */
export interface Tuning {
  gameSpeed: number;
  whipPower: number;
  staminaDrain: number;
  blockingStrength: number;
}

export const DEFAULT_TUNING: Tuning = {
  gameSpeed: 1,
  whipPower: 1,
  staminaDrain: 1,
  blockingStrength: 1,
};
