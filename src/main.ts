// Horse Champions Derby — Phase 1 prototype shell.
// Paddock (plan) → Race (Phaser greybox) → Results (praise/scold).
import Phaser from 'phaser';
import './style.css';
import { Race, ordinal } from './sim/race';
import { Narrator } from './sim/narrator';
import { GREETING_LABEL, IN_FORM_TEXT, MOOD_HINT, NEED_INFO, TEMPERAMENT_INFO, greetOutcome, moodOf, temperamentOf, type Greeting, type Mood } from './sim/personality';
import type { Buff } from './sim/types';
import { makeField, PLAYER_HORSE } from './sim/field';
import { DISTANCES, type DistanceKey } from './sim/track';
import { DEFAULT_TUNING, type ClosePlan, type Entrant, type HorseDef, type LanePref, type RacePlan, type StartPlan, type TrackPlan, type Tuning } from './sim/types';
import { RaceScene, type StageLayout } from './game/RaceScene';
import { portraitSVG } from './game/portrait';
import { RaceAmbience, SceneAmbience, bugle, gateBell, hoofClop, isMuted, setMuted, unlockAudio } from './game/sfx';
import { playFinishSplash, playTransition, transitionDone, type TransitionKind } from './game/transitions';
import { runGateDrill, type DrillResult } from './training/gateDrill';
import { runStretchDuel } from './training/stretchDuel';
import { runSteadyGallop } from './training/steadyGallop';
import { runConeWeave } from './training/coneWeave';
import { runSwimSession } from './training/swimSession';
import { runPacePartner } from './training/pacePartner';
import { runGrooming, type CareKind } from './training/grooming';
import { DEFAULT_LOOK, type Look } from './game/horseBody';
import { puppetFrames } from './game/puppet';
import { CAREER_RACES, NEW_CAREER, badgesFor, cardHTML, paintCardArt, careerPoints, makeCode, rankFor, type CareerLog, type RetiredCard } from './career/career';
import { makeFoal } from './sim/field';
import { runBreeding } from './career/breedingScreen';
import { runLobby, type Lobby, type StartMsg } from './net/lobby';
import { deviceId, type Member, type Msg, type Room } from './net/room';
import { applySnapshot, buildEntrants, horseIdFor, makeSnapshot, type Snapshot } from './net/netRace';
import { cleanName } from './game/names';
import { potentialOf, sparksOf } from './sim/growth';
import { CRITTER_SVG, FRIENDS, rosetteSVG, webSVG, type FriendId } from './game/critters';
import { DEFAULT_JOCKEY, silksBadge, type Jockey } from './game/jockey';
import { runJockeyRoom } from './training/jockeyRoom';
import { Broadcast } from './game/broadcast';
import { Ranch, type Station } from './game/ranch';
import { backupCode, backupNow, cleanBackupCode, cleanCardCode, fetchCard, lastBackup, onBackupStatus, peekBackup, publishCard, restoreBackup, restoreUrl, scheduleBackup, useCardFoalSlot } from './net/cloud';
import { SHARED_FOAL_LIMIT } from './career/breeding';
import { showPedigree } from './career/pedigreeView';
import { playIntro, shouldPlayIntro } from './intro/intro';
import {
  SAVE_KEY, countRace, hasHorse, mustBreed, earn, emptySlots, freshSave, initStable, placeNewHorse, prizeFor, spend,
  summaries, switchTo, takeNextScreen, wallet,
} from './profile/profile';
import { ownedDecor } from './profile/shop';
import { decorSVG } from './profile/decor';
import { runHome } from './menu/home';
import { hd, hdCoin } from './game/money';
import { PREMIER_COST } from './career/breeding';
import { canEnterUp, currentClass, ladderLine, recordFinish, termsFor, CLASSES, type RaceTerms } from './career/ladder';
import { bigRaceOn, nextBigRace, type BigRace } from './career/bigRaces';
import { addRivals, recordRivals, rivalsFor, rivalOf } from './career/rivals';
import { owns } from './profile/profile';
import { CAREER_WEEKS, DECLINE_EVERY, MAX_DECLINE, PAST_PEAK_GAIN, PEAK_WEEK, arcOf } from './sim/arc';
import { qrSVG } from './career/career';
import { GRADE_GAIN, TREATS, type TreatId } from './training/grades';

// ---------- State ----------
const player: HorseDef = structuredClone(PLAYER_HORSE);
const plan: RacePlan = { start: 'steady', track: 'stalk', close: 'early', lane: 'rail' };
let rideAuto = false;
// Long-term growth. Confidence is the in-race meter; its ceiling (cap) starts near the
// horse's natural confidence and rises with good races and Trust milestones.
let confidence = player.boldness;
let confCap = Math.min(100, player.boldness + 15);
let trust = 10;
const TRUST_MILESTONES = [25, 50, 75, 100];
const MILESTONE_CAP_BONUS = 8;
let growthLog: { text: string; cls?: string }[] = [];
let needRevealed = false;
let pendingBuff: Buff | undefined;
let lastMood: Mood = 'proud';
const NEED_REVEAL_TRUST = 25;
const inFormText = (): string => `${player.name} is In Form for the next race: ${IN_FORM_TEXT[player.need!]}.`;

function raiseCap(n: number, why: string): void {
  const before = confCap;
  confCap = Math.min(100, confCap + n);
  if (confCap > before) growthLog.push({ text: `Confidence cap ${before} → ${confCap} (${why})` });
}

function changeTrust(delta: number, why: string): void {
  const before = trust;
  trust = Math.max(0, Math.min(100, trust + delta));
  if (trust === before) return;
  growthLog.push({ text: `Trust ${delta > 0 ? '+' : ''}${trust - before} (${why})`, cls: delta < 0 ? 'down' : '' });
  for (const m of TRUST_MILESTONES) {
    if (before < m && trust >= m) {
      growthLog.push({ text: `Trust milestone ${m}! ${player.name} believes in you.`, cls: 'big' });
      if (m >= NEED_REVEAL_TRUST && !needRevealed) {
        needRevealed = true;
        growthLog.push({ text: `You understand ${player.name} now: it's ${NEED_INFO[player.need!].label}.`, cls: 'big' });
      }
      raiseCap(MILESTONE_CAP_BONUS, `Trust ${m}`);
    }
  }
}

function renderGrowthLog(): void {
  $('growth-log').innerHTML = growthLog.map((g) => `<li class="${g.cls ?? ''}">${g.text}</li>`).join('');
}
let fieldSeed = 11;
let distKey: DistanceKey = 'sprint';
const DIST_INFO: Record<DistanceKey, { speed: number; label: string; race: string; laps: string; time: string; suits: string }> = {
  sprint: { speed: 1, label: 'Sprint', race: 'Maiden Sprint', laps: '1 lap', time: '~1 min', suits: 'Front-runners and fast breaks' },
  mile: { speed: 1, label: 'Mile', race: 'Mile Stakes', laps: '1⅓ laps', time: '~1:25', suits: 'Pace chasers and balanced horses' },
  classic: { speed: 1.25, label: 'Classic', race: 'Classic Cup', laps: '2 laps', time: '~1:40 at 1.25×', suits: 'Mid-pack runners with guts' },
  endurance: { speed: 1.5, label: 'Endurance', race: 'Endurance Derby', laps: '2⅔ laps', time: '~1:50 at 1.5×', suits: 'High stamina and closers' },
};
let raceCount = 0;
const record = { w: 0, p: 0, s: 0 };
const tuning: Tuning = { ...DEFAULT_TUNING };
let field: Entrant[] = [];
let race: Race | null = null;
let narrator = new Narrator();
let lastCallId = -1;
let lastTickMs = 0;
let game: Phaser.Game | null = null;
const scene = new RaceScene();
let greeted = false;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const STYLE_LABEL = { front: 'Front-runner', stalker: 'Pace Chaser', mid: 'Mid-pack', closer: 'Closer' } as const;
const STYLE_PLAN: Record<string, TrackPlan> = { front: 'lead', stalker: 'stalk', mid: 'mid', closer: 'lag' };
const START_LABEL: Record<StartPlan, string> = { fast: 'Fast Break', steady: 'Steady Break', settle: 'Settle Back' };
const TRACK_LABEL: Record<TrackPlan, string> = { lead: 'Push for Lead', stalk: 'Chase the Leaders', mid: 'Mid-Pack Cruise', lag: 'Lag Back' };
const CLOSE_LABEL: Record<ClosePlan, string> = { early: 'Early Move', late: 'Late Kick', protect: 'Protect the Lead', dig: 'Dig In' };

type Screen = 'menu' | 'ranch' | 'family' | 'breed' | 'stable' | 'drill' | 'groom' | 'jockey' | 'pre' | 'race' | 'results' | 'retire' | 'hall';
// "Home" is the ranch; the barn (the stable menu) is home only after you walk in.
let home: 'ranch' | 'stable' = 'ranch';
let forceBarn = false;
/** The home menu (built at startup), and whether the current screen was opened from it. */
let homeMenu: { refresh: () => void } | null = null;
let fromMenu = false;
const SCREENS: Screen[] = ['menu', 'ranch', 'family', 'breed', 'stable', 'drill', 'groom', 'jockey', 'pre', 'race', 'results', 'retire', 'hall'];
/** Which scene changes get a transition, and which kind. */
function transitionFor(from: Screen | undefined, to: Screen): TransitionKind | null {
  if (!from || from === to) return null;
  if ((from === 'menu' && (to === 'ranch' || to === 'stable' || to === 'retire')) || (to === 'menu' && (from === 'ranch' || from === 'stable'))) return 'curtain';
  if ((from === 'ranch' || from === 'stable') && to === 'pre') return 'curtain'; // heading to the races
  if (from === 'results' && (to === 'ranch' || to === 'stable' || to === 'retire' || to === 'family')) return 'curtain'; // back home
  if (from === 'stable' && to === 'ranch') return 'nature'; // out of the barn into the field
  if ((from === 'pre' || from === 'results') && to === 'race') return 'curtain'; // into the gate
  if (from === 'race' && (to === 'results' || to === 'family')) return 'curtain'; // race over
  return null;
}
let pendingScreen: Screen | null = null;
let finishSplashed = false;
/** Crowd + hoofbeats for races on phones (the TV broadcast runs its own). */
const raceAmb = new RaceAmbience();
/** Background life for the ranch and the barn. */
const sceneAmb = new SceneAmbience();
function show(id: Screen): void {
  if (id === 'stable' && home === 'ranch' && !forceBarn) id = 'ranch';
  // A transition is already covering the screen: just retarget where it lands.
  if (pendingScreen) { pendingScreen = id; return; }
  const kind = transitionFor(SCREENS.find((s) => $(s).classList.contains('active')), id);
  if (kind) {
    pendingScreen = id;
    void playTransition(kind, () => { const t = pendingScreen ?? id; pendingScreen = null; showNow(t); })
      .then(() => { if (id === 'pre' && $('pre').classList.contains('active')) bugle(); }); // call to the races
    return;
  }
  showNow(id);
}
function showNow(id: Screen): void {
  if (id === 'menu') homeMenu?.refresh();
  if (id === 'stable' || id === 'ranch') renderStable();
  for (const s of SCREENS) $(s).classList.toggle('active', s === id);
  document.body.dataset.screen = id; // lets the mute button find a free corner per screen
  if (id !== 'race') raceAmb.stop();
  sceneAmb.friends = friends.filter((f) => f !== 'spider');
  sceneAmb.set(id === 'ranch' ? 'ranch' : id === 'stable' ? 'barn' : null);
  if (id === 'ranch') enterRanch(); else ranch?.stop();
  window.scrollTo(0, 0);
}

// ---------- Paddock ----------
$('pc-tree').addEventListener('click', () => showPedigree(player));

function renderPaddock(): void {
  $('pc-silk').innerHTML = portraitSVG(player, 72);
  $('pc-name').innerHTML = `${player.name.replace(/[<>&]/g, '')}${canRename() ? PENCIL : ''}`;
  $('pc-name').classList.toggle('editable', canRename());
  $('pc-meta').textContent = `${sparksOf(player).length ? `✨ Gifted: ${sparksOf(player).map((k) => STAT_LABEL[k]).join(' & ')} · ` : ''}${player.sire ? `By ${player.sire} out of ${player.dam} · ` : ''}${player.sex === 'mare' ? 'Mare' : 'Stallion'} · ${TEMPERAMENT_INFO[temperamentOf(player)].label} · ${STYLE_LABEL[player.style]} · Best at the ${DIST_INFO[(player.distancePref ?? 'mile') as DistanceKey].label}`;
  $('pc-style').textContent = STYLE_LABEL[player.style];
  $('pc-dist').textContent = DIST_INFO[(player.distancePref ?? 'mile') as DistanceKey].label;
  renderDistance();
  $('pc-record').textContent = `${raceCount ? `${raceCount} of ${CAREER_RACES} races · ${record.w}-${record.p}-${record.s}` : `Maiden · 0 of ${CAREER_RACES} races`} · Week ${Math.min(day, CAREER_WEEKS)} of ${CAREER_WEEKS}`;
  const stats: [string, number][] = [
    ['Speed', player.stats.speed], ['Stamina', player.stats.stamina], ['Acceleration', player.stats.accel],
    ['Guts', player.stats.guts], ['Gate Skill', player.stats.gate], ['Agility', player.stats.agility],
  ];
  $('pc-stats').innerHTML = stats.map(([k, v]) => `<div class="stat"><span>${k}</span><div class="bar"><i style="width:${v}%"></i></div><span class="num">${Math.round(v)}</span></div>`).join('');
  $('pc-conf').style.width = `${confidence}%`;
  $('pc-cap').style.left = `${confCap}%`;
  $('pc-conf-num').textContent = `${confidence} / ${confCap}`;
  $('pc-trust').style.width = `${trust}%`;
  $('pc-trust-num').textContent = String(trust);
  const nextM = TRUST_MILESTONES.find((m) => m > trust);
  const temp = temperamentOf(player);
  $('pc-temp').textContent = TEMPERAMENT_INFO[temp].label;
  $('pc-temp-blurb').textContent = TEMPERAMENT_INFO[temp].blurb;
  const need = player.need!;
  $('pc-need').textContent = needRevealed ? NEED_INFO[need].label : '???';
  $('pc-need').classList.toggle('hidden', !needRevealed);
  $('pc-need-blurb').textContent = needRevealed ? NEED_INFO[need].blurb : `Trainer's note: “${NEED_INFO[need].hint}” Revealed at Trust ${NEED_REVEAL_TRUST}.`;
  const buffEl = $('pc-buff');
  buffEl.hidden = !pendingBuff;
  buffEl.textContent = pendingBuff ? `In Form: ${IN_FORM_TEXT[player.need!]}.` : '';
  $('pc-growth-note').textContent = `Natural confidence ${player.boldness}. Striped area = room to grow. ${nextM ? `Next Trust milestone at ${nextM} raises the cap by ${MILESTONE_CAP_BONUS}.` : 'Full Trust reached.'}`;

  ($('plan-start') as HTMLSelectElement).value = plan.start;
  ($('plan-track') as HTMLSelectElement).value = plan.track;
  ($('plan-close') as HTMLSelectElement).value = plan.close;
  ($('plan-lane') as HTMLSelectElement).value = plan.lane;
  renderFit();
  setRide(rideAuto, false);

  field = buildField();
  $('field-name').textContent = `· post positions`;
  $('field-list').innerHTML = field
    .map((e) => `<li class="${e.isPlayer ? 'you' : ''}"><span class="bust">${portraitSVG(e.def, 34)}</span><span><b class="num-chip" style="background:${e.def.color};color:${textOn(e.def.color)}">${e.def.number}</b> ${e.def.name}${e.isPlayer ? ' (you)' : ''}</span><span class="sty">${STYLE_LABEL[e.def.style]} · ${DIST_INFO[(e.def.distancePref ?? 'mile') as DistanceKey].label}</span></li>`)
    .join('');
}

