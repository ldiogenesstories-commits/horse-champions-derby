// Two-layer horse personality and the post-race greeting.
//   Layer 1 — Temperament (how it feels): Fiery/Calm × Bold/Timid.
//   Layer 2 — Need (what drives it): lazy, intense, social, loner, showoff.
// After each race the horse shows a mood. The right greeting for this horse,
// in this mood, builds Trust and can earn a one-race buff; the wrong one costs.
import type { Buff, HorseDef, HorseState, Need } from './types';

export type Temperament = 'hotshot' | 'proud' | 'skittish' | 'gentle';
export type Mood = 'proud' | 'dejected' | 'rattled' | 'frustrated' | 'coasted' | 'overraced';
export type Greeting = 'praise' | 'scold' | 'sit' | 'space';

export const TEMPERAMENT_INFO: Record<Temperament, { label: string; blurb: string }> = {
  hotshot: { label: 'Hotshot', blurb: 'Fiery and bold. Cocky; can coast if it thinks it has won.' },
  proud: { label: 'Proud', blurb: 'Calm and bold. Steady; likes to be recognized.' },
  skittish: { label: 'Skittish', blurb: 'Fiery and timid. Nervy and easily rattled.' },
  gentle: { label: 'Gentle', blurb: 'Calm and timid. Sensitive; needs reassurance.' },
};

/** What In Form fixes, per Need (also a clue to a hidden Need). */
export const IN_FORM_TEXT: Record<Need, string> = {
  lazy: 'won’t idle in the stretch, and answers the whip faster',
  intense: 'won’t fight the reins or rush early',
  social: 'won’t fret if it ends up alone',
  loner: 'won’t get rattled in traffic',
  showoff: 'won’t sulk if it falls behind',
};

export const NEED_INFO: Record<Need, { label: string; blurb: string; hint: string }> = {
  lazy: { label: 'Lazy', blurb: 'Coasts unless urged. A firm word after coasting puts it In Form.', hint: 'Barely breaks a sweat in workouts… and doesn’t seem to want to.' },
  intense: { label: 'Intense', blurb: 'Goes hard early and fights a hold. A firm “settle down” after over-racing puts it In Form.', hint: 'Pulls against the reins in every gallop.' },
  social: { label: 'Social', blurb: 'Loves company: drafts well, frets alone. Sit With it.', hint: 'Calls out whenever its stablemates leave the barn.' },
  loner: { label: 'Loner', blurb: 'Hates crowds: boxing hurts double, running wide suits it. Give it space.', hint: 'Pins its ears when other horses crowd its stall.' },
  showoff: { label: 'Showoff', blurb: 'Lights up in front and in big moments; sulks at the back. Loves praise.', hint: 'Perks right up whenever there’s a crowd watching.' },
};

export const MOOD_HINT: Record<Mood, string> = {
  proud: 'tosses its head, prancing',
  dejected: 'ears back, head hanging low',
  rattled: 'wide-eyed and skittish',
  frustrated: 'stamping and snorting, still wants to run',
  coasted: 'barely breathing hard',
  overraced: 'blowing hard and still fizzing',
};

export const GREETING_LABEL: Record<Greeting, string> = { praise: 'Praise', scold: 'Scold', sit: 'Sit With', space: 'Give Space' };

export function temperamentOf(def: HorseDef): Temperament {
  const fiery = def.fire >= 0.5;
  const bold = def.boldness >= 55;
  return fiery ? (bold ? 'hotshot' : 'skittish') : bold ? 'proud' : 'gentle';
}

/** Read the horse's mood from how its race went. */
export function moodOf(h: HorseState, overWhips: number): Mood {
  if (h.stumbled || overWhips >= 2) return 'rattled';
  if (h.boxedTotal >= 3 && h.place > 3) return 'frustrated';
  if (h.overRaced && h.place > 2) return 'overraced';
  if (h.energy >= 20) return 'coasted';
  if (h.place <= 3) return 'proud';
  return 'dejected';
}

