# pyjob: scheduled forecast refresh on Vercel

`fishon_engine/` and `regions.py` are an **unmodified vendored copy** of Forecast Brain at
`feat/window-ids` commit `998fe50` (engine 2.4.0, PR #9, not yet merged), taken with
`git -C /workspace/fish-engine archive 998fe50 fishon_engine regions.py | tar -x -C web/pyjob`
(`fishon_engine/spots.py` imports `regions` from the folder above the package).
Do not edit it here; re-vendor from the engine repo instead.

`refresh.py` runs the engine for every spot and writes the results to Supabase
(`forecast_runs`, `spot_forecasts`, `sst_maps`). It is the cloud twin of
`jobs/run_forecasts.py` (same `site_payload` mapping, same SST payload, but no
PNG and no local files). `api/refresh_forecasts.py` is the HTTP entry point.

Trigger: Supabase pg_cron + pg_net every 3 hours (see docs/demo-deploy.md),
plus a daily Vercel cron as a backup. The site reads `latest_spot_forecasts`
and the newest `sst_maps` row, falling back to the committed files in
`web/data/` when Supabase is empty or unreachable.

Each run: restore the engine HTTP cache from Supabase Storage (`engine-cache/fishon-cache.sqlite.gz`),
check the 5 model run times and skip if nothing changed since the last full run (< `MAX_SKIP_H`, 4.5 h),
run the spots one at a time (stalest first, 270 s budget), maybe the SST map, then save the cache back.
A failed spot gets an `error` row and the site keeps its last real payload; nothing falls back to mock data.