function renderDistance(): void {
  $('dist-pick').innerHTML = (Object.keys(DISTANCES) as DistanceKey[])
    .map((k) => {
      const d = DIST_INFO[k];
      const best = player.distancePref === k ? `<span class="best">${player.name.split(' ')[0]}'s best</span>` : '';
      return `<button role="radio" aria-checked="${k === distKey}" class="${k === distKey ? 'on' : ''}" data-d="${k}"><b>${d.label} · ${DISTANCES[k].toLocaleString()} m</b><span>${d.laps} · ${d.time}</span>${best}</button>`;
    })
    .join('');
  const info = DIST_INFO[distKey];
  const fits = player.distancePref === distKey;
  const el = $('dist-fit');
  el.className = `fit ${fits ? 'good' : ''}`;
  const speedNote = info.speed > 1 ? ` Plays at ${info.speed}× speed by default.` : '';
  el.textContent = `Suits: ${info.suits}.${fits ? ` ${player.name} is at its best here.` : ''}${speedNote}`;
}

function renderFit(): void {
  const el = $('plan-fit');
  const fits = STYLE_PLAN[player.style] === plan.track;
  el.className = `fit ${fits ? 'good' : 'warn'}`;
  el.textContent = fits
    ? `${player.name} loves this track strategy: confidence builds as it runs.`
    : `${player.name} is a ${STYLE_LABEL[player.style].toLowerCase()}. Fighting its style costs confidence.`;
}

function setRide(auto: boolean, inRace: boolean): void {
  rideAuto = auto;
  for (const [you, au] of [['ride-you', 'ride-auto'], ['r-you', 'r-auto']]) {
    $(you).classList.toggle('on', !auto);
    $(you).setAttribute('aria-pressed', String(!auto));
    $(au).classList.toggle('on', auto);
    $(au).setAttribute('aria-pressed', String(auto));
  }
  $('controls').hidden = auto;
  // Strategy dropdowns are an Auto-jockey tool; when you ride, it's your hands.
  ($('infield').querySelector('.plan-mini') as HTMLElement).hidden = !auto;
  $('lane-controls').hidden = !auto;
  $('lane-hint').textContent = auto ? 'Auto jockey rides your plan' : 'Drag your horse to change lanes';
  if (inRace && race) myInput({ auto });
  setLaneButtons(plan.lane);
}

function setLaneButtons(lane: LanePref): void {
  $('btn-rail').classList.toggle('on', lane === 'rail');
  $('btn-rail').setAttribute('aria-pressed', String(lane === 'rail'));
  $('btn-wide').classList.toggle('on', lane === 'wide');
  $('btn-wide').setAttribute('aria-pressed', String(lane === 'wide'));
}

// ---------- Race ----------
// Which horse this device controls ('player' in solo races, p-<device> in family races).
let myHorseId = 'player';
/** Send an input for this device's horse (and to the host, in a family race). */
function myInput(inp: Parameters<Race['input']>[1]): void {
  race?.input(myHorseId, inp);
  if (net && !net.host && !net.tv) net.room.send({ type: 'input', horseId: myHorseId, inp });
}

function startRace(): void {
  stopBroadcast();
  myHorseId = 'player';
  net = null;
  netDone = false;
  $('race').classList.remove('tv');
  ranTerms = terms();
  ranBig = bigEntered ? bigToday() : null;
  if (ranBig) distKey = ranBig.dist;
  field = buildField();
  // Entry fee: paid from the wallet (as much as you have; the office is kind to kids)
  if (ranTerms.fee) spend(Math.min(ranTerms.fee, wallet()));
  bigEntered = false;
  upEntered = false;
  if (pendingBuff) setTimeout(() => setCall(`${player.name} is In Form today!`, 'player'), 50);
  pendingBuff = undefined;
  const me = field.find((e) => e.isPlayer);
  if (me) me.startEnergy = startEnergy();
  if (pendingConfBoost) { confidence = Math.min(confCap, confidence + pendingConfBoost); if (me) me.confidence = confidence; pendingConfBoost = 0; }
  race = new Race(field, fieldSeed * 31 + raceCount, tuning, DISTANCES[distKey]);
  raceEvent = eventEntered ? eventToday() : null;
  eventEntered = false;
  $('race').classList.toggle('night', raceEvent?.id === 'night');
  $('rt-race').textContent = ranBig ? `🏆 ${ranBig.name} · ${DIST_INFO[distKey].label}` : raceEvent ? `${raceEvent.name} · ${DIST_INFO[distKey].label}` : DIST_INFO[distKey].race;
  launchRace(fieldSeed * 7 + raceCount);
  // ?bcast previews the big-screen broadcast in a solo race.
  if (new URLSearchParams(location.search).has('bcast')) { $('race').classList.add('tv'); startBroadcast(new Map([['player', jockey]]), $('rt-race').textContent ?? ''); }
}

/** Show the race screen and start the scene for whatever race is set up. */
function launchRace(narratorSeed: number): void {
  greeted = false;
  ($('pm-track') as HTMLSelectElement).value = plan.track;
  ($('pm-close') as HTMLSelectElement).value = plan.close;
  $('pm-start').textContent = `${START_LABEL[plan.start]} ✓`;
  narrator = new Narrator(narratorSeed);
  $('call-cur').textContent = '';
  $('call-prev').textContent = '';
  lastCallId = -1;
  lastTickMs = performance.now();
  setCall('Horses are loading into the gate…', 'info');
  finishSplashed = false;
  show('race');
  // Don't start the clock while a curtain is still covering the gate.
  scene.setHeld(true);
  void transitionDone().then(() => {
    if (!race) return;
    scene.setHeld(false);
    gateBell();
    if (!$('race').classList.contains('tv')) raceAmb.start();
  });
  if (net) {
    // Family races start hand-ridden (every device agrees); keep your solo preference.
    const keep = rideAuto;
    setRide(false, false);
    rideAuto = keep;
  } else setRide(rideAuto, false);
  if (!net?.tv) scene.setPlayerPortrait(portraitSVG(player, 96));
  scene.setup(race!, hooks, tuning.gameSpeed);
  if (!game) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    scene.setDpr(dpr);
    const stage = $('stage');
    const size = () => ({ w: Math.max(50, stage.clientWidth), h: Math.max(50, stage.clientHeight) });
    const { w, h } = size();
    game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: 'phaser',
      transparent: true,
      width: w * dpr,
      height: h * dpr,
      scale: { mode: Phaser.Scale.NONE },
      scene: [scene],
      banner: false,
    });
    const fit = () => {
      const { w: cw, h: ch } = size();
      if (!game) return;
      game.scale.resize(cw * dpr, ch * dpr);
      const c = game.canvas;
      if (c) { c.style.width = `${cw}px`; c.style.height = `${ch}px`; }
    };
    game.events.once('ready', fit);
    new ResizeObserver(fit).observe(stage);
  }
}

function renderRibbon(r: Race): void {
  const el = $('ribbon');
  if (el.childElementCount !== r.horses.length) {
    el.innerHTML = r.horses.map((h) => h.isPlayer
      ? `<span class="rb you rb-face">${portraitSVG(h.def, 30)}</span>`
      : `<span class="rb" style="background:${h.def.color};color:${textOn(h.def.color)}">${h.def.number}</span>`).join('');
  }
  const lead = Math.max(...r.horses.map((h) => h.dist));
  const span = 30; // meters shown behind the leader
  r.horses.forEach((h, i) => {
    const node = el.children[i] as HTMLElement;
    const behind = Math.min(span, lead - h.dist);
    node.style.left = `calc(${(1 - behind / span) * 100}% - ${(1 - behind / span) * 26}px)`;
    node.style.zIndex = h.isPlayer ? '20' : String(10 - Math.round(behind / 4));
  });
}

function setCall(text: string, kind: string): void {
  // Teleprompter: the line just read slides down, smaller and dimmed.
  const box = $('call');
  const cur = $('call-cur');
  const prev = $('call-prev');
  const lastText = cur.textContent ?? '';
  prev.textContent = lastText && lastText !== text ? lastText : '';
  cur.textContent = text;
  box.className = `call ${kind}`;
  for (const el of [cur, prev]) {
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
  }
}

const hooks = {
  onLayout(l: StageLayout) {
    const inf = $('infield');
    const stage = $('stage');
    stage.classList.toggle('landscape', l.landscape);
    const controls = $('controls');
    const lanes = $('lane-controls');
    if (l.landscape) {
      inf.style.left = `${l.infield.x + 8}px`;
      inf.style.top = `${l.infield.y + 4}px`;
      inf.style.width = `${l.infield.w - 16}px`;
      inf.style.height = `${l.infield.h - 8}px`;
      inf.style.flexDirection = 'column';
      const bw = 92;
      const bh = Math.min(160, l.height * 0.45);
      const top = (l.height - bh) / 2;
      for (const [btn, side] of [['btn-hold', 'L'], ['btn-whip', 'R'], ['btn-rail', 'L'], ['btn-wide', 'R']] as const) {
        const b = $(btn);
        b.style.width = `${bw}px`;
        b.style.height = `${bh}px`;
        b.style.top = `${top}px`;
        b.style.left = side === 'L' ? '14px' : `${l.width - bw - 14}px`;
      }
      controls.style.cssText = '';
      lanes.style.cssText = '';
    } else {
      const ctlH = Math.min(92, l.infield.h * 0.22);
      inf.style.left = `${l.infield.x}px`;
      inf.style.top = `${l.infield.y}px`;
      inf.style.width = `${l.infield.w}px`;
      inf.style.height = `${l.infield.h - ctlH - 12}px`;
      for (const el of [controls, lanes]) {
        el.style.left = `${l.infield.x}px`;
        el.style.top = `${l.infield.y + l.infield.h - ctlH}px`;
        el.style.width = `${l.infield.w}px`;
        el.style.height = `${ctlH}px`;
      }
      for (const btn of ['btn-hold', 'btn-whip', 'btn-rail', 'btn-wide']) {
        const b = $(btn);
        b.style.cssText = '';
      }
    }
  },
  onTick(r: Race) {
    if (net?.host && performance.now() - lastSnapMs > 100) {
      lastSnapMs = performance.now();
      net.room.send({ type: 'snap', snap: makeSnapshot(r) });
    }
    const p = r.player;
    if (!p) { tickNarration(r); return; }
    if (p.finished && !finishSplashed && !net?.tv) {
      finishSplashed = true;
      if (!net) scene.freeze(1700); // solo: true freeze-frame; family races keep running for everyone
      raceAmb.duck(0.5);
      void playFinishSplash({ place: p.place, ord: ordinal(p.place), name: player.name, color: p.def.color });
    }
    renderRibbon(r);
    phoneSoundscape(r);
    $('b-energy').style.width = `${p.energy}%`;
    $('b-conf').style.width = `${p.confidence}%`;
    $('b-cap').style.left = `${p.confCap}%`;
    $('rt-pos').textContent = p.finished ? ordinal(p.place) : ordinal(p.rank);
    const phaseText = { gate: 'At the gate', start: 'The break', track: 'Track', close: 'Closing', done: 'Finished' }[p.phase];
    const pct = Math.min(100, Math.round((p.dist / r.distance) * 100));
    const { lap, laps } = r.lap(p);
    $('rt-phase').textContent = laps > 1 ? `Lap ${lap} of ${laps} · ${phaseText}` : `${phaseText} · ${pct}%`;
    $('pm-track').classList.toggle('now', p.phase === 'track' || p.phase === 'start');
    $('pm-close').classList.toggle('now', p.phase === 'close');
    tickNarration(r);
  },
  onFinish(r: Race) {
    if (net) { if (net.host) { net.room.send({ type: 'final', snap: makeSnapshot(r) }); finishFamilyRace(); } return; }
    showResults(r);
  },
  onLaneRequest(lane: number) {
    myInput({ lane });
  },
};

/** Crowd builds toward the wire; hooves are louder while your horse is in the thick of it. */
function phoneSoundscape(r: Race): void {
  const p = r.player;
  if (!p) return;
  if (p.finished) { raceAmb.set(0.65, 0.15, 0.5); return; }
  const lead = Math.max(...r.horses.map((h) => h.dist));
  const prog = Math.min(1, lead / r.distance);
  const pack = r.horses.filter((h) => h !== p && Math.abs(h.dist - p.dist) < 6).length; // horses right around you
  const crowd = 0.12 + 0.55 * prog * prog + (r.distance - lead < 240 ? 0.25 : 0);
  raceAmb.set(crowd, 0.45 + Math.min(0.45, pack * 0.12), 1);
}

