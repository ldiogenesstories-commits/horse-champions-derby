-- Horse Champions Derby: horse cards + backups.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- The tables are locked; the game can only use the four functions below.

create table if not exists public.hcd_cards (
  code text primary key check (code ~ '^HCD-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'),
  data jsonb not null check (pg_column_size(data) < 200000),
  created_at timestamptz not null default now()
);
create table if not exists public.hcd_saves (
  key text primary key check (key ~ '^SAVE-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'),
  data jsonb not null check (pg_column_size(data) < 2000000),
  updated_at timestamptz not null default now()
);
alter table public.hcd_cards enable row level security;
alter table public.hcd_saves enable row level security;
revoke all on public.hcd_cards, public.hcd_saves from anon, authenticated;

-- A card, once published, never changes (first upload wins).
create or replace function public.card_put(p_code text, p_data jsonb) returns void
language sql security definer set search_path = public as $$
  insert into hcd_cards (code, data) values (upper(p_code), p_data) on conflict (code) do nothing;
$$;
create or replace function public.card_get(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select data from hcd_cards where code = upper(p_code);
$$;
-- A backup is only reachable by someone who knows its code.
create or replace function public.save_put(p_key text, p_data jsonb) returns void
language sql security definer set search_path = public as $$
  insert into hcd_saves (key, data, updated_at) values (upper(p_key), p_data, now())
  on conflict (key) do update set data = excluded.data, updated_at = now();
$$;
create or replace function public.save_get(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select data from hcd_saves where key = upper(p_key);
$$;

revoke all on function public.card_put(text, jsonb), public.card_get(text), public.save_put(text, jsonb), public.save_get(text) from public;
grant execute on function public.card_put(text, jsonb), public.card_get(text), public.save_put(text, jsonb), public.save_get(text) to anon, authenticated;


-- Shared breeding limit: how many foals a card has had across ALL ranches that scanned it in.
-- Run this block in the Supabase SQL Editor (safe to run more than once).
alter table public.hcd_cards add column if not exists foals int not null default 0;

-- Takes one slot if any are left. Returns foals used so far, -1 if full, -2 if the card is unknown.
-- The check and the increment happen in one statement, so two people can't take the last slot together.
create or replace function public.card_breed(p_code text, p_max int) returns int
language plpgsql security definer set search_path = public as $$
declare used int;
begin
  update hcd_cards set foals = foals + 1 where code = upper(p_code) and foals < p_max returning foals into used;
  if found then return used; end if;
  if exists (select 1 from hcd_cards where code = upper(p_code)) then return -1; end if;
  return -2;
end;
$$;
revoke all on function public.card_breed(text, int) from public;
grant execute on function public.card_breed(text, int) to anon, authenticated;
