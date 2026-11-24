// A "room" links the family's devices for one race night.
// Two interchangeable transports:
//   - Supabase Realtime (the real thing, across phones and the TV)
//   - Local (BroadcastChannel) for testing several tabs on one computer, no internet
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

export interface Member {
  id: string; // this device's id
  name: string; // jockey name
  tv: boolean; // a shared screen with no horse of its own
  ready: boolean;
  horse?: unknown; // HorseDef, sent as plain data
  jockey?: unknown;
  joinedAt: number;
}

export type Msg = { type: string; from: string; [k: string]: unknown };

export interface Room {
  code: string;
  me: string;
  send(msg: Omit<Msg, 'from'>): void;
  onMessage(cb: (m: Msg) => void): void;
  /** Share this device's info; everyone sees the up-to-date member list. */
  setMe(m: Member): void;
  onMembers(cb: (list: Member[]) => void): void;
  leave(): void;
}

const LOCAL_MODE = location.protocol === 'file:' || new URLSearchParams(location.search).has('local');

export const deviceId = (() => {
  try {
    const k = 'hcd-device-id';
    // Local testing runs several tabs in one browser, so each tab needs its own id.
    const store = LOCAL_MODE ? sessionStorage : localStorage;
    let id = store.getItem(k);
    if (!id) { id = crypto.randomUUID(); store.setItem(k, id); }
    return id;
  } catch { return crypto.randomUUID(); }
})();

const WORDS = ['PONY', 'TROT', 'GALOP', 'HAY', 'OATS', 'MANE', 'SADDLE', 'STALL', 'DERBY', 'HOOF', 'COLT', 'FILLY'];
/** Short, easy-to-say codes like PONY-42. */
export function makeRoomCode(): string {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${w}-${10 + Math.floor(Math.random() * 90)}`;
}
export const normalizeCode = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');

/** Pick the transport: local tabs for testing (?local or file://), Supabase otherwise. */
export function openRoom(code: string, onStatus: (s: 'connecting' | 'ok' | 'error', detail?: string) => void): Room {
  return LOCAL_MODE ? localRoom(code, onStatus) : supabaseRoom(code, onStatus);
}

function supabaseRoom(code: string, onStatus: (s: 'connecting' | 'ok' | 'error', detail?: string) => void): Room {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 40 } } });
  const ch: RealtimeChannel = sb.channel(`hcd:${code}`, { config: { broadcast: { self: false, ack: false }, presence: { key: deviceId } } });
  const msgCbs: ((m: Msg) => void)[] = [];
  const memCbs: ((l: Member[]) => void)[] = [];
  let mine: Member | null = null;
  let joined = false;
  ch.on('broadcast', { event: 'm' }, ({ payload }) => msgCbs.forEach((cb) => cb(payload as Msg)));
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState<Member>();
    const list = Object.values(st).map((arr) => arr[arr.length - 1]).filter(Boolean) as Member[];
    memCbs.forEach((cb) => cb(list.sort((a, b) => a.joinedAt - b.joinedAt)));
  });
  onStatus('connecting');
  ch.subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      joined = true;
      onStatus('ok');
      if (mine) void ch.track(mine);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      onStatus('error', err?.message ?? status);
    }
  });
  return {
    code,
    me: deviceId,
    send: (m) => { void ch.send({ type: 'broadcast', event: 'm', payload: { ...m, from: deviceId } }); },
    onMessage: (cb) => { msgCbs.push(cb); },
    setMe: (m) => { mine = m; if (joined) void ch.track(m); },
    onMembers: (cb) => { memCbs.push(cb); },
    leave: () => { void ch.untrack(); void sb.removeChannel(ch); },
  };
}

function localRoom(code: string, onStatus: (s: 'connecting' | 'ok' | 'error', detail?: string) => void): Room {
  const bc = new BroadcastChannel(`hcd:${code}`);
  const msgCbs: ((m: Msg) => void)[] = [];
  const memCbs: ((l: Member[]) => void)[] = [];
  const members = new Map<string, { m: Member; seen: number }>();
  let mine: Member | null = null;
  const publish = () => {
    const now = Date.now();
    for (const [k, v] of members) if (now - v.seen > 3500) members.delete(k);
    const list = [...members.values()].map((v) => v.m).concat(mine ? [mine] : []);
    memCbs.forEach((cb) => cb(list.sort((a, b) => a.joinedAt - b.joinedAt)));
  };
  bc.onmessage = (e) => {
    const d = e.data as { kind: 'm'; msg: Msg } | { kind: 'p'; m: Member } | { kind: 'bye'; id: string };
    if (d.kind === 'm') msgCbs.forEach((cb) => cb(d.msg));
    else if (d.kind === 'p') { members.set(d.m.id, { m: d.m, seen: Date.now() }); publish(); }
    else if (d.kind === 'bye') { members.delete(d.id); publish(); }
  };
  const beat = setInterval(() => { if (mine) bc.postMessage({ kind: 'p', m: mine }); publish(); }, 1000);
  setTimeout(() => onStatus('ok'), 0);
  return {
    code,
    me: deviceId,
    send: (m) => bc.postMessage({ kind: 'm', msg: { ...m, from: deviceId } }),
    onMessage: (cb) => { msgCbs.push(cb); },
    setMe: (m) => { mine = m; bc.postMessage({ kind: 'p', m }); publish(); },
    onMembers: (cb) => { memCbs.push(cb); },
    leave: () => { clearInterval(beat); bc.postMessage({ kind: 'bye', id: deviceId }); bc.close(); },
  };
}