function tickNarration(r: Race): void {
    const now = performance.now();
    const call = narrator.update(r, Math.min(0.25, (now - lastTickMs) / 1000));
    lastTickMs = now;
    if (call.id !== lastCallId && call.text) {
      lastCallId = call.id;
      setCall(call.text, call.kind);
    }
}

// ---------- Results ----------
function showResults(r: Race): void {
  stopBroadcast();
  const st = r.standings();
  const p = r.player!;
  raceCount++;
  countRace();
  const t = ranTerms ?? termsFor(career);
  const prize = Math.round(prizeFor(p.place, !!raceEvent) * (net ? 1 : t.prize));
  const promoted = net ? null : recordFinish(career, p.place, { points: t.points, winBonus: t.winBonus, winsWorth: t.winsWorth });
  if (!net && ranBig && p.place === 1) (career.bigWins ??= []).push(ranBig.name);
  const rivalLines = net ? [] : recordRivals(career, p.place, st.filter((h) => rivalOf(h.def.id)).map((h) => ({ id: h.def.id, place: h.place })));
  const bigLine = ranBig ? (p.place === 1 ? `🏆 ${player.name} wins the ${ranBig.name}!` : `${ranBig.name}: finished ${ordinal(p.place)}.`) : '';
  if (prize) earn(prize);
  $('res-prize').hidden = !prize;
  $('res-prize').innerHTML = prize ? `${hdCoin(26)}<span>Prize money <b>${hd(prize)}</b> · Wallet ${hd(wallet())}</span>` : '';
  if (!career.distances.includes(distKey)) career.distances.push(distKey);
  career.bestPlace = Math.min(career.bestPlace, p.place);
  if (raceEvent && p.place === 1) career.eventWins.push(raceEvent.name);
  let earnedShoe = false;
  if (raceEvent && p.place === 1 && !career.horseshoe) {
    career.horseshoe = true;
    earnedShoe = true;
    for (const k of Object.keys(player.stats) as StatKey[]) raisePeak(k, 2);
  }
  lastPlace = p.place;
  if (p.place === 1) record.w++;
  else if (p.place === 2) record.p++;
  else if (p.place === 3) record.s++;
  // Growth from this race.
  growthLog = [];
  if (webPending) {
    webPending = false;
    webWord = weaveNewWord();
    webFresh = true;
    growthLog.push({ text: `Back at the barn, Willa finished a new word: ${webWord}.` });
  }
  if (p.place === 1) raiseCap(3, 'a win');
  else if (p.place <= 3) raiseCap(2, 'a top-3 finish');
  if (STYLE_PLAN[player.style] === p.plan.track) raiseCap(1, 'ran its natural style');
  const overWhips = r.events.filter((e) => e.code === 'overWhip').length;
  if (overWhips) changeTrust(-3 * Math.min(2, overWhips), 'too much whip');
  else changeTrust(2, 'a kind ride');
  // Confidence carries into the next race, eased toward the horse's natural level.
  confidence = Math.min(confCap, Math.round(p.confidence * 0.6 + player.boldness * 0.4));
  fatigue = Math.min(100, fatigue + RACE_FATIGUE);
  day++;
  rustWeeks = 0;
  rustApplied = 0;
  weekPassed();
  actionsLeft = ACTIONS_PER_DAY;
  // Gifts: fans cheer up a last-place horse; event winners earn a prize meal.
  pendingGift = null;
  if (raceEvent && p.place === 1) pendingGift = { food: PRIZE_POOL[Math.floor(Math.random() * PRIZE_POOL.length)], from: 'prize' };
  else if (p.place === st.length) pendingGift = { food: CROWD_POOL[Math.floor(Math.random() * CROWD_POOL.length)], from: 'crowd' };
  save();
  const winT = st[0].finishTime;
  $('res-title').textContent = p.place === 1 ? `${player.name} wins!` : `${player.name} finished ${ordinal(p.place)}`;
  const tips: string[] = [];
  if (p.whipCount > 14) tips.push('Lots of whipping today. Your horse lost some heart.');
  if (p.energy < 1 && p.place > 3) tips.push('Ran out of gas. Try a calmer track strategy or more Hold mid-race.');
  if (p.energy > 25) tips.push(`Finished with ${Math.round(p.energy)}% energy left: you could have pushed harder.`);
  const mins = Math.floor(p.finishTime / 60);
  const secs = (p.finishTime % 60).toFixed(2).padStart(5, '0');
  $('res-sub').textContent = `${ranBig ? `${ranBig.name} · ` : raceEvent ? `${raceEvent.name} · ` : ''}${DIST_INFO[distKey].race} (${DISTANCES[distKey].toLocaleString()} m) · time ${mins ? `${mins}:${secs}` : `${secs}s`} · plan: ${START_LABEL[p.plan.start]} → ${TRACK_LABEL[p.plan.track]} → ${CLOSE_LABEL[p.plan.close]}. ${tips.join(' ')}`;
  $('res-list').innerHTML = st
    .map((h) => {
      const gap = h.place === 1 ? `${h.finishTime.toFixed(2)}s` : `+${(h.finishTime - winT).toFixed(2)}s`;
      return `<li class="${h.isPlayer ? 'you' : ''}"><span class="pl">${ordinal(h.place)}</span><span class="tok" style="background:${h.def.color};color:${textOn(h.def.color)}">${h.def.number}</span><span>${h.def.name}<br><span class="plan">${TRACK_LABEL[h.plan.track]} · ${CLOSE_LABEL[h.plan.close]}</span></span><span class="tm">${gap}</span></li>`;
    })
    .join('');
  lastMood = moodOf(p, overWhips);
  $('mood-line').innerHTML = `<b>${player.name}</b> is ${MOOD_HINT[lastMood]}.`;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.greet')) { b.disabled = false; b.classList.remove('picked'); }
  $('praise-msg').textContent = '';
  renderGrowthLog();
  greeted = false;
  if (bigLine) growthLog.push({ text: bigLine, cls: 'big' });
  for (const l of rivalLines) growthLog.push({ text: l, cls: l.startsWith('⚔️') ? 'big' : '' });
  if (promoted) growthLog.push({ text: `🏅 Promoted! ${player.name} moves up to ${promoted} races: tougher rivals, bigger prizes.`, cls: 'big' });
  if (earnedShoe) growthLog.push({ text: `🍀 Earned a Lucky Horseshoe! Every stat can now grow a little higher.`, cls: 'big' });
  checkFriends();
  renderGrowthLog();
  renderGift();
  const done = careerOver();
  $('race-again').hidden = done || !!net;
  $('to-paddock').textContent = net ? 'Back to the family room' : done ? 'Retirement ceremony 🎉' : 'Back to stable';
  if (done) $('res-title').textContent += ` · Farewell race`;
  show('results');
}

function renderGift(): void {
  const card = $('gift-card');
  card.hidden = !pendingGift;
  if (!pendingGift) return;
  const f = FOODS[pendingGift.food];
  $('gift-ico').textContent = f.ico;
  $('gift-btns').hidden = false;
  if (pendingGift.from === 'prize') {
    $('gift-title').textContent = `${raceEvent?.name ?? 'Event'} prize!`;
    $('gift-text').innerHTML = `The winner's table serves <b>${f.name}</b> (${f.effect}). ${player.name} eats it right away, so no feeding needed this week.`;
  } else {
    $('gift-title').textContent = 'A gift from the crowd';
    $('gift-text').innerHTML = `Fans felt for ${player.name} and sent <b>${f.name}</b> (${f.effect}). Accept and ${player.name} eats it now, saving you a feeding action.`;
  }
  card.classList.toggle('prize', pendingGift.from === 'prize');
}

function answerGift(accept: boolean): void {
  if (!pendingGift) return;
  if (accept && pendingGift.from === 'crowd') career.crowdGifts++;
  if (accept) {
    const { lead, notes } = eat(pendingGift.food);
    $('gift-text').textContent = `${lead} ${notes.join(' ')}`;
  } else {
    $('gift-text').textContent = 'You thanked the fans and passed it along to another stable.';
  }
  $('gift-btns').hidden = true;
  pendingGift = null;
  save();
}

function greet(g: Greeting): void {
  if (greeted || !race) return;
  greeted = true;
  const out = greetOutcome(player, lastMood, g);
  confidence = Math.max(0, Math.min(confCap, confidence + out.confidence));
  if (out.trust) changeTrust(out.trust, GREETING_LABEL[g].toLowerCase());
  if (out.buff) {
    pendingBuff = out.buff;
    growthLog.push({ text: inFormText(), cls: 'big' });
  }
  $('praise-msg').innerHTML = `${out.text}${out.why ? `<div class="praise-why">${out.why}.</div>` : ''}`;
  renderGrowthLog();
  save();
  for (const b of document.querySelectorAll<HTMLButtonElement>('.greet')) {
    b.disabled = true;
    b.classList.toggle('picked', b.dataset.g === g);
  }
}

// ---------- Wiring ----------
function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#2B2118' : '#FFFBF2';
}

function bindPlanSelect(id: string, key: keyof RacePlan): void {
  $(id).addEventListener('change', (e) => {
    (plan as unknown as Record<string, string>)[key] = (e.target as HTMLSelectElement).value;
    if (key === 'track') renderFit();
  });
}
bindPlanSelect('plan-start', 'start');
bindPlanSelect('plan-track', 'track');
bindPlanSelect('plan-close', 'close');
bindPlanSelect('plan-lane', 'lane');

$('ride-you').addEventListener('click', () => setRide(false, false));
$('ride-auto').addEventListener('click', () => setRide(true, false));
$('r-you').addEventListener('click', () => setRide(false, true));
$('r-auto').addEventListener('click', () => setRide(true, true));
$('new-field').addEventListener('click', () => { fieldSeed++; renderPaddock(); });
$('dist-pick').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  if (bigEntered) { stableMsg(''); $('dist-fit').textContent = `The ${bigToday()?.name} is run at the ${DIST_INFO[bigToday()!.dist].label}. Tap the big race card to run a normal race instead.`; return; }
  distKey = b.dataset.d as DistanceKey;
  // Longer races default to a slightly faster play speed (still adjustable).
  const sp = $('t-speed') as HTMLInputElement;
  sp.value = String(DIST_INFO[distKey].speed);
  sp.dispatchEvent(new Event('input'));
  renderDistance();
});
$('start-race').addEventListener('click', startRace);
$('race-again').addEventListener('click', () => { fieldSeed++; startRace(); });
$('to-paddock').addEventListener('click', () => {
  fieldSeed++;
  save();
  if (net && lobby) { show('family'); lobby.backToRoom(); return; }
  if (careerOver()) retire();
  else show('stable');
});
for (const b of document.querySelectorAll<HTMLButtonElement>('.greet')) b.addEventListener('click', () => greet(b.dataset.g as Greeting));

$('pm-track').addEventListener('change', (e) => myInput({ track: (e.target as HTMLSelectElement).value as TrackPlan }));
$('pm-close').addEventListener('change', (e) => myInput({ close: (e.target as HTMLSelectElement).value as ClosePlan }));
$('btn-rail').addEventListener('click', () => { plan.lane = 'rail'; setLaneButtons('rail'); myInput({ lanePref: 'rail' }); });
$('btn-wide').addEventListener('click', () => { plan.lane = 'wide'; setLaneButtons('wide'); myInput({ lanePref: 'wide' }); });

// Hold: press and keep holding. Whip: tap.
const holdBtn = $('btn-hold');
const setHold = (v: boolean) => { holdBtn.classList.toggle('pressed', v); myInput({ hold: v }); };
holdBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); holdBtn.setPointerCapture(e.pointerId); setHold(true); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) holdBtn.addEventListener(ev, () => setHold(false));
const whipBtn = $('btn-whip');
whipBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  whipBtn.classList.add('pressed');
  myInput({ whip: true });
  setTimeout(() => whipBtn.classList.remove('pressed'), 110);
});
for (const b of [holdBtn, whipBtn]) b.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (!$('race').classList.contains('active') || e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'z') setHold(true);
  else if (k === 'x' || k === ' ') { e.preventDefault(); myInput({ whip: true }); }
  else if (k === 'a') scene.nudgeLane(-1);
  else if (k === 'd') scene.nudgeLane(+1);
});
window.addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'z') setHold(false); });

// Tune panel.
function bindSlider(id: string, out: string, key: keyof Tuning, fmt: (v: number) => string): void {
  const input = $(id) as HTMLInputElement;
  const update = () => { tuning[key] = Number(input.value); $(out).textContent = fmt(tuning[key]); };
  input.addEventListener('input', update);
  update();
}
bindSlider('t-speed', 'v-speed', 'gameSpeed', (v) => `${v.toFixed(2).replace(/0$/, '')}×`);
bindSlider('t-whip', 'v-whip', 'whipPower', (v) => v.toFixed(1));
bindSlider('t-drain', 'v-drain', 'staminaDrain', (v) => v.toFixed(2));
bindSlider('t-block', 'v-block', 'blockingStrength', (v) => v.toFixed(1));

// ---------- Stable ----------
let fatigue = 0;
/** The game week (the save calls it `day` from before weeks). */
let day = 1;
/** Training weeks in a row (no race): makes the horse rusty. */
let rustWeeks = 0;
let rustApplied = 0;
/** Stat points lost since the horse's peak. */
let declined = 0;
const treats: Record<TreatId, number> = { treatA: 0, treatB: 0, starfruit: 0 };
let pendingConfBoost = 0;
let cleanupDrill: (() => void) | null = null;
const RACE_FATIGUE = 35;
const DRILL_FATIGUE = 25;

