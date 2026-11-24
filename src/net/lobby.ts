// Family race lobby: create or join a room, see who's in, get ready, host starts.
import type { HorseDef } from '../sim/types';
import { portraitSVG } from '../game/portrait';
import { silksBadge, type Jockey } from '../game/jockey';
import { deviceId, makeRoomCode, normalizeCode, openRoom, type Member, type Msg, type Room } from './room';

export interface StartMsg { type: 'start'; seed: number; distKey: string; roster: { id: string; horse: HorseDef; name: string }[] }

interface LobbyOpts {
  horse: () => HorseDef;
  jockey: () => Jockey;
  distances: { key: string; label: string }[];
  onStart: (room: Room, start: StartMsg, members: Member[]) => void;
  onBack: () => void;
}

const MAX_HORSES = 8;

export function runLobby(root: HTMLElement, o: LobbyOpts): () => void {
  let room: Room | null = null;
  let members: Member[] = [];
  let me: Member | null = null;
  let distKey = o.distances[1]?.key ?? o.distances[0].key;
  const $ = (id: string) => root.querySelector(`#${id}`) as HTMLElement;

  function home(): void {
    root.innerHTML = `
      <button class="ghost small back" id="lb-back">← Back</button>
      <div class="eyebrow">Family race</div>
      <h1>Race together</h1>
      <p class="sub">Everyone races their own horse from their own phone. One device makes a room; the others join with its code.</p>
      <div class="card">
        <div class="card-title">Start a room</div>
        <label class="lb-check"><input type="checkbox" id="lb-tv"> This screen is the TV (no horse of its own)</label>
        <button class="big go lb-wide" id="lb-create">Create a room</button>
      </div>
      <div class="card">
        <div class="card-title">Join a room</div>
        <div class="rename-row"><input id="lb-code" placeholder="e.g. PONY-42" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="10" aria-label="Room code"><button class="big go" id="lb-join">Join</button></div>
      </div>
      <p class="muted lb-status" id="lb-status"></p>`;
    $('lb-back').addEventListener('click', o.onBack);
    $('lb-create').addEventListener('click', () => enter(makeRoomCode(), ($('lb-tv') as HTMLInputElement).checked));
    const join = () => {
      const c = normalizeCode(($('lb-code') as HTMLInputElement).value);
      if (c.length < 4) { $('lb-status').textContent = 'Type the code shown on the host screen.'; return; }
      enter(c, false);
    };
    $('lb-join').addEventListener('click', join);
    $('lb-code').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') join(); });
  }

  function enter(code: string, tv: boolean): void {
    lastSig = '';
    root.innerHTML = `
      <div class="lb-top"><div><div class="eyebrow">Room code</div><div class="lb-code" id="lb-roomcode">${code}</div></div><button class="ghost small" id="lb-leave">Leave</button></div>
      <p class="muted" id="lb-conn">Connecting…</p>
      <ul class="lb-members" id="lb-members"></ul>
      <div id="lb-host"></div>
      <button class="big lb-wide" id="lb-ready" hidden></button>`;
    room = openRoom(code, (s, detail) => {
      $('lb-conn').textContent = s === 'ok' ? 'Connected. Share the code so others can join.'
        : s === 'connecting' ? 'Connecting…'
        : `Couldn't connect (${detail ?? 'error'}). Family play needs the online version of the game.`;
    });
    me = { id: deviceId, name: o.jockey().name, tv, ready: tv, horse: tv ? undefined : o.horse(), jockey: o.jockey(), joinedAt: Date.now() };
    room.setMe(me);
    room.onMembers((l) => { members = l; render(); });
    room.onMessage((m: Msg) => {
      if (m.type === 'start') o.onStart(room!, m as unknown as StartMsg, members);
    });
    $('lb-leave').addEventListener('click', () => { room?.leave(); room = null; home(); });
    $('lb-ready').addEventListener('click', () => { if (!me) return; me = { ...me, ready: !me.ready }; room!.setMe(me); render(); });
    render();
  }

  const isHost = () => members.length > 0 && members[0].id === deviceId;
  const racers = () => members.filter((m) => !m.tv);

  let lastSig = '';
  function render(): void {
    if (!room || !me) return;
    // Only redraw when something visible changed, so taps never land on a button mid-redraw.
    const sig = JSON.stringify([members.map((m) => [m.id, m.ready, m.tv, m.name, (m.horse as HorseDef | undefined)?.name]), me.ready, distKey]);
    if (sig === lastSig) return;
    lastSig = sig;
    const list = members.length ? members : [me];
    $('lb-members').innerHTML = list.map((m, i) => {
      const h = m.horse as HorseDef | undefined;
      const j = m.jockey as Jockey | undefined;
      return `<li class="${m.ready ? 'ready' : ''}">
        <span class="lb-face">${m.tv ? '📺' : h ? portraitSVG(h, 44) : ''}</span>
        <span class="lb-who"><b>${m.tv ? 'TV screen' : h?.name ?? ''}</b><small>${j ? silksBadge(j, 14) : ''} ${m.name}${i === 0 ? ' · host' : ''}${m.id === deviceId ? ' · you' : ''}</small></span>
        <span class="lb-state">${m.tv ? '' : m.ready ? 'Ready ✓' : 'Not ready'}</span></li>`;
    }).join('');
    const ready = $('lb-ready');
    ready.hidden = me.tv;
    ready.textContent = me.ready ? 'Not ready yet' : "I'm ready!";
    ready.classList.toggle('go', !me.ready);
    const host = $('lb-host');
    if (isHost()) {
      const rs = racers();
      const allReady = rs.length > 0 && rs.every((m) => m.ready);
      host.innerHTML = `<div class="card"><div class="card-title">You're the host</div>
        <div class="gr-chips">${o.distances.map((d) => `<button class="gr-chip${d.key === distKey ? ' on' : ''}" data-dist="${d.key}">${d.label}</button>`).join('')}</div>
        <p class="muted">${rs.length} horse${rs.length === 1 ? '' : 's'} in the room${rs.length < MAX_HORSES ? `; computer horses fill the other ${MAX_HORSES - Math.min(rs.length, MAX_HORSES)} gates` : ''}.</p>
        <button class="big go lb-wide" id="lb-start" ${allReady ? '' : 'disabled'}>${allReady ? 'Start the race!' : 'Waiting for everyone to be ready…'}</button></div>`;
      host.querySelectorAll<HTMLButtonElement>('[data-dist]').forEach((b) => b.addEventListener('click', () => { distKey = b.dataset.dist!; render(); }));
      $('lb-start').addEventListener('click', () => {
        const roster = racers().slice(0, MAX_HORSES).map((m) => ({ id: m.id, horse: m.horse as HorseDef, name: m.name }));
        const start: StartMsg = { type: 'start', seed: Math.floor(Math.random() * 1e9), distKey, roster };
        room!.send(start as unknown as Omit<Msg, 'from'>);
        o.onStart(room!, start, members);
      });
    } else host.innerHTML = '<p class="muted lb-wait">The host picks the distance and starts the race.</p>';
  }

  home();
  return () => { room?.leave(); room = null; };
}
