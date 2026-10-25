# FishCast web prototype — *placeholder brand*

Clickable, mobile-first prototype of the rebuilt Fish-on site. **Real forecasts from Forecast Brain (`fishon_engine`, run locally); mock sign-in; no payments.** Each spot falls back to clearly labelled mock data only when the engine has no output for it.
"FishCast" is a placeholder name. Pricing and the free/paid split are **PROPOSED** (market research, not yet approved).

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · Recharts 3. Lives in `web/` so the Python app is untouched.

## Forecast data (scheduled job, local)
Forecast Brain (engine 2.2.0) is a read-only clone of PR #6 (`feat/engine-round-d`) at `/workspace/fish-engine-site`, installed editable. It is imported, never edited (`/workspace/fish-engine` is another agent's working copy and is not used).
```bash
# one-off setup (repo root)
git clone --branch feat/engine-round-d https://github.com/lebrun76-lab/FIsh-on-3 /workspace/fish-engine-site
python3 -m venv jobs/.venv && jobs/.venv/bin/pip install -e "/workspace/fish-engine-site[sstmap]"
# run the job (cron in production: every 1-3 h). Takes about 100 s cold (incl. the SST map), seconds from the engine's HTTP cache
PYTHONDONTWRITEBYTECODE=1 jobs/.venv/bin/python jobs/run_forecasts.py            # all 23 spots, 10 days
PYTHONDONTWRITEBYTECODE=1 jobs/.venv/bin/python jobs/run_forecasts.py --spots hauraki_gulf moeraki
```
- Output: `web/data/forecasts/latest/<spot>.json` (the engine's v1 payload, validated, `blocks_3h` stripped), `web/data/sst/latest.json` + `web/public/sst/sst_latest.png` (SST map; ~469 Open-Meteo calls per refresh (coastal cells only since 2.2), skip with `--no-sst`), `web/data/forecasts/manifest.json` (the run row), and `web/data/fishcast.sqlite` (git-ignored; same tables as `supabase/migrations/20261025000000_forecasts.sql`).
- Env var names only: `FISHON_CACHE_DB` (engine HTTP cache), `OPEN_METEO_API_KEY` (optional; the paid tier is needed for commercial use), `FISHON_ENGINE_PATH` (fallback import path, default the clone), `FISHCAST_SST_FILE`, and `FISHCAST_FORECAST_DIR` (the site reads from here; default `web/data/forecasts`).
- After a job run, `npm run build` (or wait for ISR at 30 min) to refresh static pages. Spot pages read the files on each request.

## Run
```bash
cd web
npm install
npm run dev              # http://localhost:3000 (hot reload)
# or production mode
npm run build && npm start
```

## Screenshots (headless Chrome, 390x844 and 1440x900)
```bash
pip install playwright           # uses system Chrome, no browser download needed
npm start &                      # server on :3000
python3 scripts/screenshots.py /workspace/fish-on-screenshots   # CHROME=/path/to/chrome to override
```

## Pages
| Route | What | Free / Pro |
|---|---|---|
| `/` | Landing: hero, today's calls per region, differentiators | Free |
| `/where-to-go` | Ranked regions with one plain-English call each + tactics | Free sees #1 only; rest blurred and locked |
| `/spots` | Search + list/map of all spots | Free |
| `/spots/[id]` | Verdict first → wind+swell safety check → windows → outlook → charts → rules here → offline/catch log | Free: today only, plus tides and basic wind/swell. Pro: 10-day outlook, SST/current breaks, offline, catch log |
| `/rules` | Rules and closures map (sample data) | Free |
| `/species` | Species guide: sizes, bags, tactics (sample data) | Free |
| `/saved` | Saved spots plus home spot | Free: 1 spot. Pro: unlimited |
| `/catch-log` | Catch log stub | Pro |
| `/pricing` | NZ$7.99/mo or NZ$49.99/yr, 14-day no-card trial (proposed) | — |
| `/signin` | Mock magic link and Google sign-in | — |
| `/account` | Plan/trial status, alert settings, email preview | Alerts are Pro |
| `/offline` | Fallback page served by the service worker | — |

Mock state lives in `localStorage["fishcast-mock-state"]`. Use the pricing page to start a trial, and Account to end it.
PWA: `public/manifest.webmanifest` and `public/sw.js` (a network-first stub with a cache fallback). Pro users can "Save for offline" on a spot page.

## API (Forecast Brain contract v1, served from the job output)
See `docs/forecast-api.md` (it includes the engine→v1 mapping and the proposed changes). Types: `src/lib/types.ts`. Loader: `src/lib/forecasts.ts`. Fallback mock: `src/lib/mock.ts`.
- `GET /api/v1/spots?q=&island=`
- `GET /api/v1/spots/{id}/forecast?days=1..10`
- `GET /api/v1/spots/{id}/windows?min_score=6`
- `GET /api/v1/summaries`