// ---------- Feed bin ----------
type FeedId = 'hay' | 'oats' | 'carrots';
type FoodId = FeedId | 'apples' | 'goldenOats' | 'honeyMash' | 'starfruit';
const FOODS: Record<FoodId, { name: string; ico: string; effect: string }> = {
  hay: { name: 'Hay', ico: '🌾', effect: 'Fatigue −15' },
  oats: { name: 'Oats', ico: '🥣', effect: 'Next drill gains +25%' },
  carrots: { name: 'Carrots', ico: '🥕', effect: 'Trust +2' },
  apples: { name: 'Apples', ico: '🍎', effect: '+5 Confidence next race' },
  goldenOats: { name: 'Golden Oats', ico: '✨', effect: 'Next drill gains +50%' },
  starfruit: { name: 'Starfruit', ico: '⭐', effect: "Raises a stat's hidden peak by 3" },
  honeyMash: { name: 'Honey Mash', ico: '🍯', effect: 'Fatigue −30 and Trust +2' },
};
const FEEDS = FOODS; // the bin shows the first three
const BIN: FeedId[] = ['hay', 'oats', 'carrots'];
// What fans can send after a last-place finish, and what event winners receive.
const CROWD_POOL: FoodId[] = ['hay', 'carrots', 'apples'];
const PRIZE_POOL: FoodId[] = ['goldenOats', 'honeyMash', 'starfruit'];
// Each horse has a favourite, tied to its Need (hidden until it eats it).
const FAVORITE_BY_NEED: Record<string, FeedId> = { lazy: 'carrots', intense: 'oats', social: 'hay', loner: 'hay', showoff: 'carrots' };
let fedDay = 0;
let drillBoost = 0; // from oats: extra share of drill gains on the next drill
let favKnown = false;
const favoriteFeed = (): FeedId => FAVORITE_BY_NEED[player.need ?? 'social'];
const hungry = (): boolean => fedDay !== day;
const HUNGRY_ENERGY = 5;

// ---------- Actions between races ----------
const ACTIONS_PER_DAY = 3;
let actionsLeft = ACTIONS_PER_DAY;
function spendAction(): void {
  actionsLeft = Math.max(0, actionsLeft - 1);
}
function needAction(): boolean {
  if (actionsLeft > 0) return true;
  stableMsg('No actions left this week. Race, or train another week.', true);
  return false;
}

// ---------- Career ----------
let career: CareerLog = NEW_CAREER();
const HALL_KEY = 'hcd-hall-v1';
let hall: RetiredCard[] = [];
try { hall = JSON.parse(localStorage.getItem(HALL_KEY) ?? '[]'); } catch { hall = []; }
let retiredCard: RetiredCard | null = null;

/** A career ends after 25 races or 50 weeks, whichever comes first. */
function careerOver(): boolean { return raceCount >= CAREER_RACES || day > CAREER_WEEKS; }
const weeksLeft = (): number => Math.max(0, CAREER_WEEKS - day + 1);
const racesLeft = (): number => Math.max(0, CAREER_RACES - raceCount);
const pastPeak = (): boolean => day > PEAK_WEEK[arcOf(player)];

/**
 * A week has gone by (raced or trained). Past its peak a horse slowly loses form:
 * a point every DECLINE_EVERY weeks, from its best stats, up to MAX_DECLINE in all.
 */
function weekPassed(): boolean {
  const peak = PEAK_WEEK[arcOf(player)];
  if (day <= peak || declined >= MAX_DECLINE || (day - peak) % DECLINE_EVERY !== 0) return false;
  const top = (Object.keys(player.stats) as StatKey[]).sort((a, b) => player.stats[b] - player.stats[a]).slice(0, 3);
  const k = top[Math.floor(Math.random() * top.length)];
  player.stats[k] = Math.max(30, player.stats[k] - 1);
  declined++;
  if (declined === 1) growthLog.push({ text: PRIME_MSG(), cls: '' });
  return declined === 1;
}
const PRIME_MSG = () => `${player.name} is a little past their prime. Stats will slowly slip, and training gains are smaller now.`;

function retire(): void {
  if (!retiredCard) {
    const points = careerPoints(record, career);
    retiredCard = {
      code: makeCode(),
      horse: structuredClone(player),
      look: { ...look },
      record: { ...record },
      races: raceCount,
      points,
      rank: rankFor(points),
      badges: badgesFor(career, trust),
      trust,
      retiredOn: new Date().toISOString(),
      jockey: { ...jockey },
    };
    hall.unshift(retiredCard);
    saveHall();
    save();
    void shareCards();
  }
  const c = retiredCard;
  $('ret-title').textContent = `${c.horse.name} retires a ${c.rank}!`;
  const winPct = Math.round((c.record.w / Math.max(1, c.races)) * 100);
  $('ret-sub').textContent = `${c.races} races · ${c.record.w} wins (${winPct}%) · ${c.record.p} seconds · ${c.record.s} thirds · ${c.points} career points.`;
  $('ret-card').innerHTML = cardHTML(c);
  void paintCardArt($('ret-card'), [c]);
  $('ret-name-box').hidden = true;
  show('retire');
}

let pendingFoal: HorseDef | null = null;
/** Random new horse: roll a foal, then let the player name it before the career starts. */
function askFoalName(): void {
  pendingFoal = makeFoal(Date.now() % 100000, hall.map((h) => h.horse.name));
  const input = $('ret-name-input') as HTMLInputElement;
  input.value = pendingFoal.name;
  $('ret-name-box').hidden = false;
  $('ret-name-box').scrollIntoView({ behavior: 'smooth', block: 'center' });
  input.focus();
  input.select();
}

/** The active horse has finished its career, so a new horse can take its stall. */
const activeRetired = (): boolean => !!retiredCard || careerOver();
const STABLE_FULL = 'Your stable is full. Retire a horse, or open a new stall in My Stable.';
/** Can a new horse move in (into the retired horse's stall, or an empty one)? */
const roomForHorse = (): boolean => activeRetired() || emptySlots() > 0;

function newHorse(bred?: HorseDef): string | void {
  const foal = bred ?? makeFoal(Date.now() % 100000, allNames());
  if (placeNewHorse(freshSave(foal), activeRetired(), save) === 'full') return STABLE_FULL;
}
/** Names already used in the Hall and the stable, so new foals get fresh ones. */
const allNames = (): string[] => [...hall.map((h) => h.horse.name), ...summaries(liveSummary()).map((h) => h.name)];
const liveSummary = () => ({ name: player.name, coat: player.coat, races: raceCount, wins: record.w, retired: activeRetired(), horse: player });

function openBreeding(preselect?: string): void {
  // Your first two horses are bred from visiting horses (one at a time).
  const starter = !preselect && (mustBreed() || !hall.length);
  show('breed');
  runBreeding($('breed-root'), {
    hall,
    starter,
    preselect,
    seed: Date.now() % 100000,
    wallet,
    onDone: async (foal, used) => {
      if (!roomForHorse()) return STABLE_FULL;
      if (used.premier && wallet() < PREMIER_COST) return 'Not enough Horse Dollars for the Premier Partner.';
      // Each parent from the Hall uses up one foal slot. Home-raised horses count on this ranch (3);
      // scanned-in horses count on the server across every ranch (4), so check that first.
      const cards = [used.parent, used.partnerCard].filter((c): c is RetiredCard => !!c);
      for (const c of cards.filter((x) => x.guest)) {
        try {
          const r = await useCardFoalSlot(c.code, SHARED_FOAL_LIMIT);
          if (r === -1) return `${c.horse.name} has already had ${SHARED_FOAL_LIMIT} foals across all ranches and is retired from breeding.`;
          if (r === -2) return `${c.horse.name}'s card isn't on the shared stable, so it can't be bred from. Ask the owner to share it again.`;
        } catch {
          return 'Couldn\'t reach the shared stable to count this horse\'s foals. Check your connection and try again.';
        }
      }
      for (const c of cards.filter((x) => !x.guest)) c.horse.foals = (c.horse.foals ?? 0) + 1;
      if (used.premier) spend(PREMIER_COST);
      saveHall();
      return newHorse(foal);
    },
    onBack: () => (preselect ? retire() : starter || fromMenu ? (fromMenu = false, show('menu')) : renderHall()),
  });
}

function saveHall(): void {
  try { localStorage.setItem(HALL_KEY, JSON.stringify(hall)); scheduleBackup(); } catch { /* keep in memory */ }
}

/** Upload this stable's own cards (retrying any that didn't make it while offline). */
async function shareCards(): Promise<void> {
  let changed = false;
  for (const c of hall) {
    if (c.published || c.guest) continue;
    try { const { published: _p, guest: _g, ...pub } = c; await publishCard(c.code, pub); c.published = true; changed = true; } catch { break; }
  }
  if (changed) saveHall();
}

let foundCard: RetiredCard | null = null;
async function findCard(input: string): Promise<void> {
  const msg = $('card-msg');
  $('card-add').hidden = true;
  $('card-preview').innerHTML = '';
  foundCard = null;
  const code = cleanCardCode(input);
  if (!code) { msg.textContent = 'That doesn\'t look like a card code. It reads like HCD-7KQ2-M9XA.'; return; }
  ($('card-code') as HTMLInputElement).value = code;
  const mine = hall.find((c) => c.code === code);
  if (mine) { msg.textContent = `${mine.horse.name} is already in your Hall of Fame.`; return; }
  msg.textContent = 'Looking up the card…';
  try {
    const c = await fetchCard<RetiredCard>(code);
    if (!c?.horse) { msg.textContent = `No card found for ${code}. Check the code, or ask its owner to open their Hall of Fame once while online.`; return; }
    foundCard = { ...c, code, guest: true, published: true };
    msg.textContent = `Found ${c.horse.name}${c.jockey?.name && c.jockey.name !== 'You' ? `, raised by ${c.jockey.name}` : ''}.`;
    $('card-preview').innerHTML = cardHTML(foundCard);
    void paintCardArt($('card-preview'), [foundCard]);
    $('card-add').hidden = false;
  } catch {
    msg.textContent = 'Couldn\'t reach the card library. Check the internet connection and try again.';
  }
}

function renderHall(): void {
  void shareCards();
  $('hall-breed').hidden = !hall.length;
  $('hall-grid').innerHTML = hall.length
    ? hall.map((c) => `<div class="hall-item">${cardHTML(c)}<button class="ghost small hall-tree" data-tree="${c.code}">Family tree</button></div>`).join('')
    : `<p class="muted">No retired horses yet. Finish a ${CAREER_RACES}-race career, or add a card from family and friends.</p>`;
  void paintCardArt($('hall-grid'), hall);
  $('hall-grid').querySelectorAll<HTMLButtonElement>('[data-tree]').forEach((b) => b.addEventListener('click', () => {
    const c = hall.find((x) => x.code === b.dataset.tree);
    if (c) showPedigree(c.horse, c.rank);
  }));
  show('hall');
}

// ---------- Jockey (you: shared by every horse you raise) ----------
const JOCKEY_KEY = 'hcd-jockey-v1';
let jockey: Jockey = { ...DEFAULT_JOCKEY };
try { jockey = { ...DEFAULT_JOCKEY, ...JSON.parse(localStorage.getItem(JOCKEY_KEY) ?? '{}') }; } catch { /* defaults */ }
function applyJockey(): void {
  // Your silks colour is your horse's racing colour.
  player.color = jockey.primary;
  scene.setYouLabel(jockey.name.toUpperCase());
}
function openJockeyRoom(): void {
  show('jockey');
  runJockeyRoom($('jockey-root'), player, jockey, (j) => {
    jockey = j;
    try { localStorage.setItem(JOCKEY_KEY, JSON.stringify(jockey)); scheduleBackup(); } catch { /* memory only */ }
    applyJockey();
  }, () => show('stable'));
}

// ---------- Barn friends (shared by every horse in your stable) ----------
const BARN_KEY = 'hcd-barn-v1';
let friends: FriendId[] = [];
try { friends = JSON.parse(localStorage.getItem(BARN_KEY) ?? '{}').friends ?? []; } catch { friends = []; }
let newFriends: FriendId[] = [];
let lastPlace = 0;
// Willa's word: only changes when you ask her, and the new word is ready after the next race.
let webWord = '';
let webPending = false;
let webFresh = false;

function unlockFriend(id: FriendId): void {
  if (friends.includes(id)) return;
  friends.push(id);
  newFriends.push(id);
  const f = FRIENDS.find((x) => x.id === id)!;
  growthLog.push({ text: `New barn friend: ${f.name} the ${f.kind} moved in!`, cls: 'big' });
  try { localStorage.setItem(BARN_KEY, JSON.stringify({ friends })); scheduleBackup(); } catch { /* memory only */ }
}

function checkFriends(): void {
  if (record.w >= 1) unlockFriend('cat');
  if (trust >= 25) unlockFriend('spider');
  if (record.w >= 3) unlockFriend('hen');
  if (career.eventWins.includes('Night Race')) unlockFriend('owl');
  if (favKnown) unlockFriend('goat');
}

const STAT_WORD: Record<string, string> = { speed: 'SPEEDY', stamina: 'TIRELESS', accel: 'ZIPPY', guts: 'GRITTY', gate: 'SHARP', agility: 'NIMBLE' };
const TEMP_WORD: Record<string, string> = { hotshot: 'BOLD', proud: 'PROUD', skittish: 'SPIRITED', gentle: 'GENTLE' };
/** Lasting things worth weaving about your horse (passing states like hunger don't last long enough). */
function webNotes(): string[] {
  const n: string[] = [];
  if (lastPlace === 1) n.push(record.w >= 5 ? 'CHAMPION' : 'WINNER');
  else if (lastPlace && lastPlace <= 3) n.push('GREAT RUN');
  else if (lastPlace >= 7) n.push('CHIN UP');
  if (favKnown) n.push(`${FOODS[favoriteFeed()].name.toUpperCase()} FAN`);
  if (trust >= 75) n.push('LOYAL'); else if (trust >= 50) n.push('TRUSTY');
  if (look.mane !== 'loose' || look.crown || look.bow !== 'none') n.push('DAPPER');
  const top = (Object.keys(player.stats) as (keyof HorseDef['stats'])[]).sort((a, b) => player.stats[b] - player.stats[a])[0];
  n.push(STAT_WORD[top]);
  n.push(TEMP_WORD[temperamentOf(player)]);
  return n;
}
/** Pick a new word, different from the current one, favouring the freshest news. */
function weaveNewWord(): string {
  const notes = webNotes().filter((w) => w !== webWord);
  return notes.length ? notes[Math.floor(Math.random() * Math.min(3, notes.length))] : webWord;
}

