// The player's profile on this phone: Horse Dollar wallet, shop purchases, and the
// stable of active horses. One profile per phone.
//
// Each horse's career is a save blob (the same JSON main.ts writes under SAVE_KEY).
// The horse you're playing lives in SAVE_KEY; the others wait in the stable list.
// Switching horses swaps blobs and reloads the page, so the game always starts
// from one clean save.

export const SAVE_KEY = 'hcd-career-v1';
const PROFILE_KEY = 'hcd-profile-v1';
const STABLE_KEY = 'hcd-stable-v1';
const NEXT_KEY = 'hcd-next-screen';

// ---- Economy (placeholders; tune later) ----
/** Horse Dollars paid per finishing place (index 0 = 1st). */
export const PRIZES = [250, 100, 60, 20, 20];
/** Event races pay this much more. */
export const EVENT_BONUS = 1.5;
/** A new horse costs the same as four wins. */
export const NEW_HORSE_COST = PRIZES[0] * 4;
export const START_SLOTS = 2;
export const MAX_SLOTS = 8;
/** One free horse once you've raced this many times (all horses together). */
export const FREE_HORSE_RACES = 9;

export const prizeFor = (place: number, event = false): number =>
  Math.round((PRIZES[place - 1] ?? 0) * (event ? EVENT_BONUS : 1));

export interface Profile {
  hd: number;
  owned: string[];
  slots: number;
  freeHorseClaimed: boolean;
  totalRaces: number;
}
export interface StableEntry { id: string; save: string | null }
export interface Stable { activeId: string; horses: StableEntry[] }

/** What My Stable shows for one horse. */
export interface HorseSummary {
  id: string;
  active: boolean;
  name: string;
  coat?: string;
  races: number;
  wins: number;
  retired: boolean;
  horse?: unknown;
}

const read = <T>(k: string, fallback: T): T => {
  try { const r = localStorage.getItem(k); return r ? { ...fallback, ...JSON.parse(r) } : fallback; } catch { return fallback; }
};
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

let profile: Profile = read<Profile>(PROFILE_KEY, { hd: 0, owned: [], slots: START_SLOTS, freeHorseClaimed: false, totalRaces: 0 });
let stable: Stable = read<Stable>(STABLE_KEY, { activeId: '', horses: [] });
const listeners = new Set<() => void>();
const changed = () => { write(PROFILE_KEY, profile); listeners.forEach((f) => f()); };

export const onProfileChange = (f: () => void) => { listeners.add(f); };
export const getProfile = (): Readonly<Profile> => profile;
export const wallet = () => profile.hd;
export const owns = (id: string) => profile.owned.includes(id);

export function earn(n: number): void { profile.hd += Math.max(0, Math.round(n)); changed(); }
/** Take Horse Dollars if there are enough. Returns false (and changes nothing) if not. */
export function spend(n: number): boolean {
  if (profile.hd < n) return false;
  profile.hd -= n;
  changed();
  return true;
}
export function buyItem(id: string, price: number): boolean {
  if (owns(id) || !spend(price)) return false;
  profile.owned.push(id);
  changed();
  return true;
}
export function countRace(): void { profile.totalRaces++; changed(); }

/** The free horse is ready to claim. */
export const freeHorseReady = () => !profile.freeHorseClaimed && profile.totalRaces >= FREE_HORSE_RACES && profile.slots < MAX_SLOTS;
export function claimFreeHorse(): boolean {
  if (!freeHorseReady()) return false;
  profile.freeHorseClaimed = true;
  profile.slots++;
  changed();
  return true;
}
export function buyHorseSlot(): boolean {
  if (profile.slots >= MAX_SLOTS || !spend(NEW_HORSE_COST)) return false;
  profile.slots++;
  changed();
  return true;
}

