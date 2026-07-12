-- Daily Wisdom — global like counter (Supabase / Postgres).
--
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste →
-- Run. It is idempotent, so re-running is safe.
--
-- Model: one row per quote. Anonymous visitors may READ counts and call the
-- increment function, nothing else. The function is SECURITY DEFINER so it can
-- update the table even though anon has no direct write access (RLS).

-- 1) The table: quote_id (the date-based id, e.g. "2026-07-12") -> count.
create table if not exists public.likes (
  quote_id text primary key,
  count    integer not null default 0
);

-- 2) Lock the table down with Row Level Security.
alter table public.likes enable row level security;

-- 3) Anyone may read the counts (needed to display hearts).
drop policy if exists "Public read counts" on public.likes;
create policy "Public read counts"
  on public.likes
  for select
  to anon, authenticated
  using (true);

-- NB: we intentionally create NO insert/update/delete policy for anon, so the
-- only way to change a count is through the controlled function below.

-- 4) Atomic increment. Upserts the row and bumps the count by one in a single
--    statement (safe under concurrency), returning the new total.
create or replace function public.increment_like(qid text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.likes (quote_id, count)
  values (qid, 1)
  on conflict (quote_id)
  do update set count = public.likes.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

-- 5) Let anonymous visitors call the increment function (and read counts).
grant execute on function public.increment_like(text) to anon, authenticated;
grant select on public.likes to anon, authenticated;
