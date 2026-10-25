-- SST map snapshots (engine 2.1 sstmap). One row per job run; the site reads the latest.
-- payload = the same JSON as web/data/sst/latest.json (grid, isotherms, land, notes, per-spot edges).
create table if not exists public.sst_maps (
  run_id      uuid primary key references public.forecast_runs(id) on delete cascade,
  valid_time  timestamptz not null,
  step_deg    numeric not null,
  api_calls   integer not null,          -- Open-Meteo location-calls this snapshot cost (~663)
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists sst_maps_valid_time_idx on public.sst_maps (valid_time desc);
alter table public.sst_maps enable row level security;
create policy "sst maps are public" on public.sst_maps for select using (true);
