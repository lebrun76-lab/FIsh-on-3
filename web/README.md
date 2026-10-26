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
| `/pricing` | NZ$7.99/mo or NZ$49.99/yr, 30-day no-card trial (chosen by Alex). Opens Stripe Checkout in test mode | — |
| `/signin` | Mock magic link and Google sign-in | — |
| `/account` | Plan/trial status, Pause for winter (Pro), alert settings, email previews (alert, welcome, trial ending; `src/lib/emails.ts`, built from the engine's alert pick 1 to 2 days ahead inside the user's "When can you fish?" times (`src/lib/fishtimes.ts`, `profiles.fishing_times`), at most 2 per user per rolling 7 days, best scores first, never the same window twice (`src/lib/alerts.ts`, `alerts_sent`); render with `npx tsx scripts/render-emails.ts && python3 scripts/render-emails.py`) | Alerts are Pro |
| `/howd-it-go/[token]` | "How'd it go?" answer page from the follow-up email (signed token, no sign-in, noindex). GET only shows a confirm button; saving is `POST /api/howd-it-go` | — |
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

## Sign-in, demo mode and deploy
Full steps for the private demo on saltsupply.co.nz: `docs/demo-deploy.md`.
- Auth (`src/lib/supabase/`, `src/lib/auth.tsx`): with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set, sign-in is Supabase Auth (email link or 6-digit code, Google). The links come back to `/auth/callback` (PKCE code) or `/auth/confirm` (token hash). The session cookie is refreshed in `src/proxy.ts`. Without those vars the site uses pretend sign-in and localStorage, as before. The server works out who is calling from the Supabase session (`src/lib/identity.ts`). The body's `user_id` is only trusted with pretend sign-in.
- Server-only `SUPABASE_SERVICE_ROLE_KEY` (an `sb_secret_` key or the legacy `service_role` JWT) is used by the webhook and billing routes. `sb_secret_` keys go on `apikey` only.
- Migration `supabase/migrations/20261026180000_auth_demo.sql`: spots catalogue, a profile row per new user, editable alert settings, and a database limit of one saved spot on Free.
- Payment mode (`src/lib/payment-mode.ts`): no key gives `mock`, a test key gives `test`, and a live key gives `refused`. `DemoBanner` shows on every page in each mode. While not live (always, for now), the site is noindexed: `robots.txt` has `Disallow: /`, there is a robots meta tag, and `X-Robots-Tag` is set.
- Pricing: `POST /api/billing/eligibility` says whether Checkout would include a trial. Someone who has had one sees "Subscribe".
- Crons: `/api/cron/alerts`, `/api/cron/followups` and `/api/cron/pause-reminders` need `Authorization: Bearer $CRON_SECRET`. They are not scheduled (`vercel.json` `crons: []`) and return `scheduled: false` until the send loops are written.
- Env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_TEST_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `FEEDBACK_SECRET`
  - `CRON_SECRET`
  - optional `RESEND_API_KEY`
  - Never put a live key in `STRIPE_SECRET_KEY`.

## Billing: Pro subscriptions (Stripe TEST MODE only)
Pricing: NZ$7.99/month or NZ$49.99/year, 30-day free trial, no card. Stripe test objects on Alex's "Salt Supply co" account: product `prod_VVb2iTqWXQ7c2s` "Salt Supply Pro", prices by lookup_key `pro_monthly_nzd` (799 NZD/month) and `pro_yearly_nzd` (4999 NZD/year). The code resolves prices by lookup_key and checks the amount.

Keys (`src/lib/stripe.ts`): `STRIPE_TEST_SECRET_KEY`, then `STRIPE_SECRET_KEY`. Neither set: mock mode, all in memory. `sk_test_`/`rk_test_`: real test-mode calls with the Stripe SDK (API version `2026-09-30.endive`). Any live key (`sk_live_`, `rk_live_`) in either variable is refused, even when a test key is also set; errors name the variable, never the value.
- Local setup: `npx tsx scripts/stripe-env.ts` writes the Stripe CLI's test-mode key to the gitignored `.env.local` as `STRIPE_TEST_SECRET_KEY` without printing it. `stripe listen --print-secret | npx tsx scripts/stripe-env.ts --webhook-secret-stdin` adds `STRIPE_WEBHOOK_SECRET`. Run the app with `env -u STRIPE_SECRET_KEY npm run dev` if your shell has another key in `STRIPE_SECRET_KEY` (process env beats `.env.local`), then `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- `POST /api/billing/checkout {interval: "month"|"year"}`: Checkout Session, `mode: subscription`, NZD, `payment_method_collection: if_required`, `subscription_data.trial_period_days: 30`, `trial_settings.end_behavior.missing_payment_method: cancel`, `metadata.user_id`. One trial per person: a returning user gets Checkout without a trial. No `payment_method_types` (dynamic payment methods) and no `automatic_tax` (no GST registration in Stripe yet).
- Trial end with no card: **cancel**, not pause. That matches the promise (no card, no charge, back to Free) and keeps Stripe's `paused` status from being confused with Pause for winter. Coming back is a fresh Checkout.
- `POST /api/billing/portal`: Stripe Customer portal (update card, cancel, invoices), using the portal configuration with `metadata.app = salt-supply-web` (test mode `bpc_1UUZydCuajdRSWMVZP9nqk5S`: update card, cancel at period end with a reason, invoice history, email).
- `GET /api/billing/session?id=cs_...`: what a finished Checkout started (read only). `GET /api/billing/state`: prototype-only view of what the webhook wrote (404 once Supabase is configured).
- `POST /api/stripe/webhook` (`src/lib/billing.ts` `handleStripeEvent`): `checkout.session.completed`, `customer.subscription.created/updated/deleted` (re-read from Stripe, then upsert `subscriptions` by user and set `profiles.plan`: trialing to `trial` with `trial_ends_at`, active or past_due to `pro`/`pro_annual`, anything else to `free`), `invoice.paid`/`invoice.payment_failed` (`latest_invoice_status`), `customer.subscription.trial_will_end` (the "trial ends in 3 days, add a card to keep Pro" email, or the "then it's $7.99 a month on your card" one if a card is on file). Migration `20261026170000_stripe_checkout.sql`.
- Test clocks: set `STRIPE_TEST_CUSTOMER_ID=cus_...` (a customer created on a test clock) and Checkout uses that customer, so the real Checkout page and the clock work together. Test mode only.
- Tested end to end in test mode on 26 Oct 2026 (`stripe listen`, all 19 webhook deliveries 200): no-card trial through Checkout; test clock `clock_1UUa1WCuajdRSWMVMI0juoy6` +27 days sent the trial email, +31 days the subscription was canceled with a $0 invoice and the profile went to Free; the same person back through Checkout got no second trial and paid with 4242; pause and resume against that subscription; `pm_card_visa` yearly on clock `clock_1UUa4wCuajdRSWMVhFgVKVrQ` renewed at $49.99 after a year; `pm_card_chargeCustomerFail` gave `invoice.payment_failed` and stayed Free.
- Checks: `npx tsx scripts/check-billing.ts`

