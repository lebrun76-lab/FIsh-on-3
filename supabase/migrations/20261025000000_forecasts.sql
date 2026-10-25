-- FishCast (placeholder name) - future Supabase schema. NOT APPLIED ANYWHERE.
-- Mirrors what jobs/run_forecasts.py writes locally (web/data/fishcast.sqlite
-- and web/data/forecasts/latest/*.json). Postgres 15+/Supabase.
--
-- Write path: scheduled job (service role key, server-side only) runs
-- Forecast Brain (fishon_engine), maps to API v1 and upserts here.
-- Read path: Next.js server components / ISR read latest_spot_forecasts
-- with the anon key (public read). Users never write forecast tables.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- catalog
create table public.spots (
  id            text primary key,              -- matches fishon_engine SPOTS ids
  name          text not null,
  region        text not null,
  island        text not null check (island in ('North','South')),
  lat           double precision not null,
  lon           double precision not null,
  marine_lat    double precision,
  marine_lon    double precision,
  coastal       boolean not null default true,
  facing_deg    real,                          -- bearing the shore faces (null for lakes)
  tide_port     text,                          -- LINZ standard port, null = modelled tides
  species       text[] not null default '{}',
  tags          text[] not null default '{}',
  notes         text,
  active        boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- job runs
create table public.forecast_runs (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  engine_version  text not null,              -- fishon_engine.__version__
  mapper_version  text not null,              -- jobs/run_forecasts.py MAPPER_VERSION
  days            int  not null,
  spots_ok        int,
  spots_failed    int,
  status          text not null check (status in ('running','ok','partial','failed')),
  notes           jsonb                         -- {spot_id: error}
);

-- One row per spot per run. payload = API v1 SpotForecast (+ v1.1 extras).
create table public.spot_forecasts (
  run_id          uuid not null references public.forecast_runs(id) on delete cascade,
  spot_id         text not null references public.spots(id),
  api_version     text not null default '1',
  generated_at    timestamptz,
  valid_from      date,
  valid_to        date,
  status          text not null check (status in ('ok','error')),
  error           text,
  tide_source     text,                         -- 'LINZ Auckland' | 'Open-Meteo modelled sea level ...'
  payload         jsonb,                        -- what the site renders
  engine_payload  jsonb,                        -- raw engine output, for debugging / re-mapping
  primary key (run_id, spot_id)
);
create index spot_forecasts_latest_idx on public.spot_forecasts (spot_id, generated_at desc) where status = 'ok';

-- Tide extremes kept relationally so alerts / "tide turns" queries don't parse jsonb.
create table public.tide_events (
  run_id    uuid not null references public.forecast_runs(id) on delete cascade,
  spot_id   text not null references public.spots(id),
  time      timestamptz not null,
  type      text not null check (type in ('high','low')),
  height_m  real,
  datum     text not null,                     -- 'chart datum (LINZ)' | 'MSL (Open-Meteo modelled sea level)'
  source    text,
  primary key (run_id, spot_id, time)
);

create view public.latest_spot_forecasts as
  select distinct on (spot_id) spot_id, run_id, api_version, generated_at, valid_from, valid_to, tide_source, payload
  from public.spot_forecasts
  where status = 'ok'
  order by spot_id, generated_at desc;

-- Retention: keep 14 days of runs (run from the job or pg_cron).
-- delete from public.forecast_runs where started_at < now() - interval '14 days';

-- ---------------------------------------------------------------- user data
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  home_spot_id  text references public.spots(id),
  plan          text not null default 'free' check (plan in ('free','trial','pro','pro_annual')),
  trial_ends_at timestamptz,
  created_at    timestamptz not null default now()
);

create table public.favourites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  spot_id    text not null references public.spots(id),
  created_at timestamptz not null default now(),
  primary key (user_id, spot_id)
);

create table public.alert_prefs (
  user_id      uuid not null references auth.users(id) on delete cascade,
  spot_id      text not null references public.spots(id),
  min_score    real not null default 6.0,      -- engine "Good" band
  channel      text not null default 'email' check (channel in ('email','push')),
  active       boolean not null default true,
  last_sent_at timestamptz,
  primary key (user_id, spot_id)
);

-- Written only by the Stripe webhook (service role). Users can read their own.
create table public.subscriptions (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id  text unique,
  stripe_sub_id       text unique,
  price_id            text,
  status              text not null,          -- trialing | active | past_due | canceled
  current_period_end  timestamptz,
  updated_at          timestamptz not null default now()
);

create table public.catch_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  spot_id    text references public.spots(id),
  caught_at  timestamptz not null,
  species    text not null,
  length_cm  real,
  kept       boolean,
  notes      text,
  photo_path text,                             -- storage bucket path (private)
  conditions jsonb,                            -- snapshot of the forecast hour at caught_at
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
alter table public.spots          enable row level security;
alter table public.forecast_runs  enable row level security;
alter table public.spot_forecasts enable row level security;
alter table public.tide_events    enable row level security;
alter table public.profiles       enable row level security;
alter table public.favourites     enable row level security;
alter table public.alert_prefs    enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.catch_log      enable row level security;

-- Public read for catalog + forecasts (the free tier is public). Writes: service role only (bypasses RLS).
create policy "spots readable"     on public.spots          for select using (true);
create policy "forecasts readable" on public.spot_forecasts for select using (status = 'ok');
create policy "tides readable"     on public.tide_events    for select using (true);
-- forecast_runs: no policies -> not readable with anon/auth keys.

create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
-- plan / trial are set by the Stripe webhook + signup trigger (service role), never by the user:
revoke update on public.profiles from authenticated, anon;
grant update (display_name, home_spot_id) on public.profiles to authenticated;
create policy "own favourites" on public.favourites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own alerts"     on public.alert_prefs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sub read"   on public.subscriptions for select using (auth.uid() = user_id);
create policy "own catches"    on public.catch_log  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- NOTE: Pro gating of 10-day data is enforced in the app/API layer for the prototype;
-- move paid-only fields behind a security-definer function if they must be hidden at the DB.