function renderBarn(): void {
  const barnNews: string[] = [];
  // Rosettes: one per win; event wins get a star.
  const ev = career.eventWins.length;
  const EVC: Record<string, string> = { 'Night Race': '#2B3D66', 'Rose Cup': '#E48AA6', 'Harvest Classic': '#D96C2C' };
  const ros: string[] = [];
  career.eventWins.slice(0, 12).forEach((e) => ros.push(rosetteSVG(EVC[e] ?? '#7A3E8E', true)));
  for (let i = ev; i < Math.min(12, record.w); i++) ros.push(rosetteSVG('#2F5D9E'));
  if (career.horseshoe) ros.unshift('<span class="shoe" title="Lucky Horseshoe">🍀<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 4 C2 12 5 20 12 20 C19 20 22 12 19 4 L15 4 C17 11 15 16 12 16 C9 16 7 11 9 4 Z" fill="#E2A93B" stroke="#2B2118" stroke-width="1.5"/></svg></span>');
  $('st-rosettes').innerHTML = ros.join('');
  $('st-rosettes').hidden = ros.length === 0;
  $('st-rosettes').title = `${record.w} win${record.w === 1 ? '' : 's'}`;
  // Critters.
  $('st-friends').innerHTML = friends.filter((f) => f !== 'spider').map((f) => `<button class="critter c-${f}${newFriends.includes(f) ? ' new' : ''}" data-friend="${f}" aria-label="${FRIENDS.find((x) => x.id === f)!.name}">${CRITTER_SVG[f]}</button>`).join('');
  const web = $('st-web');
  web.hidden = !friends.includes('spider');
  if (!web.hidden) {
    if (!webWord) webWord = weaveNewWord();
    web.innerHTML = webSVG(webWord, webPending ? 'working' : webFresh ? 'fresh' : 'idle');
    web.classList.toggle('working', webPending);
    if (webFresh) { webFresh = false; barnNews.push(`Willa finished her new word: ${webWord}.`); }
  }
  // Album.
  $('friends-count').textContent = `${friends.length} of ${FRIENDS.length}`;
  $('album-list').innerHTML = FRIENDS.map((f) => friends.includes(f.id)
    ? `<li class="got"><span class="al-ico">${f.id === 'spider' ? '🕸️' : CRITTER_SVG[f.id]}</span><span><b>${f.name}</b> the ${f.kind}</span></li>`
    : `<li><span class="al-ico">?</span><span><b>???</b> ${f.unlock}</span></li>`).join('');
  if (newFriends.length) {
    const f = FRIENDS.find((x) => x.id === newFriends[newFriends.length - 1])!;
    barnNews.unshift(`New barn friend: ${f.name} the ${f.kind} moved in! Tap to say hi.`);
    const ids = newFriends.slice();
    newFriends = [];
    setTimeout(() => ids.forEach((id) => document.querySelector(`[data-friend="${id}"]`)?.classList.remove('new')), 2500);
  }
  if (barnNews.length) stableMsg(barnNews.join(' '));
}

// ---------- Special events ----------
interface RaceEvent { id: 'night' | 'rose' | 'harvest'; name: string; blurb: string }
const EVENTS: RaceEvent[] = [
  { id: 'night', name: 'Night Race', blurb: 'Under the lights. Win it for a prize meal.' },
  { id: 'rose', name: 'Rose Cup', blurb: 'A garden-party classic. Win it for a prize meal.' },
  { id: 'harvest', name: 'Harvest Classic', blurb: 'The autumn showpiece. Win it for a prize meal.' },
];
// Every third day the race office runs a special event.
const eventToday = (): RaceEvent | null => (day % 3 === 0 && !bigRaceOn(day) ? EVENTS[(day / 3 - 1) % EVENTS.length] : null);
/** Race office choices for this week's race. */
let bigEntered = false;
let upEntered = false;
const bigToday = (): BigRace | null => (activeRetired() ? null : bigRaceOn(day));
const terms = (): RaceTerms => termsFor(career, { up: upEntered && !bigEntered, big: bigEntered ? bigToday() : null });
/** The field for this week's race: class (or big-race) rivals, plus any named rivals. */
function buildField(): Entrant[] {
  const t = terms();
  const f = makeField(fieldSeed, player, { ...plan }, rideAuto, confidence, 8, confCap, pendingBuff, t.rivals);
  return addRivals(f, rivalsFor(fieldSeed, bigEntered), t.rivals, fieldSeed * 3 + day);
}
/** The race that ran: kept for the results screen. */
let ranTerms: RaceTerms | null = null;
let ranBig: BigRace | null = null;
let eventEntered = false;
let raceEvent: RaceEvent | null = null;
let pendingGift: { food: FoodId; from: 'crowd' | 'prize' } | null = null;

// ---------- Grooming ----------
let look: Look = { ...DEFAULT_LOOK };
const groomed = { day: 0, brush: false, hooves: false, styled: false };
function groomToday(): typeof groomed {
  if (groomed.day !== day) Object.assign(groomed, { day, brush: false, hooves: false, styled: false });
  return groomed;
}
function openGrooming(): void {
  const g = groomToday();
  show('groom');
  runGrooming($('groom-root'), {
    horse: player,
    look,
    done: { brush: g.brush, hooves: g.hooves },
    onLook: (l) => {
      look = l;
      player.look = l;
      // Show-offs love being dressed up (once a day).
      if (player.need === 'showoff' && !g.styled) { g.styled = true; growthLog = []; changeTrust(1, 'a new look'); }
      save();
    },
    onCare: (kind: CareKind) => {
      g[kind] = true;
      growthLog = [];
      let bonus = 0;
      changeTrust(1, kind === 'brush' ? 'a good brushing' : 'clean hooves');
      // Social horses soak up the attention.
      if (kind === 'brush' && player.need === 'social') { changeTrust(1, 'the attention'); bonus = 1; }
      save();
      return kind === 'brush'
        ? `${player.name} leans into the brush. Shiny coat! Trust +${1 + bonus}.`
        : `All four hooves picked clean. Trust +1.`;
    },
    onBack: () => show('stable'),
  });
}

type FatigueState = 'Fresh' | 'Ready' | 'Tired' | 'Exhausted';
const fatigueState = (): FatigueState => (fatigue < 40 ? 'Fresh' : fatigue < 70 ? 'Ready' : fatigue < 90 ? 'Tired' : 'Exhausted');
const startEnergy = (): number => Math.round(100 - Math.max(0, fatigue - 40) * 0.5 - (hungry() ? HUNGRY_ENERGY : 0));
const FATIGUE_MOOD: Record<FatigueState, string> = {
  Fresh: 'Perky and ready', Ready: 'Warmed up', Tired: 'Ears drooping a little', Exhausted: 'Needs a nap',
};

function stableMsg(text: string, warn = false): void {
  const m = $('st-msg');
  m.textContent = text;
  m.classList.toggle('warn', warn);
  if ($('ranch').classList.contains('active')) ranchToast(text, warn);
}

function renderStable(): void {
  if (portalActions >= 0 && actionsLeft < portalActions && home === 'ranch') {
    portalActions = -1;
    setTimeout(() => { if ($('stable').classList.contains('active')) show('ranch'); }, 900);
  }
  checkFriends();
  $('st-title').textContent = `${player.name}'s stable`;
  $('st-decor').innerHTML = decorSVG(ownedDecor());
  $('st-about-name').textContent = player.name;
  const nameplate = $('st-nameplate');
  nameplate.innerHTML = `${player.name.toUpperCase().replace(/[<>&]/g, '')}${canRename() ? PENCIL : ''}`;
  nameplate.classList.toggle('editable', canRename());
  nameplate.setAttribute('aria-label', canRename() ? `Rename ${player.name}` : player.name);
  void stableHorse(player, look, groomToday().brush);
  const wl = weeksLeft();
  $('st-day').textContent = `Week ${Math.min(day, CAREER_WEEKS)} of ${CAREER_WEEKS}`;
  const tight = wl <= racesLeft();
  $('st-weeks').textContent = tight
    ? `Only ${wl} week${wl === 1 ? '' : 's'} left for ${racesLeft()} race${racesLeft() === 1 ? '' : 's'}: race every week!`
    : `${ladderLine(career)} · ${racesLeft()} races, ${wl} weeks left${nextBigRace(day) ? ` · Next big race: ${nextBigRace(day)!.name} (week ${nextBigRace(day)!.week})` : ''}`;
  $('st-weeks').classList.toggle('warn', tight);
  $('go-week').querySelector('span')!.textContent = rustWeeks ? `Rusty after ${rustWeeks} week${rustWeeks === 1 ? '' : 's'} off` : 'Skip the race · uses a week';
  const fs = fatigueState();
  $('st-mood').textContent = pendingBuff ? 'In Form!' : rustWeeks >= 2 ? 'A bit rusty' : hungry() ? 'Hungry' : FATIGUE_MOOD[fs];
  $('feed-status').textContent = hungry() ? 'Feeding time' : `Fed this week${drillBoost ? ` · +${Math.round(drillBoost * 100)}% drill ready` : ''}`;
  // Action budget.
  $('st-actions').innerHTML = Array.from({ length: ACTIONS_PER_DAY }, (_, i) => `<i class="${i < actionsLeft ? 'on' : ''}"></i>`).join('');
  $('st-actions-num').textContent = actionsLeft ? `${actionsLeft} left` : 'Race next';
  for (const id of ['go-train', 'go-rest', 'go-feed']) $(id).classList.toggle('spent', actionsLeft === 0);
  const guests = hall.filter((c) => c.guest).length;
  $('hall-count').textContent = hall.length ? `${hall.length - guests} retired${guests ? ` · ${guests} guest${guests > 1 ? 's' : ''}` : ''}` : 'Cards and legends';
  const ev = eventToday();
  $('go-race').querySelector('span')!.textContent = ev ? `This week: ${ev.name}!` : 'Pick a race';
  $('feed-panel').hidden = true;
  $('rename-panel').hidden = true;
  const g = groomToday();
  $('groom-status').textContent = g.brush && g.hooves ? 'Groomed this week ✓' : 'Brush · braid · dress up';
  $('st-fatigue').style.width = `${fatigue}%`;
  // Stretch the gradient across the whole track so the colour shows how tired, not just how full.
  $('st-fatigue').style.backgroundSize = `${(100 / Math.max(fatigue, 1)) * 100}% 100%`;
  $('st-fatigue-num').textContent = fs;
  const n = treats.treatA + treats.treatB;
  $('treat-count').textContent = n ? `${n} treat${n > 1 ? 's' : ''}` : 'Empty';
  $('train-panel').hidden = true;
  $('treat-panel').hidden = true;
  $('jockey-status').innerHTML = `${silksBadge(jockey, 16)} ${jockey.name}`;
  renderPaddock();
  renderBarn();
}

type StatKey = keyof HorseDef['stats'];
const STAT_LABEL: Record<StatKey, string> = { speed: 'Speed', stamina: 'Stamina', accel: 'Acceleration', guts: 'Guts', gate: 'Gate Skill', agility: 'Agility' };
interface DrillDef { id: string; name: string; trains: string; main?: StatKey; side?: StatKey; ready: boolean; fatigue?: number; trust?: boolean }
// Matches the work plan's training table (Section 19).
const DRILLS: DrillDef[] = [
  { id: 'gate', name: 'Gate Drill', trains: 'Gate Skill + Acceleration', main: 'gate', side: 'accel', ready: true },
  { id: 'duel', name: 'Stretch Duel', trains: 'Speed + Guts', main: 'speed', side: 'guts', ready: true },
  { id: 'gallop', name: 'Steady Gallop', trains: 'Stamina', main: 'stamina', ready: true },
  { id: 'cones', name: 'Cone Weave', trains: 'Agility', main: 'agility', ready: true },
  { id: 'partner', name: 'Pace Partner', trains: 'Stamina + Trust', main: 'stamina', ready: true, trust: true },
  { id: 'swim', name: 'Swim Session', trains: 'Stamina, eases fatigue', main: 'stamina', ready: true, fatigue: -10 },
];
const best: Record<string, string> = {};