## Billing: Pause for winter
Same keys as above. In test mode the subscription is `STRIPE_TEST_SUBSCRIPTION_ID`, else the newest one the webhook has synced.
- `POST /api/billing/pause {months: 1..6}`: `pause_collection {behavior: "void", resumes_at}` (00:00 NZ on the same day n months on)
- `POST /api/billing/resume`: clears `pause_collection`
- `POST /api/stripe/webhook`: verifies `Stripe-Signature`, then `customer.subscription.updated/.deleted` set `subscriptions.paused_until` and `profiles.paused_until` (service role; migration `20261026140000_pause.sql`)
- While paused: no alerts (`planUserAlerts` in `src/lib/alerts.ts`, view `alert_recipients`) and the site treats the user as Free (`effectivePlan` in `src/lib/pause.ts`).
- Reminder email 7 NZ days before a pause ends, once per pause (`src/lib/reminders.ts`, `pause_reminders_sent`, migration `20261026150000_pause_reminders.sql`); under 7 days left when first seen: sent at the next run. None for no-end-date pauses or after an early resume. Sent with `src/lib/mailer.ts` (Resend; mock outbox when `RESEND_API_KEY` is unset). Preview: `ONLY=pause-reminder npx tsx scripts/render-emails.ts <dir> && python3 scripts/render-emails.py <dir>`
- Checks: `npx tsx scripts/check-pause.ts [ISO time ...]`

## "How'd it go?" follow-up and the Forecast Brain export
Scope: `docs/post-launch-catch-log.md`. Rules: `src/lib/feedback.ts`. Migration `20261026160000_howd_it_go.sql` (not applied anywhere).
- One email per sent alert (`alerts_sent`), from 8am NZ the day after the window starts (or when the window ends, if later), until the end of that NZ day; a missed run catches up the same day, then it is stale. Skipped for paused users, unsubscribed users (`profiles.emails_unsubscribed_at`) and alerts already followed up (`alerts_sent.followup_sent_at`, plus Resend idempotency key `howd-it-go/<alert id>`). The job is a library function (`runFollowups`); nothing schedules it yet.
- Buttons: Caught something / Nothing doing / Didn't go (`caught`, `nothing`, `didnt_go`). Each links to `/howd-it-go/<token>?o=<answer>`. The token is per alert, HMAC-SHA256 with `FEEDBACK_SECRET`, expires 14 days after the email. Without `RESEND_API_KEY`/`SUPABASE_URL` a fixed mock secret is used; with either set, `FEEDBACK_SECRET` is required.
- Link scanners open links, so GET never records: the page shows a one-tap confirm that POSTs. After "Caught", optional species chips (the window's `target_species` first, then the spot's list) or Skip.
- One answer per alert (`catch_feedback.alert_id` unique). It can be changed for 7 days after the first answer, while the token is valid. RLS: users read their own rows; writes are service role only. No coordinates.
- Engine 2.4 windows carry `id` (`spot:start/end`, stable across runs, new id if the window shifts) and `target_species`. Alerts store both as they were (`alerts_sent.window_id`, `.target_species`); older output gets the same `spot:start/end` id and no target species. The site's engine JSON is still 2.2/2.3 (not regenerated from engine PR #9); a fixture covers 2.4.
- Export for Forecast Brain: `exportForBrain(rows)` / `exportCsv(rows)` in `src/lib/feedback.ts` (server only), or the `catch_feedback_export` view (service role only). Columns: `spot_id, window_id, target_species, window_start, window_end, score, outcome, species`. No user ids or alert ids. `didnt_go` stays as its own outcome so it can be filtered; `hitRate` counts caught / (caught + nothing) and never counts `didnt_go`.
- Preview: `ONLY=howd-it-go npx tsx scripts/render-emails.ts <dir> && python3 scripts/render-emails.py <dir>`
- Checks: `npx tsx scripts/check-feedback.ts` (email copy is also linted in `scripts/check-calls.ts`)

## Voice and visuals
- Copy is plain and dry: short, factual, no exclamation marks, no hype words, no decorative emoji. Say what the conditions are and what to do.
- Visuals are data only (charts, SST map, tide curve). No stock or generated imagery and no decorative gradients (the SST legend gradient is a data scale).
- Photos: `PhotoSlot` (`src/components/ui.tsx`) marks where a real photo goes, labelled `PHOTO: <subject> (<ratio>)`. The shots are listed in `docs/photo-shot-list.md`.