// Tiers: +2 great, +1 good, 0 meh, -1 bad, -2 awful.
const BASE: Record<Mood, Record<Greeting, number>> = {
  proud: { praise: 2, sit: 1, space: 0, scold: -1 },
  dejected: { praise: 1, sit: 2, space: 0, scold: -2 },
  rattled: { praise: 0, sit: 1, space: 2, scold: -2 },
  frustrated: { praise: 0, sit: 1, space: 2, scold: -1 },
  coasted: { praise: 0, sit: 0, space: 0, scold: -1 },
  overraced: { praise: 0, sit: 1, space: 1, scold: -1 },
};

export interface GreetingResult {
  tier: number;
  trust: number;
  confidence: number;
  buff?: Buff;
  text: string;
  why: string;
}

const REACTION: Record<number, string> = {
  2: 'nuzzles you, ears forward. That was exactly what it needed.',
  1: 'seems content.',
  0: 'barely notices.',
  [-1]: 'turns away.',
  [-2]: 'pins its ears and backs away.',
};

export function greetOutcome(def: HorseDef, mood: Mood, g: Greeting): GreetingResult {
  const temp = temperamentOf(def);
  const need = def.need;
  let tier = BASE[mood][g];
  let buff: Buff | undefined;
  let why = '';

  // ---- Need: when a firm word actually helps ----
  if (g === 'scold' && need === 'lazy' && mood === 'coasted') {
    tier = 2;
    why = 'A lazy horse that coasted needed a firm word';
  } else if (g === 'scold' && need === 'intense' && mood === 'overraced') {
    tier = 2;
    why = 'An intense horse that over-raced needed to hear “settle down”';
  } else if (g === 'scold' && need === 'intense' && mood === 'frustrated') {
    tier = -2;
    why = 'It got boxed in: bad luck, not bad behavior';
  }
  if (g === 'praise' && need === 'lazy' && mood === 'coasted') {
    tier = -1;
    why = 'Praising a coast teaches it that coasting is fine';
  }
  if (need === 'social') {
    if (g === 'sit') tier += 1;
    if (g === 'space') tier -= 1;
  }
  if (need === 'loner') {
    if (g === 'space') tier += 1;
    if (g === 'sit') tier -= 1;
  }
  if (need === 'showoff') {
    if (g === 'praise' && mood !== 'coasted') tier += 1;
    if (g === 'scold') tier -= 1;
  }

  // ---- Temperament: how strongly it lands ----
  let scoldScale = 1;
  if (temp === 'hotshot') {
    if (mood === 'proud' && g === 'praise') { tier = Math.min(tier, 1); why ||= 'A hotshot gets cocky with too much praise'; }
    if (mood === 'proud' && g === 'scold') { tier = Math.max(tier, 0); }
    if (g === 'sit') tier -= 1;
    scoldScale = 1.5;
  } else if (temp === 'gentle') {
    if (g === 'sit') tier += 1;
    if (g === 'space') tier -= 1;
    if (g === 'scold') { scoldScale = 0.5; if (!buff) tier -= 1; }
  } else if (temp === 'skittish') {
    if (g === 'space') tier += 1;
    if (g === 'scold') { tier = -2; why = 'A skittish horse is only rattled by a scolding'; }
  }

  tier = Math.max(-2, Math.min(2, tier));
  // A perfect greeting puts the horse In Form for its next race.
  if (tier === 2) buff = 'inForm';
  const disciplined = g === 'scold' && tier === 2;
  const TRUST = { 2: 6, 1: 3, 0: 0, [-1]: -4, [-2]: -8 } as Record<number, number>;
  const CONF = { 2: 5, 1: 2, 0: 0, [-1]: -4, [-2]: -8 } as Record<number, number>;
  let trust = TRUST[tier];
  let confidence = CONF[tier];
  if (disciplined) {
    trust = Math.round(trust * scoldScale);
    if (temp === 'gentle') trust -= 1; // a firm word still stings a gentle soul a little
    confidence = 0; // discipline sharpens focus; it doesn't build belief
  }
  return { tier, trust, confidence, buff, text: `${def.name} ${REACTION[tier]}`, why };
}
