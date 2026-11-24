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