function openTraining(): void {
  if (!needAction()) return;
  $('treat-panel').hidden = true;
  $('feed-panel').hidden = true;
  $('drill-list').innerHTML = DRILLS.map((d) => `<li><button data-drill="${d.id}" ${d.ready ? '' : 'disabled'}><b>${d.name}${best[d.id] ? ` <span class="best">· best ${best[d.id]}</span>` : ''}</b><span>${d.ready ? `Trains ${d.trains} · ${(d.fatigue ?? DRILL_FATIGUE) < 0 ? '' : '+'}${d.fatigue ?? DRILL_FATIGUE} fatigue` : `Coming soon · ${d.trains}`}</span></button></li>`).join('');
  $('train-panel').hidden = false;
  $('train-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openTreats(): void {
  $('train-panel').hidden = true;
  $('feed-panel').hidden = true;
  const ids = (Object.keys(TREATS) as TreatId[]).filter((t) => treats[t] > 0);
  $('treat-list').innerHTML = ids.length
    ? ids.map((t) => `<li><button data-treat="${t}"><b>${TREATS[t].name} ×${treats[t]}</b><span>${TREATS[t].effect} · tap to give</span></button></li>`).join('')
    : '<li><button disabled><b>No treats yet</b><span>Score an S in training to earn one</span></button></li>';
  $('treat-panel').hidden = false;
  $('treat-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openFeed(): void {
  $('train-panel').hidden = true;
  $('treat-panel').hidden = true;
  const fav = favoriteFeed();
  $('feed-note').textContent = hungry()
    ? `One meal a week, uses an action. ${favKnown ? `${player.name} loves ${FEEDS[fav].name.toLowerCase()}.` : 'Every horse has a favourite. Try them all to find it.'} Racing hungry costs ${HUNGRY_ENERGY}% starting energy.`
    : `${player.name} has eaten this week. Come back next week.`;
  $('feed-list').innerHTML = BIN.map((f) => {
    const isFav = favKnown && f === fav;
    return `<li><button data-feed="${f}" ${hungry() ? '' : 'disabled'}><b><span class="feed-ico">${FEEDS[f].ico}</span>${FEEDS[f].name}${isFav ? ' <span class="fav">♥ favourite</span>' : ''}</b><span>${FEEDS[f].effect}${isFav ? ' · plus Trust +1' : ''}</span></button></li>`;
  }).join('');
  $('feed-panel').hidden = false;
  $('feed-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Apply a food's effect. Returns the message lines. */
function eat(f: FoodId): { lead: string; notes: string[] } {
  fedDay = day;
  growthLog = [];
  const notes: string[] = [];
  if (f === 'hay') { fatigue = Math.max(0, fatigue - 15); notes.push('Fatigue −15.'); }
  if (f === 'oats') { drillBoost = Math.max(drillBoost, 0.25); notes.push('Next drill gains +25%.'); }
  if (f === 'carrots') { changeTrust(2, 'carrots'); notes.push('Trust +2.'); }
  if (f === 'apples') { pendingConfBoost += 5; notes.push('+5 Confidence next race.'); }
  if (f === 'goldenOats') { drillBoost = 0.5; notes.push('Next drill gains +50%.'); }
  if (f === 'starfruit') notes.push(raisePeakNearest(3));
  if (f === 'honeyMash') { fatigue = Math.max(0, fatigue - 30); changeTrust(2, 'honey mash'); notes.push('Fatigue −30. Trust +2.'); }
  let lead = `${player.name} munches the ${FOODS[f].name.toLowerCase()}.`;
  if (f === favoriteFeed()) {
    changeTrust(1, 'a favourite meal');
    lead = favKnown ? `${player.name} gobbles up its favourite!` : `${player.name} LOVES ${FOODS[f].name.toLowerCase()}! Favourite found.`;
    notes.push('Trust +1.');
    favKnown = true;
  }
  return { lead, notes };
}

function feed(f: FeedId): void {
  if (!hungry() || !needAction()) return;
  spendAction();
  const { lead, notes } = eat(f);
  stableMsg(`${lead} ${notes.join(' ')}`);
  save();
  renderStable();
}

function useTreat(t: TreatId): void {
  if (treats[t] <= 0) return;
  treats[t]--;
  growthLog = [];
  if (t === 'treatA') { changeTrust(5, 'a special treat'); stableMsg(`${player.name} loved it. Trust +5.`); }
  else if (t === 'starfruit') stableMsg(`${player.name} savours the Starfruit. ${raisePeakNearest(3)}`);
  else { pendingConfBoost += 8; stableMsg(`${player.name} perks up. +8 Confidence next race.`); }
  save();
  renderStable();
}

function rest(): void {
  const before = fatigue;
  if (!needAction()) return;
  spendAction();
  fatigue = Math.max(0, fatigue - (owns('facility:spa') ? 65 : 50));
  growthLog = [];
  if (before >= 50) changeTrust(1, 'a well-earned rest');
  stableMsg(before >= 50 ? `${player.name} had a good nap. Trust +1.` : `${player.name} lazed about.`);
  save();
  renderStable();
}

function startDrill(d: DrillDef): void {
  if (!needAction()) return;
  const exhausted = fatigueState() === 'Exhausted';
  $('drill-result').hidden = true;
  show('drill');
  cleanupDrill?.();
  const done = (r: DrillResult & { margin?: string; overWhips?: number }) => finishDrill(d, r);
  const RUNNERS = { duel: runStretchDuel, gallop: runSteadyGallop, cones: runConeWeave, swim: runSwimSession, partner: runPacePartner } as const;
  const run = RUNNERS[d.id as keyof typeof RUNNERS] ?? runGateDrill;
  cleanupDrill = run($('drill-root'), player, { exhausted }, done);
}

/** Raise a stat's hidden peak (rare foods and earned accessories). */
function raisePeak(k: StatKey, n: number): void {
  const pot = { ...(Object.fromEntries((Object.keys(player.stats) as StatKey[]).map((x) => [x, potentialOf(player, x)])) as unknown as HorseDef['stats']) };
  pot[k] = Math.min(100, pot[k] + n);
  player.potential = pot;
}
/** Raise the peak of whichever stat is closest to hitting its ceiling; returns the message. */
function raisePeakNearest(n: number): string {
  const keys = Object.keys(player.stats) as StatKey[];
  const k = keys.sort((a, b) => (potentialOf(player, a) - player.stats[a]) - (potentialOf(player, b) - player.stats[b]))[0];
  const before = potentialOf(player, k);
  raisePeak(k, n);
  return potentialOf(player, k) > before ? `${STAT_LABEL[k]} feels like it can go further now.` : `${STAT_LABEL[k]} is already at its absolute best.`;
}

/** Train a stat toward its hidden potential: gains taper over the last few points, then stop. */
function grow(k: StatKey, gain: number): number {
  const cur = player.stats[k];
  const room = potentialOf(player, k) - cur;
  if (room <= 0) return 0;
  const got = Math.min(room, gain * (pastPeak() ? PAST_PEAK_GAIN : 1) * Math.max(0.25, Math.min(1, room / 6)));
  player.stats[k] = cur + got;
  return got;
}
/** The trainer's hint when a stat is close to (or at) its hidden peak. */
function peakHint(k: StatKey, log: string[]): void {
  const room = potentialOf(player, k) - player.stats[k];
  if (room <= 0.05) log.push(`${STAT_LABEL[k]} has reached ${player.name}'s natural peak.`);
  else if (room < 4) log.push(`${STAT_LABEL[k]} is close to its peak. Gains are slowing.`);
}

function finishDrill(d: DrillDef, r: DrillResult & { margin?: string; overWhips?: number }): void {
  cleanupDrill?.();
  cleanupDrill = null;
  const log: string[] = [];
  if (r.quit) { show('stable'); stableMsg('Training stopped early. No action used.'); return; }
  spendAction();
  if (r.balked) {
    fatigue = Math.min(100, fatigue + 5);
    log.push(`${player.name} is too worn out and refused the gate.`, 'Rest first, then train.');
  } else {
    // Swimming is gentle, so being tired doesn't hurt it.
    const tired = fatigueState() === 'Tired' && d.id !== 'swim';
    const fueled = drillBoost;
    drillBoost = 0;
    // Social horses thrive with a partner; loners would rather work alone.
    const company = d.id === 'partner' ? (player.need === 'social' ? 1.2 : player.need === 'loner' ? 0.8 : 1) : 1;
    const gain = GRADE_GAIN[r.grade] * (tired ? 0.5 : 1) * (1 + fueled) * company * (owns('facility:track') ? 1.1 : 1);
    const main = d.main!, side = d.side;
    // A single-stat drill puts all of its gain into that stat.
    // Swimming also eases fatigue, so it trains a little less hard.
    const mainGain = side ? gain : d.id === 'swim' ? gain : gain * 1.25;
    const m0 = Math.round(player.stats[main]);
    const mainGot = grow(main, mainGain);
    const fDelta = d.fatigue ?? DRILL_FATIGUE;
    fatigue = Math.max(0, Math.min(100, fatigue + fDelta));
    if (r.margin) log.push(r.margin);
    if (fDelta < 0) log.push(`The water eased tired legs: Fatigue −${-fDelta}.`);
    if (company !== 1) log.push(company > 1 ? `${player.name} loves having company: gains +20%.` : `${player.name} would rather work alone: gains −20%.`);
    if (fueled) log.push(`Fuelled by a good meal: gains +${Math.round(fueled * 100)}%.`);
    log.push(`${STAT_LABEL[main]} ${m0} → ${Math.round(player.stats[main])} (+${mainGot.toFixed(1)})`);
    peakHint(main, log);
    if (side) {
      const s0 = Math.round(player.stats[side]);
      const sideGot = grow(side, gain / 2);
      log.push(`${STAT_LABEL[side]} ${s0} → ${Math.round(player.stats[side])} (+${sideGot.toFixed(1)})`);
      peakHint(side, log);
    }
    if ((r.overWhips ?? 0) >= 3) { growthLog = []; changeTrust(-2, 'too much whip'); log.push(`${r.overWhips} off-beat whips: Trust −2.`); }
    if (tired) { log.push('Tired: gains halved, Trust −2.'); growthLog = []; changeTrust(-2, 'training while tired'); }
    if (d.trust && (r.grade === 'S' || r.grade === 'A')) { growthLog = []; changeTrust(2, 'a great session together'); log.push('Great teamwork: Trust +2.'); }
    if (d.id === 'swim' && r.grade === 'S') {
      const had = friends.includes('ducks');
      unlockFriend('ducks');
      if (!had) log.push('Two ducklings followed you home from the pool!');
    }
    if (r.grade === 'S') {
      // Rarely, an S drops a Starfruit (raises a hidden peak).
      const t: TreatId = Math.random() < 0.125 ? 'starfruit' : Math.random() < 0.5 ? 'treatA' : 'treatB';
      treats[t]++;
      log.push(`S rank! Found a ${TREATS[t].name} (${TREATS[t].effect}).`);
    }
    const order = ['D', 'C', 'B', 'A', 'S'];
    if (!best[d.id] || order.indexOf(r.grade) > order.indexOf(best[d.id])) best[d.id] = r.grade;
  }
  save();
  const g = $('dr-grade');
  g.textContent = r.balked ? '—' : r.grade;
  g.className = `dr-grade ${r.balked ? '' : r.grade}`;
  $('dr-pct').textContent = r.balked ? 'Balked' : `${Math.round(r.pct)}%`;
  $('dr-log').innerHTML = log.map((l) => `<li>${l}</li>`).join('');
  $('drill-result').hidden = false;
}

function save(): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      horse: player, career, retiredCard, lastPlace, webWord, webPending, webFresh,
      stats: player.stats, confidence, confCap, trust, needRevealed, pendingBuff, raceCount, record,
      fatigue, day, rustWeeks, rustApplied, declined, treats, pendingConfBoost, best, fedDay, drillBoost, favKnown, look, groomed, actionsLeft,
    }));
    scheduleBackup();
  } catch { /* storage unavailable: play on without saving */ }
}

function load(): void {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.horse) Object.assign(player, structuredClone(d.horse));
    Object.assign(player.stats, d.stats ?? {});
    career = { ...NEW_CAREER(), ...(d.career ?? {}) };
    retiredCard = d.retiredCard ?? null;
    lastPlace = d.lastPlace ?? 0;
    webWord = d.webWord ?? '';
    webPending = !!d.webPending;
    webFresh = !!d.webFresh;
    confidence = d.confidence ?? confidence;
    confCap = d.confCap ?? confCap;
    trust = d.trust ?? trust;
    needRevealed = !!d.needRevealed;
    pendingBuff = d.pendingBuff;
    raceCount = d.raceCount ?? 0;
    Object.assign(record, d.record ?? {});
    fatigue = d.fatigue ?? 0;
    day = d.day ?? 1;
    rustWeeks = d.rustWeeks ?? 0;
    rustApplied = d.rustApplied ?? 0;
    declined = d.declined ?? 0;
    Object.assign(treats, d.treats ?? {});
    pendingConfBoost = d.pendingConfBoost ?? 0;
    Object.assign(best, d.best ?? {});
    fedDay = d.fedDay ?? 0;
    drillBoost = d.drillBoost ?? (d.oatsBuff ? 0.25 : 0);
    actionsLeft = d.actionsLeft ?? ACTIONS_PER_DAY;
    favKnown = !!d.favKnown;
    look = { ...DEFAULT_LOOK, ...(d.look ?? {}) };
    player.look = look;
    Object.assign(groomed, d.groomed ?? {});
    if (d.bestGate && !best.gate) best.gate = d.bestGate;
  } catch { /* corrupt or blocked save: start fresh */ }
}

$('go-train').addEventListener('click', openTraining);
$('train-close').addEventListener('click', () => { $('train-panel').hidden = true; if (onRanch()) closeSheet(); });
$('drill-list').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-drill]');
  const d = b && DRILLS.find((x) => x.id === b.dataset.drill && x.ready);
  if (!d) return;
  if (onRanch() && ranch) {
    if (!needAction()) return;
    closeSheet();
    returnAtGate = true;
    ranch.play('gate', () => startDrill(d));
  } else startDrill(d);
});
$('go-treats').addEventListener('click', openTreats);
$('treat-close').addEventListener('click', () => { $('treat-panel').hidden = true; });
$('treat-list').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-treat]');
  if (b) useTreat(b.dataset.treat as TreatId);
});
$('go-rest').addEventListener('click', rest);
let weekArmed = 0;
/** Skip the race and train another week: 3 fresh actions, one week gone, and a little rust. */
function trainWeek(): void {
  const b = $('go-week');
  if (Date.now() - weekArmed > 4000) {
    weekArmed = Date.now();
    const lose = weeksLeft() <= racesLeft();
    b.querySelector('span')!.textContent = lose ? 'Tap again: you\'ll lose a race!' : 'Tap again to skip this week\'s race';
    setTimeout(() => { if ($('stable').classList.contains('active')) renderStable(); }, 4000);
    return;
  }
  weekArmed = 0;
  day++;
  actionsLeft = ACTIONS_PER_DAY;
  fatigue = Math.max(0, fatigue - 10);
  rustWeeks++;
  growthLog = [];
  // The first week off is free; then −3 confidence, then −6 a week, up to −15. Racing clears it.
  const step = rustWeeks < 2 ? 0 : rustWeeks === 2 ? 3 : 6;
  const hit = Math.min(step, 15 - rustApplied);
  if (hit > 0) { confidence = Math.max(0, confidence - hit); rustApplied += hit; }
  const turned = weekPassed();
  save();
  if (careerOver()) { stableMsg(`${player.name}'s ${CAREER_WEEKS} weeks are up. Time to retire!`); retire(); return; }
  if (turned) { stableMsg(`${PRIME_MSG()}${hit > 0 ? ` Also a bit rusty (Confidence −${hit}).` : ''}`, true); renderStable(); return; }
  stableMsg(hit > 0 ? `A week of training. ${player.name} is getting rusty (Confidence −${hit}). A race will shake it off.` : `A week of training. 3 fresh actions!`, hit > 0);
  renderStable();
}
$('go-week').addEventListener('click', trainWeek);
$('go-feed').addEventListener('click', openFeed);
$('go-groom').addEventListener('click', openGrooming);
$('go-jockey').addEventListener('click', openJockeyRoom);
$('feed-close').addEventListener('click', () => { $('feed-panel').hidden = true; if (onRanch()) closeSheet(); });
$('feed-list').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-feed]');
  if (!b) return;
  if (onRanch() && ranch) {
    closeSheet();
    ranch.play('feed', () => { feed(b.dataset.feed as FeedId); renderRanchHud(); });
  } else feed(b.dataset.feed as FeedId);
});
$('go-race').addEventListener('click', () => {
  fieldSeed++;
  const n = raceCount + 1;
  $('pre-sub').textContent = n >= CAREER_RACES
    ? `Race ${n} of ${CAREER_RACES}: the Farewell Race. Make it count!`
    : bigToday() ? `Race ${n} of ${CAREER_RACES} · 🏆 ${bigToday()!.name} week! Enter it, or run a normal ${currentClass(career).name} race.` : `Race ${n} of ${CAREER_RACES} · ${currentClass(career).name} race. Choose a distance and your race plan, then load the gate.`;
  eventEntered = !!eventToday();
  bigEntered = !!bigToday();
  upEntered = false;
  renderEvent();
  renderPaddock();
  renderRaceOffice();
  show('pre');
  if (fatigue > 40 || hungry()) setTimeout(() => alertFatigue(), 0);
});
function alertFatigue(): void {
  const note = $('pc-buff');
  note.hidden = false;
  note.textContent = `${hungry() ? 'Hungry' + (fatigue > 40 ? ` and ${fatigueState().toLowerCase()}` : '') : fatigueState()}: starts the race at ${startEnergy()}% energy.${pendingBuff ? ` In Form: ${IN_FORM_TEXT[player.need!]}.` : ''}`;
}
$('pre-back').addEventListener('click', () => show('stable'));

