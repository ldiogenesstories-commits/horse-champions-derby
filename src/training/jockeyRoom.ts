import { cleanName } from '../game/names';
// Jockey room: name your jockey, pick silks, cap and rider looks.
// Preview shows your jockey aboard your current horse.
import type { HorseDef } from '../sim/types';
import { DEFAULT_LOOK, horseBodySVG } from '../game/horseBody';
import { HAIRS, HAIR_COLORS, PATTERNS, SILK_COLORS, SKIN_TONES, riderSVG, type Jockey } from '../game/jockey';

type Tab = 'silks' | 'colours' | 'cap' | 'rider';

export function runJockeyRoom(root: HTMLElement, horse: HorseDef, start: Jockey, onChange: (j: Jockey) => void, onBack: () => void): void {
  let j: Jockey = { ...start };
  let tab: Tab = 'silks';
  root.innerHTML = `
    <div class="drill-top">
      <div><b>Jockey room</b><span>Your silks travel with every horse</span></div>
      <button class="ghost small" id="jr-back">Back to stable</button>
    </div>
    <div class="gr-stage jr-stage" id="jr-stage"></div>
    <label class="jr-name">Jockey name <input id="jr-name" maxlength="12" autocomplete="off" spellcheck="false"></label>
    <div class="gr-tabs" id="jr-tabs" role="tablist">
      <button role="tab" data-tab="silks">Silks</button><button role="tab" data-tab="colours">Colours</button>
      <button role="tab" data-tab="cap">Cap</button><button role="tab" data-tab="rider">Rider</button>
    </div>
    <div class="gr-chips" id="jr-chips"></div>`;
  const $ = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  const name = $('jr-name') as HTMLInputElement;
  name.value = j.name;

  const draw = () => {
    $('jr-stage').innerHTML = horseBodySVG({ ...horse, color: j.primary }, horse.look ?? DEFAULT_LOOK, { rider: riderSVG(j) });
  };
  const sw = (key: keyof Jockey, val: string, label: string) =>
    `<button class="gr-chip${j[key] === val ? ' on' : ''}" data-k="${key}" data-v="${val}" aria-pressed="${j[key] === val}"><i style="background:${val}"></i>${label}</button>`;
  const ch = (key: keyof Jockey, val: string, label: string) =>
    `<button class="gr-chip${j[key] === val ? ' on' : ''}" data-k="${key}" data-v="${val}" aria-pressed="${j[key] === val}">${label}</button>`;
  const chips = () => {
    let h = '';
    if (tab === 'silks') h = PATTERNS.map(([v, l]) => ch('pattern', v, l)).join('');
    if (tab === 'colours') h = '<div class="gr-sub">Main colour</div>' + SILK_COLORS.map(([v, l]) => sw('primary', v, l)).join('')
      + '<div class="gr-sub">Second colour</div>' + SILK_COLORS.map(([v, l]) => sw('secondary', v, l)).join('');
    if (tab === 'cap') h = SILK_COLORS.map(([v, l]) => sw('cap', v, l)).join('');
    if (tab === 'rider') h = '<div class="gr-sub">Skin tone</div>' + SKIN_TONES.map(([v, l]) => sw('skin', v, l)).join('')
      + '<div class="gr-sub">Hair</div>' + HAIRS.map(([v, l]) => ch('hair', v, l)).join('')
      + '<div class="gr-sub">Hair colour</div>' + HAIR_COLORS.map(([v, l]) => sw('hairColor', v, l)).join('');
    $('jr-chips').innerHTML = h;
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  };
  const update = (next: Jockey) => { j = next; onChange(j); draw(); chips(); };

  $('jr-tabs').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');
    if (b) { tab = b.dataset.tab as Tab; chips(); }
  });
  $('jr-chips').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-k]');
    if (b) update({ ...j, [b.dataset.k!]: b.dataset.v! });
  });
  name.addEventListener('input', () => {
    // Plain letters, numbers, spaces and a few marks only.
    const clean = cleanName(name.value, 12);
    if (clean !== name.value) name.value = clean;
    j = { ...j, name: clean.trim() || 'You' };
    onChange(j);
  });
  $('jr-back').addEventListener('click', onBack);
  draw();
  chips();
}
