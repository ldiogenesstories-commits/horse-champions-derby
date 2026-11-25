// Cloud storage in the family's Supabase project, for two things:
//   - Horse cards: a retired horse's card is published under its code (HCD-XXXX-XXXX)
//     so any phone can scan or type it in and add it to its own Hall of Fame.
//   - Backups: everything this device has saved is copied under a private backup code,
//     so the stable survives a cleared browser or moves to a new phone.
// The database tables are closed to the public; the game only reaches them through
// four small server functions (see supabase/cloud.sql).
// Offline testing (file:// or ?local) uses a fake cloud kept in this browser.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

export const LOCAL_MODE = location.protocol === 'file:' || new URLSearchParams(location.search).has('local');

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 40 } }, auth: { persistSession: false } });
  return client;
}

const fake = (k: string) => `hcd-fakecloud-${k}`;

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  if (LOCAL_MODE) {
    if (fn === 'card_put') { if (!localStorage.getItem(fake(args.p_code as string))) localStorage.setItem(fake(args.p_code as string), JSON.stringify(args.p_data)); return null; }
    if (fn === 'card_breed') {
      const k = fake(`foals-${args.p_code as string}`);
      const used = Number(localStorage.getItem(k) ?? 0);
      if (used >= (args.p_max as number)) return -1 as T;
      localStorage.setItem(k, String(used + 1));
      return (used + 1) as T;
    }
    if (fn === 'save_put') { localStorage.setItem(fake(args.p_key as string), JSON.stringify(args.p_data)); return null; }
    const raw = localStorage.getItem(fake((args.p_code ?? args.p_key) as string));
    return raw ? (JSON.parse(raw) as T) : null;
  }
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data ?? null) as T | null;
}

// ---------- Horse cards ----------
const CODE_RE = /^HCD-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/;

/** Tidy whatever was typed or scanned into a card code, or null if it isn't one. */
export function cleanCardCode(input: string): string | null {
  const fromUrl = input.match(/[?&]card=([^&#\s]+)/);
  const raw = decodeURIComponent(fromUrl ? fromUrl[1] : input).toUpperCase().replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0').replace(/I/g, '1');
  const body = raw.startsWith('HCD') ? raw.slice(3) : raw;
  if (body.length !== 8) return null;
  const code = `HCD-${body.slice(0, 4)}-${body.slice(4)}`;
  return CODE_RE.test(code) ? code : null;
}

/** The address a card's QR points to: any phone camera opens the game on that card. */
export const cardUrl = (code: string) => `${location.origin}${location.pathname}?card=${code}`;

export async function publishCard(code: string, card: unknown): Promise<void> {
  await call('card_put', { p_code: code, p_data: card });
}

/**
 * Use up one of a scanned-in card's shared foal slots (max foals across ALL ranches).
 * Returns the foals used so far, or -1 if the card is full, or -2 if the card isn't on the server.
 */
export async function useCardFoalSlot(code: string, max: number): Promise<number> {
  const n = await call<number>('card_breed', { p_code: code, p_max: max });
  return n ?? -2;
}

export async function fetchCard<T>(code: string): Promise<T | null> {
  return call<T>('card_get', { p_code: code });
}

// ---------- Backups ----------
const SYNC_KEY = 'hcd-backup-code';
const SYNC_AT = 'hcd-backup-at';
/** Everything the game keeps on this device (except per-device ids and the fake cloud). */
const BACKED_UP = (k: string) => k.startsWith('hcd-') && !k.startsWith('hcd-fakecloud-') && k !== 'hcd-device-id' && k !== SYNC_KEY && k !== SYNC_AT;

export function backupCode(): string {
  let code = localStorage.getItem(SYNC_KEY);
  if (!code) {
    const A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const buf = new Uint32Array(12);
    crypto.getRandomValues(buf);
    const ch = Array.from(buf, (n) => A[n % A.length]).join('');
    code = `SAVE-${ch.slice(0, 4)}-${ch.slice(4, 8)}-${ch.slice(8)}`;
    localStorage.setItem(SYNC_KEY, code);
  }
  return code;
}

export function cleanBackupCode(input: string): string | null {
  const fromUrl = input.match(/[?&]restore=([^&#\s]+)/);
  const raw = decodeURIComponent(fromUrl ? fromUrl[1] : input).toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/I/g, '1');
  const body = raw.startsWith('SAVE') ? raw.slice(4) : raw;
  if (body.length !== 12 || /[01]/.test(body)) return null;
  return `SAVE-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}`;
}

export const restoreUrl = (code: string) => `${location.origin}${location.pathname}?restore=${code}`;

export function lastBackup(): Date | null {
  const t = Number(localStorage.getItem(SYNC_AT));
  return t ? new Date(t) : null;
}

interface Backup { v: 1; at: number; data: Record<string, string> }

function snapshot(): Backup {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (BACKED_UP(k)) data[k] = localStorage.getItem(k)!;
  }
  return { v: 1, at: Date.now(), data };
}

let timer = 0;
let status: (s: 'saving' | 'saved' | 'offline') => void = () => {};
export function onBackupStatus(cb: typeof status): void { status = cb; }

/** Back up soon (calls within a few seconds are folded into one upload). */
export function scheduleBackup(delayMs = 4000): void {
  clearTimeout(timer);
  timer = window.setTimeout(() => void backupNow(), delayMs);
}

export async function backupNow(): Promise<boolean> {
  clearTimeout(timer);
  try {
    status('saving');
    const b = snapshot();
    await call('save_put', { p_key: backupCode(), p_data: b });
    localStorage.setItem(SYNC_AT, String(b.at));
    status('saved');
    return true;
  } catch {
    status('offline');
    return false;
  }
}

/** What a backup holds, for the "restore?" question. */
export async function peekBackup(code: string): Promise<{ at: number; horse: string; hall: number } | null> {
  const b = await call<Backup>('save_get', { p_key: code });
  if (!b?.data) return null;
  let horse = '';
  let hall = 0;
  try { horse = JSON.parse(b.data['hcd-career-v1'] ?? '{}').horse?.name ?? ''; } catch { /* unnamed */ }
  try { hall = JSON.parse(b.data['hcd-hall-v1'] ?? '[]').length; } catch { /* none */ }
  return { at: b.at, horse, hall };
}

/** Replace this device's save with the backup, and keep backing up to that code. */
export async function restoreBackup(code: string): Promise<boolean> {
  const b = await call<Backup>('save_get', { p_key: code });
  if (!b?.data) return false;
  const drop: string[] = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (BACKED_UP(k)) drop.push(k); }
  for (const k of drop) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(b.data)) if (BACKED_UP(k)) localStorage.setItem(k, v);
  localStorage.setItem(SYNC_KEY, code);
  localStorage.setItem(SYNC_AT, String(b.at));
  return true;
}
