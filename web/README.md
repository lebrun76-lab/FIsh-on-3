# FishCast web prototype — *placeholder brand*

Clickable, mobile-first prototype of the rebuilt Fish-on site. **Mock data, mock sign-in, no payments.**
"FishCast" is a placeholder name. Pricing and the free/paid split are **PROPOSED** (market research, not yet approved).

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · Recharts 3. Lives in `web/` so the Python app is untouched.

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

## API (mock of the Forecast Brain contract)
See `docs/forecast-api.md`. Types: `src/lib/types.ts`. Mock engine: `src/lib/mock.ts`.
- `GET /api/v1/spots?q=&island=`
- `GET /api/v1/spots/{id}/forecast?days=1..10`
- `GET /api/v1/spots/{id}/windows?min_score=6.5`
- `GET /api/v1/summaries`