// ---------- Family race ----------
let lobby: Lobby | null = null;
let net: { room: Room; host: boolean; tv: boolean } | null = null;
let netDone = false;
let lastSnapMs = 0;
const handledRooms = new WeakSet<Room>();

function openFamily(mode: 'family' | 'big' = 'family', joinAsScreen?: string): void {
  lobby?.leave();
  show('family');
  lobby = runLobby($('family-root'), {
    horse: () => structuredClone(player),
    ride: () => ({ plan: { ...plan }, confidence, confCap, startEnergy: startEnergy() }),
    jockey: () => jockey,
    distances: (Object.keys(DIST_INFO) as DistanceKey[]).map((k) => ({ key: k, label: DIST_INFO[k].label })),
    onStart: (room, start, members) => startFamilyRace(room, start, members),
    onBack: () => { lobby?.leave(); lobby = null; net = null; if (fromMenu || mode === 'big') { fromMenu = false; show('menu'); } else show('pre'); },
    mode,
    joinAsScreen,
    canRide: hasHorse(),
  });
}

function handleNet(room: Room, m: Msg): void {
  if (!net || net.room !== room || !race) return;
  if (m.type === 'input' && net.host) race.input(m.horseId as string, m.inp as Parameters<Race['input']>[1]);
  else if (m.type === 'snap' && !net.host) applySnapshot(race, m.snap as Snapshot);
  else if (m.type === 'final' && !net.host) { applySnapshot(race, m.snap as Snapshot); race.finished = true; finishFamilyRace(); }
}

function startFamilyRace(room: Room, start: StartMsg, members: Member[]): void {
  const host = members[0]?.id === deviceId;
  const tv = !start.roster.some((r) => r.id === deviceId);
  net = { room, host, tv };
  netDone = false;
  if (!handledRooms.has(room)) { handledRooms.add(room); room.onMessage((m) => handleNet(room, m)); }
  distKey = start.distKey as DistanceKey;
  tuning.gameSpeed = DIST_INFO[distKey].speed;
  field = buildEntrants(start.seed, start.roster, deviceId);
  myHorseId = horseIdFor(deviceId);
  const mine = start.roster.find((r) => r.id === deviceId);
  if (mine) Object.assign(plan, mine.ride.plan);
  race = new Race(field, start.seed, tuning, DISTANCES[distKey]);
  raceEvent = null;
  $('race').classList.remove('night');
  $('race').classList.toggle('tv', tv);
  $('rt-race').textContent = `Family race · ${DIST_INFO[distKey].label}`;
  launchRace(start.seed);
  stopBroadcast();
  if (tv) {
    const jockeys = new Map<string, Jockey>();
    for (const r of start.roster) if (r.jockey) jockeys.set(horseIdFor(r.id), { ...(r.jockey as Jockey), name: (r.jockey as Jockey).name || r.name });
    startBroadcast(jockeys, `Family race · ${DIST_INFO[distKey].label}`);
  }
}

// ---------- Stable portrait: the felt puppet, standing ----------
let stableKey = '';
async function stableHorse(def: HorseDef, lk: Look, shine: boolean): Promise<void> {
  const key = JSON.stringify([def.coat, def.name, def.color, lk, shine]);
  if (key === stableKey) return;
  stableKey = key;
  const [pose] = await puppetFrames(def, null, 1, 580, { mode: 'stand', look: lk });
  if (key !== stableKey) return; // a newer request won
  // Shrink a little, feet on the floor, so the ears clear the stall top.
  const c = document.createElement('canvas');
  c.width = pose.width; c.height = pose.height;
  c.getContext('2d')!.drawImage(pose, c.width * 0.07, c.height * 0.14, c.width * 0.86, c.height * 0.86);
  if (shine) {
    // A soft gleam along the back after brushing.
    const g = c.getContext('2d')!;
    g.globalAlpha = 0.5; g.strokeStyle = '#FFFBF2'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(c.width * 0.32, c.height * 0.36); g.quadraticCurveTo(c.width * 0.45, c.height * 0.31, c.width * 0.6, c.height * 0.34); g.stroke();
  }
  const img = new Image();
  img.src = c.toDataURL('image/png');
  img.alt = def.name;
  $('st-horse').replaceChildren(img);
}

// ---------- Big-screen broadcast ----------
let broadcast: Broadcast | null = null;
function startBroadcast(jockeys: Map<string, Jockey>, title: string): void {
  if (!race) return;
  broadcast ??= new Broadcast($('stage'), () => {});
  const r = race;
  void broadcast.load(r, jockeys).then(() => { if (race === r && broadcast) { broadcast.start(); broadcast.setTitle(title); } });
}
function stopBroadcast(): void { broadcast?.stop(); }

/** The host called the finish: everyone gets their own results. */
function finishFamilyRace(): void {
  if (netDone || !race || !net) return;
  netDone = true;
  stopBroadcast();
  if (net.tv) {
    const st = race.standings();
    lobby?.backToRoom();
    lobby?.showFinal(`<div class="card-title">Final results</div><ol class="lb-results">${st.map((h) => `<li><span class="lb-face">${portraitSVG(h.def, 36)}</span><b>${h.def.name}</b>${h.def.id.startsWith('p-') ? '' : ' <small>(computer)</small>'}</li>`).join('')}</ol>`);
    show('family');
    return;
  }
  showResults(race);
}

$('go-family').addEventListener('click', () => openFamily());
$('gift-accept').addEventListener('click', () => answerGift(true));
$('gift-decline').addEventListener('click', () => answerGift(false));
/** Big race and enter-up cards, and the entry fee, in the race office. */
function renderRaceOffice(): void {
  const big = bigToday();
  $('big-card').hidden = !big;
  if (big) {
    $('big-title').textContent = `${big.name} · ${DIST_INFO[big.dist].label}`;
    $('big-blurb').textContent = `${big.blurb} Prizes ×${big.prize}, a trophy, and a win counts double toward moving up. Entry ħ${big.fee}.`;
    $('big-rivals').innerHTML = rivalsFor(0, true).map((r) => `<li><b>${r.name}</b> · ${r.tagline}</li>`).join('');
    $('big-enter').textContent = bigEntered ? 'Entered ✓ (tap to skip it)' : `Enter the ${big.name}`;
    $('big-card').classList.toggle('on', bigEntered);
    if (bigEntered) { distKey = big.dist; renderDistance(); }
  }
  const up = canEnterUp(career) && !bigEntered;
  $('up-card').hidden = !up;
  if (up) {
    const next = CLASSES[(career.cls ?? 0) + 1];
    $('up-blurb').textContent = `Race against ${next.name} horses for ×${next.prize} prizes and more career points. A win counts double toward moving up. Entry ħ${next.fee}.`;
    $('up-enter').textContent = upEntered ? 'Entered up ✓ (tap to undo)' : `Enter up to ${next.name}`;
    $('up-card').classList.toggle('on', upEntered);
  }
  const t = terms();
  const nb = nextBigRace(day + 1);
  $('fee-line').innerHTML = `${t.label} race · Entry fee ${t.fee ? `${hd(t.fee)}` : 'free'} · You have ${hd(wallet())}${nb && !big ? ` · Next big race: ${nb.name} in week ${nb.week}` : ''}`;
}
$('big-enter').addEventListener('click', () => { bigEntered = !bigEntered; if (bigEntered) upEntered = false; renderRaceOffice(); renderPaddock(); });
$('up-enter').addEventListener('click', () => { upEntered = !upEntered; renderRaceOffice(); renderPaddock(); });

function renderEvent(): void {
  const ev = eventToday();
  $('event-card').hidden = !ev;
  if (!ev) { eventEntered = false; return; }
  $('event-title').textContent = `Special event: ${ev.name}`;
  $('event-blurb').textContent = ev.blurb;
  $('event-enter').textContent = eventEntered ? 'Entered ✓ · tap to skip' : `Enter the ${ev.name}`;
  $('event-card').classList.toggle('on', eventEntered);
  $('event-card').classList.toggle('night', ev.id === 'night');
}
$('event-enter').addEventListener('click', () => { eventEntered = !eventEntered; renderEvent(); });
$('dr-done').addEventListener('click', () => { $('drill-result').hidden = true; show('stable'); });
let resetArmed = 0;
$('start-over').addEventListener('click', () => {
  const b = $('start-over');
  if (Date.now() - resetArmed > 4000) {
    resetArmed = Date.now();
    b.textContent = 'Tap again to erase all progress';
    setTimeout(() => { b.textContent = 'Start over (reset this horse)'; }, 4000);
    return;
  }
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  location.reload();
});

$('ret-new').addEventListener('click', askFoalName);
$('ret-name-input').addEventListener('input', (e) => { const i = e.target as HTMLInputElement; const c = cleanName(i.value); if (c !== i.value) i.value = c; });
$('ret-name-go').addEventListener('click', () => {
  if (!pendingFoal) return;
  const n = cleanName(($('ret-name-input') as HTMLInputElement).value).trim();
  const err = newHorse({ ...pendingFoal, name: n || pendingFoal.name });
  if (err) $('ret-name-note').textContent = err;
});
// Rename your horse during its first 2 races; after that the name sticks.
const NAME_LOCK_RACES = 2;
const canRename = (): boolean => raceCount < NAME_LOCK_RACES;
const PENCIL = '<svg class="pencil" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 20l1-5L16 4l4 4L9 19z" fill="#FFD23F" stroke="#2B2118" stroke-width="2" stroke-linejoin="round"/><path d="M14 6l4 4" stroke="#2B2118" stroke-width="2"/><path d="M4 20l1-5 4 4z" fill="#2B2118"/></svg>';
function openRename(): void {
  if (!canRename()) { stableMsg(`${player.name}'s name is set for good now.`); return; }
  const left = NAME_LOCK_RACES - raceCount;
  $('rename-note').textContent = `You can change the name for ${left} more race${left === 1 ? '' : 's'}. After that it sticks.`;
  for (const id of ['train-panel', 'treat-panel', 'feed-panel']) $(id).hidden = true;
  const input = $('rename-input') as HTMLInputElement;
  input.value = player.name;
  $('rename-panel').hidden = false;
  $('rename-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  input.focus();
  input.select();
}
function saveRename(): void {
  if (!canRename()) return;
  const n = cleanName(($('rename-input') as HTMLInputElement).value).trim();
  if (n && n !== player.name) {
    const old = player.name;
    player.name = n;
    save();
    stableMsg(`${old} is now called ${n}.`);
  }
  renderStable();
}
$('st-nameplate').addEventListener('click', openRename);
$('pc-name').addEventListener('click', () => { if (canRename()) { show('stable'); openRename(); } });
$('rename-close').addEventListener('click', () => { $('rename-panel').hidden = true; });
$('rename-save').addEventListener('click', saveRename);
$('rename-input').addEventListener('input', (e) => { const i = e.target as HTMLInputElement; const c = cleanName(i.value); if (c !== i.value) i.value = c; });
$('rename-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveRename(); });
$('ret-breed').addEventListener('click', () => openBreeding(retiredCard?.code));
$('hall-breed').addEventListener('click', () => openBreeding());
$('ret-print').addEventListener('click', () => { try { window.print(); } catch { /* printing blocked here */ } });
$('go-hall').addEventListener('click', renderHall);
$('st-friends').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-friend]');
  if (!b) return;
  const f = FRIENDS.find((x) => x.id === b.dataset.friend)!;
  stableMsg(f.lines[Math.floor(Math.random() * f.lines.length)]);
  b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop');
});
$('st-web').addEventListener('click', () => {
  const web = $('st-web');
  if (webPending) {
    stableMsg('Willa is busy weaving. Check back after your next race.');
    web.classList.remove('nudge'); void web.offsetWidth; web.classList.add('nudge');
    return;
  }
  webPending = true;
  web.innerHTML = webSVG(webWord, 'working');
  web.classList.add('working');
  stableMsg("Willa scurries off to work! Her new word will be ready after your next race.");
  save();
});
$('hall-back').addEventListener('click', () => { if (fromMenu) { fromMenu = false; show('menu'); } else show(activeRetired() ? 'retire' : 'stable'); });
$('card-find').addEventListener('click', () => void findCard(($('card-code') as HTMLInputElement).value));
$('card-code').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') void findCard(($('card-code') as HTMLInputElement).value); });
$('card-add').addEventListener('click', () => {
  if (!foundCard || hall.some((c) => c.code === foundCard!.code)) return;
  hall.push(foundCard);
  saveHall();
  const name = foundCard.horse.name;
  foundCard = null;
  ($('card-code') as HTMLInputElement).value = '';
  renderHall();
  $('card-msg').textContent = `${name} joined your Hall of Fame as a guest.`;
});

