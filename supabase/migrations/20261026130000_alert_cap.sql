-- Alert cap + sent log, and retire the good/great threshold. NOT APPLIED ANYWHERE (prototype schema).
-- Rules live in web/src/lib/alerts.ts: engine windows >= 4.5 only, at most 2 alerts per user per
-- rolling 7 days (best scores first, ties to the earliest window), never the same window twice.

-- 1. alert_prefs.min_score is deprecated: alerts use the engine's 4.5 bar only. Kept (nullable, no
--    default) so old rows don't break; nothing reads it. Drop in a later migration.
alter table public.alert_prefs alter column min_score drop not null;
alter table public.alert_prefs alter column min_score drop default;
comment on column public.alert_prefs.min_score is
  'DEPRECATED 2026-10-26: not read. Alerts use the engine 4.5 (fishable) bar only. Drop later.';

-- 2. Every alert sent. Written by the alerts job (service role) after the email goes out.
create table if not exists public.alerts_sent (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  spot_id       text not null references public.spots(id),
  window_start  timestamptz not null,
  window_end    timestamptz not null,
  score         real not null check (score >= 4.5),
  run_id        uuid references public.forecast_runs(id) on delete set null,
  channel       text not null default 'email' check (channel in ('email','push')),
  sent_at       timestamptz not null default now(),
  unique (user_id, spot_id, window_start)          -- the same window never goes out twice
);
-- The cap query: alerts for this user in the last 7 days.
create index if not exists alerts_sent_user_time_idx on public.alerts_sent (user_id, sent_at desc);

-- RLS: users can read their own log; no user writes (service role bypasses RLS).
alter table public.alerts_sent enable row level security;
create policy "own alerts sent read" on public.alerts_sent for select using (auth.uid() = user_id);
revoke insert, update, delete on public.alerts_sent from authenticated, anon;