// ---- Stable ----
const saveStable = () => write(STABLE_KEY, stable);
const newId = () => `h${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** A save blob for a brand new horse (main.ts fills in the rest on load). */
export function freshSave(horse: { stats: unknown; boldness: number }): string {
  return JSON.stringify({ horse, stats: horse.stats, confidence: horse.boldness, confCap: Math.min(100, horse.boldness + 15) });
}

/**
 * First run on this version: the current game becomes horse #1 and a second starter
 * horse joins it. Counts past races toward the free-horse unlock.
 */
export function initStable(makeStarter: () => { stats: unknown; boldness: number }, pastRaces: number): void {
  if (stable.horses.length) return;
  const first = newId();
  stable = { activeId: first, horses: [{ id: first, save: null }, { id: newId(), save: freshSave(makeStarter()) }] };
  saveStable();
  if (!profile.totalRaces && pastRaces) { profile.totalRaces = pastRaces; changed(); }
}

export const activeId = () => stable.activeId;
export const horseCount = () => stable.horses.length;
export const emptySlots = () => Math.max(0, profile.slots - stable.horses.length);

function parse(s: string | null): Record<string, unknown> | null {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

/** Every horse in the stable. The active one is described from `live` (main.ts's current state). */
export function summaries(live: Omit<HorseSummary, 'id' | 'active'>): HorseSummary[] {
  return stable.horses.map((e) => {
    if (e.id === stable.activeId) return { ...live, id: e.id, active: true };
    const d = parse(e.save) ?? {};
    const h = (d.horse ?? {}) as { name?: string; coat?: string };
    const rec = (d.record ?? {}) as { w?: number };
    const races = Number(d.raceCount ?? 0);
    return { id: e.id, active: false, name: h.name ?? 'New horse', coat: h.coat, races, wins: rec.w ?? 0, retired: !!d.retiredCard, horse: d.horse };
  });
}

/** Where to land after the page reloads (skips the intro). */
export function setNextScreen(screen: string): void { try { sessionStorage.setItem(NEXT_KEY, screen); } catch { /* ignore */ } }
export function takeNextScreen(): string | null {
  try { const s = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); return s; } catch { return null; }
}

/** Swap to another horse. `flush` saves the current horse first. Reloads the page. */
export function switchTo(id: string, flush: () => void): void {
  if (id === stable.activeId) return;
  const target = stable.horses.find((h) => h.id === id);
  const cur = stable.horses.find((h) => h.id === stable.activeId);
  if (!target) return;
  flush();
  try {
    if (cur) cur.save = localStorage.getItem(SAVE_KEY);
    if (target.save) localStorage.setItem(SAVE_KEY, target.save);
    else localStorage.removeItem(SAVE_KEY);
    target.save = null;
    stable.activeId = id;
    saveStable();
  } catch { return; }
  setNextScreen('stable');
  location.reload();
}

export type PlaceResult = 'replaced' | 'added' | 'full';
/**
 * Put a new horse in the stable and make it active: it takes the place of the active
 * horse if that one has retired, otherwise an empty stall. Reloads unless the stable is full.
 */
export function placeNewHorse(blob: string, activeRetired: boolean, flush: () => void): PlaceResult {
  if (!activeRetired && emptySlots() === 0) return 'full';
  flush();
  try {
    if (!activeRetired) {
      const cur = stable.horses.find((h) => h.id === stable.activeId);
      if (cur) cur.save = localStorage.getItem(SAVE_KEY);
      const id = newId();
      stable.horses.push({ id, save: null });
      stable.activeId = id;
    }
    localStorage.setItem(SAVE_KEY, blob);
    saveStable();
  } catch { return 'full'; }
  setNextScreen('stable');
  location.reload();
  return activeRetired ? 'replaced' : 'added';
}

/** For backups: the whole profile and stable. */
export const exportProfile = () => ({ profile, stable });
export function importProfile(d: { profile?: Profile; stable?: Stable } | undefined): void {
  if (!d) return;
  if (d.profile) { profile = { ...profile, ...d.profile }; changed(); }
  if (d.stable) { stable = d.stable; saveStable(); }
}