// ---------- Backup & restore ----------
function renderBackup(): void {
  const code = backupCode();
  $('backup-code').textContent = code;
  $('backup-qr').innerHTML = qrSVG(restoreUrl(code), 120);
  const at = lastBackup();
  if (!$('backup-status').dataset.live) $('backup-status').textContent = at ? `Saved ${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Not yet';
}
onBackupStatus((s) => {
  const el = $('backup-status');
  el.dataset.live = '1';
  el.textContent = s === 'saving' ? 'Saving…' : s === 'saved' ? 'Backed up ✓' : 'Offline: will retry';
  el.className = s === 'offline' ? 'warn' : '';
});
$('backup-box').addEventListener('toggle', renderBackup);
$('backup-copy').addEventListener('click', () => {
  void navigator.clipboard?.writeText(backupCode()).then(() => { $('backup-copy').textContent = 'Copied ✓'; setTimeout(() => { $('backup-copy').textContent = 'Copy'; }, 1500); });
});
let restoreCode: string | null = null;
async function findBackup(input: string): Promise<void> {
  const msg = $('restore-msg');
  $('restore-go').hidden = true;
  restoreCode = null;
  const code = cleanBackupCode(input);
  if (!code) { msg.textContent = 'That doesn\'t look like a backup code. It reads like SAVE-7KQ2-M9XA-4RTB.'; return; }
  ($('restore-code') as HTMLInputElement).value = code;
  if (code === backupCode()) { msg.textContent = 'That\'s this phone\'s own backup code.'; return; }
  msg.textContent = 'Looking up the backup…';
  try {
    const b = await peekBackup(code);
    if (!b) { msg.textContent = `No backup found for ${code}.`; return; }
    restoreCode = code;
    const when = new Date(b.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    msg.textContent = `Found a stable${b.horse ? ` with ${b.horse}` : ''}${b.hall ? ` and ${b.hall} Hall of Fame card${b.hall > 1 ? 's' : ''}` : ''}, saved ${when}. Restoring replaces everything on this phone, and from then on both phones share one stable (the latest save wins), so play on one at a time.`;
    $('restore-go').hidden = false;
  } catch {
    msg.textContent = 'Couldn\'t reach the backups. Check the internet connection and try again.';
  }
}
$('restore-find').addEventListener('click', () => void findBackup(($('restore-code') as HTMLInputElement).value));
$('restore-go').addEventListener('click', async () => {
  if (!restoreCode) return;
  $('restore-go').textContent = 'Restoring…';
  if (await restoreBackup(restoreCode)) { history.replaceState(null, '', location.pathname); location.reload(); }
  else { $('restore-msg').textContent = 'That backup could not be loaded. Try again.'; $('restore-go').textContent = "Replace this phone's stable"; }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void backupNow(); });

// ---------- The Ranch ----------
let ranch: Ranch | null = null;
let nearStation: Station | null = null;
let toastTimer = 0;
let toasted = '';
let portalActions = -1; // set while a portal opened a barn panel (feed)
const GAIT_LABEL: Record<string, string> = { stand: '', walk: 'WALK', trot: 'TROT', canter: 'CANTER' };

function ranchToast(text: string, warn = false): void {
  if (!text) return;
  toasted = text;
  const t = $('rn-toast');
  t.textContent = text;
  t.classList.toggle('warn', warn);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.hidden = true; }, Math.max(2600, text.length * 55));
}

function renderRanchHud(): void {
  // The sky follows the day: sunrise with all actions left, golden evening with none.
  ranch?.setTimeOfDay((ACTIONS_PER_DAY - actionsLeft) / ACTIONS_PER_DAY);
  sceneAmb.tod = (ACTIONS_PER_DAY - actionsLeft) / ACTIONS_PER_DAY;
  ranch?.setFriends(friends);
  $('rn-name').textContent = player.name;
  const ev = eventToday();
  $('rn-day').textContent = `Week ${Math.min(day, CAREER_WEEKS)} of ${CAREER_WEEKS}${ev ? ` · ${ev.name}!` : ''}`;
  $('rn-actions').innerHTML = Array.from({ length: ACTIONS_PER_DAY }, (_, i) => `<i class="${i < actionsLeft ? 'on' : ''}"></i>`).join('');
  ($('rn-fatigue') as HTMLElement).style.width = `${Math.round(fatigue)}%`;
}

function enterRanch(): void {
  if (!ranch) {
    ranch = new Ranch($('rn-stage'), {
      onNear: (st) => {
        nearStation = st;
        const b = $('rn-use');
        b.hidden = !st;
        if (st) { b.querySelector('b')!.textContent = st.label; b.querySelector('span')!.textContent = st.hint; }
      },
      onGait: (g) => { $('rn-gait').textContent = GAIT_LABEL[g]; },
      onToast: (t) => ranchToast(t),
      onHoof: (g) => hoofClop(g),
    });
    setSteering(localStorage.getItem('hcd-ranch-tap') === '1');
    (window as unknown as { __ranch: Ranch }).__ranch = ranch; // handy for testing in the console
  }
  portalActions = -1;
  if (returnAtGate) { returnAtGate = false; ranch.place(2230, 480, 'left'); }
  renderRanchHud();
  ranch.setTimeOfDay((ACTIONS_PER_DAY - actionsLeft) / ACTIONS_PER_DAY, true);
  void ranch.setHorse(player, look);
  ranch.start();
  const msg = $('st-msg').textContent ?? '';
  if (msg && msg !== toasted) ranchToast(msg, $('st-msg').classList.contains('warn'));
}

function setSteering(tap: boolean): void {
  if (!ranch) return;
  ranch.tapMode = tap;
  ranch.setStick(0, 0);
  $('rn-stage').classList.toggle('tap', tap);
  $('rn-stick').hidden = tap;
  $('rn-mode').textContent = tap ? '🕹 Use stick' : '👆 Tap to go';
  try { localStorage.setItem('hcd-ranch-tap', tap ? '1' : '0'); } catch { /* ignore */ }
}

function openBarn(): void {
  home = 'stable';
  show('stable');
}

/** Walking up to a station opens its part of the game. */
let returnAtGate = false;
const sheetHome = new Map<string, { parent: Node; next: Node | null }>();
function sheet(panelId: string): void {
  const p = $(panelId);
  if (!sheetHome.has(panelId)) sheetHome.set(panelId, { parent: p.parentNode!, next: p.nextSibling });
  $('rn-sheet').append(p);
  $('rn-sheet').hidden = false;
}
function closeSheet(): void {
  for (const [id, h] of sheetHome) { const p = $(id); p.hidden = true; h.parent.insertBefore(p, h.next); }
  sheetHome.clear();
  $('rn-sheet').hidden = true;
}
const onRanch = () => $('ranch').classList.contains('active');

function usePortal(id: Station['id']): void {
  if (!ranch || ranch.busy) return;
  if (id === 'barn') { openBarn(); return; }
  if (!needAction()) return;
  if (id === 'shade') {
    ranch.play('rest', () => { rest(); renderRanchHud(); });
    return;
  }
  // Feeding and training pick from a sheet over the ranch, then play their cutscene.
  sheet(id === 'feed' ? 'feed-panel' : 'train-panel');
  if (id === 'feed') openFeed(); else openTraining();
}

$('rn-use').addEventListener('click', () => { if (nearStation) usePortal(nearStation.id); });
window.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && $('ranch').classList.contains('active') && nearStation) { e.preventDefault(); usePortal(nearStation.id); }
});
$('rn-barn').addEventListener('click', openBarn);
$('rn-race').addEventListener('click', () => $('go-race').click());
$('st-to-ranch').addEventListener('click', () => { home = 'ranch'; show('ranch'); });
$('rn-mode').addEventListener('click', () => setSteering(!ranch?.tapMode));
// Sound: unlock on the first tap (browsers require it); mute toggle on the ranch.
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });
const renderMute = () => {
  for (const id of ['rn-sound', 'snd']) { $(id).textContent = isMuted() ? '🔇' : '🔊'; $(id).setAttribute('aria-label', isMuted() ? 'Turn sound on' : 'Turn sound off'); }
};
for (const id of ['rn-sound', 'snd']) $(id).addEventListener('click', () => { setMuted(!isMuted()); renderMute(); });
renderMute();
{
  // Floating thumb stick: touch down anywhere on the open field (either thumb) and
  // the stick jumps under your finger and steers from there. When you let go it
  // slides back to its resting spot in the corner as a hint.
  const stage = $('rn-stage');
  const stick = $('rn-stick');
  const knob = stick.querySelector('i') as HTMLElement;
  const DEAD = 0.1; // ignore tiny wobbles near the centre
  let id: number | null = null;
  let cx = 0;
  let cy = 0;
  let downAt = 0;
  let travel = 0;
  const move = (e: PointerEvent) => {
    const max = stick.offsetWidth / 2 - 8;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    travel = Math.max(travel, d);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(d, max) / max;
    if (m < DEAD) { ranch?.setStick(0, 0); return; }
    const s = (m - DEAD) / (1 - DEAD) / m; // rescale so just past the dead zone starts from zero
    ranch?.setStick((dx / max) * s, (dy / max) * s);
  };
  // Touches that start on a button, panel or sheet belong to that control, not the stick.
  const onControl = (t: EventTarget | null) =>
    t instanceof Element && !!t.closest('button, a, input, select, .rn-hud, .rn-btns, .rn-sheet, .rn-toast, .rn-use, .rn-mode');
  stage.addEventListener('pointerdown', (e) => {
    if (id !== null || !ranch || ranch.tapMode || !onRanch() || !$('rn-sheet').hidden) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (onControl(e.target)) return;
    e.preventDefault();
    id = e.pointerId;
    downAt = performance.now();
    travel = 0;
    stage.setPointerCapture(e.pointerId);
    const sr = stage.getBoundingClientRect();
    const half = stick.offsetWidth / 2;
    // Keep the whole stick on screen even if the touch is right at an edge.
    const x = Math.max(half, Math.min(sr.width - half, e.clientX - sr.left));
    const y = Math.max(half, Math.min(sr.height - half, e.clientY - sr.top));
    cx = sr.left + x;
    cy = sr.top + y;
    stick.style.left = `${x - half}px`;
    stick.style.top = `${y - half}px`;
    stick.style.bottom = 'auto';
    stick.classList.add('live');
    move(e);
  });
  stage.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    // A quick tap (no drag) on a critter: go play with it.
    if (e.type === 'pointerup' && travel < 10 && performance.now() - downAt < 350) ranch?.tapAt(e.clientX, e.clientY);
    knob.style.transform = '';
    stick.classList.remove('live');
    stick.style.left = stick.style.top = stick.style.bottom = '';
    ranch?.setStick(0, 0);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('lostpointercapture', end);
}

let hadSave = false;
try { hadSave = !!localStorage.getItem(SAVE_KEY); } catch { /* storage blocked */ }
load();
player.look = look;
// Welcome a shining-star foal the first time we see it.
if (sparksOf(player).length && raceCount === 0 && day === 1) {
  let seen = true;
  try { seen = !!localStorage.getItem(`hcd-spark-seen-${player.name}`); localStorage.setItem(`hcd-spark-seen-${player.name}`, '1'); } catch { /* ignore */ }
  const sp = sparksOf(player).map((k) => STAT_LABEL[k]);
  if (!seen) setTimeout(() => stableMsg(sp.length > 1
    ? `✨✨ A rare double star! ${player.name} was born with exceptional ${sp.join(' and ')}.`
    : `✨ A shining star! ${player.name} was born with exceptional ${sp[0]}.`), 50);
}
applyJockey();
// First run with the multi-horse stable: this horse is #1 and a second starter joins it.
initStable(
  hadSave,
  raceCount + hall.filter((h) => !h.guest).reduce((t, h) => t + h.races, 0),
);
/** Back to the active horse: its retirement ceremony if its career is over, else the ranch/stable. */
function continueGame(): void {
  fromMenu = false;
  if (!hasHorse()) { openBreeding(); return; }
  if (activeRetired()) retire(); else show('stable');
}
homeMenu = runHome($('menu-root'), {
  horse: () => player,
  look: () => look,
  jockey: () => jockey,
  live: liveSummary,
  summaries: () => summaries(liveSummary()),
  hallCount: () => hall.length,
  hasHorse,
  mustBreed,
  onContinue: continueGame,
  onFamily: () => { fromMenu = true; if (hasHorse()) openFamily('family'); else openBreeding(); },
  onBigScreen: () => { fromMenu = true; openFamily('big'); },
  onHall: () => { fromMenu = true; renderHall(); },
  onIntro: () => playIntro(() => show('menu')),
  onBackup: () => {
    openBarn();
    ($('backup-box') as HTMLDetailsElement).open = true;
    renderBackup();
    setTimeout(() => $('backup-box').scrollIntoView({ block: 'start' }), 100);
  },
  onSwitch: (id) => switchTo(id, save),
  onNewHorse: (kind) => {
    if (!roomForHorse()) return STABLE_FULL;
    if (kind === 'breed') { fromMenu = true; openBreeding(); return; }
    if (mustBreed()) return 'Breed your first two horses. Random horses open up after that.';
    return newHorse();
  },
});
// After switching horses the page reloads straight into that horse's stable.
const nextScreen = takeNextScreen();
if (nextScreen) continueGame();
else show('menu');
// Links from a card's QR (?card=) or a backup QR (?restore=).
{
  const q = new URLSearchParams(location.search);
  const card = q.get('card');
  const rest = q.get('restore');
  const bigScreen = q.get('screen');
  if (card || rest || bigScreen) history.replaceState(null, '', location.pathname + (q.has('local') ? '?local' : ''));
  if (bigScreen) openFamily('big', bigScreen);
  if (card) { renderHall(); ($('card-code') as HTMLInputElement).value = card; void findCard(card); }
  else if (rest) { openBarn(); ($('backup-box') as HTMLDetailsElement).open = true; renderBackup(); void findBackup(rest); setTimeout(() => $('backup-box').scrollIntoView({ block: 'start' }), 100); }
}
// Opening sequence on every launch (Skip button), then the home menu.
if (!nextScreen && shouldPlayIntro()) {
  sceneAmb.set(null); // keep the barn ambience out of the score
  playIntro(() => show((document.body.dataset.screen as Screen) || 'menu'));
}
// Home buttons in the barn and on the ranch.
$('st-home').addEventListener('click', () => show('menu'));
$('rn-home').addEventListener('click', () => show('menu'));
setTimeout(() => { void backupNow(); void shareCards(); }, 2500);
