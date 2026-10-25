# Salt Supply Co.: web prototype

Site: https://saltsupply.co.nz (the only domain). Clickable, mobile-first prototype of the rebuilt Fish-on site. **Real forecasts from Forecast Brain (`fishon_engine`, run locally); mock sign-in; no payments.** Each spot falls back to clearly labelled mock data only when the engine has no output for it.
Brand: **Salt Supply Co.** (short name / PWA: "Salt Supply"), set in `src/lib/brand.ts`. Example addresses like `hello@saltsupply.co.nz` are placeholders; no mailboxes exist. Pricing and the free/paid split are **PROPOSED** (market research, not yet approved).

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · Recharts 3. Lives in `web/` so the Python app is untouched.

## Forecast data (scheduled job, local)
Forecast Brain (engine 2.2.0) is a read-only clone of PR #6 (`feat/engine-round-d`) at `/workspace/fish-engine-site`, installed editable. It is imported, never edited (`/workspace/fish-engine` is another agent's working copy and is not used).
`data/forecasts/latest/bay_of_islands.json` is Forecast Brain's PR #8 sample (engine 2.3.0, commit c3702d4: `valid_until`, LINZ display names, en dash time ranges). The other spots stay on run `2693d266` (2.2.0) to show older output still works.
```bash
# one-off setup (repo root)
git clone --branch feat/engine-round-d https://github.com/lebrun76-lab/FIsh-on-3 /workspace/fish-engine-site
python3 -m venv jobs/.venv && jobs/.venv/bin/pip install -e "/workspace/fish-engine-site[sstmap]"
# run the job (cron in production: every 1-3 h). Takes about 100 s cold (incl. the SST map), seconds from the engine's HTTP cache
PYTHONDONTWRITEBYTECODE=1 jobs/.venv/bin/python jobs/run_forecasts.py            # all 23 spots, 10 days
PYTHONDONTWRITEBYTECODE=1 jobs/.venv/bin/python jobs/run_forecasts.py --spots hauraki_gulf moeraki
```
- Output: `web/data/forecasts/latest/<spot>.json` (the engine's v1 payload, validated, `blocks_3h` stripped), `web/data/sst/latest.json` + `web/public/sst/sst_latest.png` (SST map; ~469 Open-Meteo calls per refresh (coastal cells only since 2.2), skip with `--no-sst`), `web/data/forecasts/manifest.json` (the run row), and `web/data/saltsupply.sqlite` (git-ignored; same tables as `supabase/migrations/20261025000000_forecasts.sql`).
- Env var names only: `FISHON_CACHE_DB` (engine HTTP cache), `OPEN_METEO_API_KEY` (optional; the paid tier is needed for commercial use), `FISHON_ENGINE_PATH` (fallback import path, default the clone), `SALTSUPPLY_SST_FILE` (default `web/data/sst/latest.json`), and `SALTSUPPLY_FORECAST_DIR` (the site reads from here; default `web/data/forecasts`). The old `FISHCAST_SST_FILE` / `FISHCAST_FORECAST_DIR` names still work as a deprecated fallback; the new names win if both are set.
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
| `/` | Landing: headline + photo slot, next fishing day's calls, spots to watch | Free |
| `/where-to-go` | Ranked regions with one plain-English call each + tactics | Free sees #1 only; rest blurred and locked |
| `/spots` | Search + list/map of all spots | Free |
| `/spots/[id]` | Verdict first → wind+swell safety check → windows → outlook → charts → rules here → offline/catch log | Free: today only, plus tides and basic wind/swell. Pro: 10-day outlook, SST/current breaks, offline, catch log |
| `/rules` | Rules and closures map (sample data) | Free |
| `/species` | Species guide: sizes, bags, tactics (sample data) | Free |
| `/saved` | Saved spots plus home spot | Free: 1 spot. Pro: unlimited |
| `/catch-log` | Catch log stub | Pro |
| `/pricing` | NZ$7.99/mo or NZ$49.99/yr, 14-day no-card trial (proposed) | — |
| `/signin` | Mock magic link and Google sign-in | — |
| `/account` | Plan/trial status, alert settings, email previews (alert, welcome, trial ending; `src/lib/emails.ts`, built from the engine's alert pick 1 to 2 days ahead inside the user's "When can you fish?" times (`src/lib/fishtimes.ts`, `profiles.fishing_times`), at most 2 per user per rolling 7 days, best scores first, never the same window twice (`src/lib/alerts.ts`, `alerts_sent`); render with `npx tsx scripts/render-emails.ts && python3 scripts/render-emails.py`) | Alerts are Pro |
| `/about` | Short plain about page | — |
| `/offline` | Fallback page served by the service worker | — |

Mock state lives in `localStorage["saltsupply-mock-state"]` (an old `fishcast-mock-state` entry is read once as a fallback). Use the pricing page to start a trial, and Account to end it.
PWA: `public/manifest.webmanifest` and `public/sw.js` (a network-first stub with a cache fallback). Pro users can "Save for offline" on a spot page.

## API (Forecast Brain contract v1, served from the job output)
See `docs/forecast-api.md` (it includes the engine→v1 mapping and the proposed changes). Types: `src/lib/types.ts`. Loader: `src/lib/forecasts.ts`. Fallback mock: `src/lib/mock.ts`.
- `GET /api/v1/spots?q=&island=`
- `GET /api/v1/spots/{id}/forecast?days=1..10`
- `GET /api/v1/spots/{id}/windows?min_score=4.5` (default 4.5)
- `GET /api/v1/summaries`

## Voice and visuals
- Copy is plain and dry: short, factual, no exclamation marks, no hype words, no decorative emoji. Say what the conditions are and what to do.
- Visuals are data only (charts, SST map, tide curve). No stock or generated imagery and no decorative gradients (the SST legend gradient is a data scale).
- Photos: `PhotoSlot` (`src/components/ui.tsx`) marks where a real photo goes, labelled `PHOTO: <subject> (<ratio>)`. The shots are listed in `docs/photo-shot-list.md`.
