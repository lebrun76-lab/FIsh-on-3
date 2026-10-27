# Private demo deploy on saltsupply.co.nz

This is a step-by-step guide for putting the site up as a private demo for Alex and one other tester. Payments run in Stripe test mode, so no real money moves, and search engines are told to stay away. Nothing here has been deployed, no accounts have been created and DNS hasn't been touched. Every step below is one for Alex to do.

Checked on 26 Oct 2026. Prices are in USD. Free plan limits change, so check the links before you rely on them.

## What you end up with

- The site on https://saltsupply.co.nz, with www.saltsupply.co.nz redirecting to it.
- Real sign-in through Supabase Auth: an email link or 6-digit code, or Google.
- Profiles and saved spots kept in Supabase Postgres, with row level security.
- Stripe Checkout in test mode. Use card 4242 4242 4242 4242, any future date and any CVC.
- A banner on every page: "Demo. Payments are in test mode: use card 4242 4242 4242 4242, any future date, any CVC. No real money is taken."
- noindex everywhere. `/robots.txt` returns `Disallow: /`, every page has `<meta name="robots" content="noindex, nofollow">`, and every response carries `X-Robots-Tag: noindex, nofollow`. This stays on for as long as the site isn't taking live payments, and since live keys are refused, that's always for this build.
- Live Stripe keys are refused. If `sk_live_` or `rk_live_` turns up in either Stripe variable, payments switch off and the banner says so.

Still mocked or switched off:

- The alert, "How'd it go?" and pause reminder emails. The cron routes exist and are protected, but they reply "not scheduled" and send nothing. The rules are written (`src/lib/alerts.ts`, `src/lib/feedback.ts`, `src/lib/reminders.ts`), but the code that reads the database and loops through the sends isn't.
- App emails (trial ending and so on) go to an in-memory outbox unless `RESEND_API_KEY` is set. Sign-in emails don't depend on this, because Supabase sends them.
- Photos: the new photo set is still waiting on Alex's OK and isn't in this branch.

## Costs: $0

| Service | Plan | Cost | What matters for the demo | Source |
| --- | --- | --- | --- | --- |
| Vercel | Hobby | $0 | 100 GB transfer, 1M function calls and 4 h active CPU a month. Crons run at most once a day. Personal, non-commercial use only (see below). | https://vercel.com/pricing, https://vercel.com/docs/plans/hobby |
| Supabase | Free | $0 | 50,000 monthly active users, 500 MB database, 2 active projects. Pauses after a week with no activity. | https://supabase.com/pricing |
| Stripe | Test mode | $0 | Test mode never charges. | https://docs.stripe.com/testing |
| Google OAuth | | $0 | No Google review needed for sign-in that only asks for name and email. | https://support.google.com/cloud/answer/15549945 |
| Resend | Free (optional) | $0 | 3,000 emails a month, 100 a day. Not needed for the demo. | https://resend.com/pricing |
| GoDaddy | | $0 extra | You already own the domain. Vercel's TLS certificate is free. | |

Two terms to be aware of:

- **Vercel Hobby is non-commercial.** Vercel's fair use rules count "any method of requesting or processing payment from visitors" as commercial use (https://vercel.com/docs/limits/fair-use-guidelines). A private demo in test mode that takes no money is a grey area. Before launch, move to Pro at $20 per user per month (https://vercel.com/pricing).
- **Open-Meteo's free API is non-commercial.** Their terms say "websites or apps that have subscriptions" and "commercial products" are commercial use (https://open-meteo.com/en/terms). The pricing page says to "use the free tier for evaluation and prototyping" (https://open-meteo.com/en/pricing), which covers a private demo. A launch with paid subscriptions needs an API plan from that page. The free tier allows 10,000 calls a day, 5,000 an hour and 600 a minute. Note that the site itself never calls Open-Meteo: it reads the forecast files in `web/data/`, which the forecast engine fetches on its own machine. Forecast data is CC BY 4.0, so keep the Open-Meteo credit on the site (https://open-meteo.com/en/license).

## 1. Accounts (free, no card)

Sign up for both with "Continue with GitHub" using the account that owns `lebrun76-lab/FIsh-on-3`. That way Vercel can see the repo without any extra steps.

- Vercel: https://vercel.com/signup, choosing Hobby. Hobby needs no card.
- Supabase: https://supabase.com/dashboard/sign-up. The Free plan needs no card.

## 2. Supabase project

1. Create a new project, name it `saltsupply-demo`, choose region **Sydney (ap-southeast-2)** and use a generated database password (keep it in your password manager).
2. Apply the migrations from `supabase/migrations/`, oldest first: open **SQL Editor**, paste in each file, run it, then move on to the next.
   - `20261025000000_forecasts.sql`
   - `20261026000000_sst_maps.sql`
   - `20261026120000_fishing_times.sql`
   - `20261026130000_alert_cap.sql`
   - `20261026140000_pause.sql`
   - `20261026150000_pause_reminders.sql`
   - `20261026160000_howd_it_go.sql`
   - `20261026170000_stripe_checkout.sql`
   - `20261026180000_auth_demo.sql`

   If you'd rather use the CLI: `npx supabase login`, then `npx supabase link --project-ref <ref>`, then `npx supabase db push`.

   The last migration loads the 23 spots, adds a trigger that creates a `profiles` row for each new user, and limits Free users to one saved spot in the database. Users can only update their own name, home spot and alert settings, never their plan or Stripe fields. Row level security on profiles and saved spots comes from the earlier migrations. Whether someone has already had a trial comes from their Stripe history, so a returning user sees "Subscribe". It was tested against Postgres (PGlite) with 25 checks passing, but it hasn't been run on Supabase yet.
3. Go to **Project Settings > API Keys** and copy three things: the project URL, the publishable key (`sb_publishable_...`, or the legacy `anon` key) and a secret key (`sb_secret_...`, or the legacy `service_role` key). Supabase is retiring the legacy keys by the end of 2026, so use the new ones. The code sends `sb_secret_` keys on the `apikey` header only, which is what the new keys need (https://supabase.com/docs/guides/getting-started/api-keys).

### Auth URL configuration

Go to **Authentication > URL Configuration** (https://supabase.com/docs/guides/auth/redirect-urls):

- Site URL: `https://saltsupply.co.nz`
- Redirect URLs:
  - `https://saltsupply.co.nz/**`
  - `https://www.saltsupply.co.nz/**`
  - `https://*-<your-vercel-team-slug>.vercel.app/**` (preview deploys; the slug is in your Vercel URL)
  - `http://localhost:3000/**` (local dev)

The app sends people back to `/auth/callback?next=...` after a Google sign-in or an email link. Add the `.vercel.app` production URL too if you want to try it before DNS is switched.

### Email sign-in

Go to **Authentication > Sign In / Providers > Email**: leave Email on and turn "Confirm email" on.

The email can carry a link, a 6-digit code or both. The sign-in form takes either. The link only works in the browser that asked for it, so the code is handy when someone opens the email on their phone. To include the code, go to **Authentication > Emails > Magic Link** and add `{{ .Token }}` to the template, for example `<p>Or enter this code: {{ .Token }}</p>`.

**Resend is not needed for the demo,** but Supabase's built-in mailer is tightly limited:

- It only sends to people who are members of your Supabase organisation. Anyone else gets "Email address not authorized".
- It sends about 2 emails an hour across the whole project.

So either invite the second tester to the organisation (**Organization > Team > Invite**), or have them use Google. Source: https://supabase.com/docs/guides/auth/auth-smtp.

If you want open sign-up by email later, add Resend under **Authentication > Emails > SMTP Settings**. The free tier is enough (https://resend.com/pricing), but it means a Resend account and DNS records on the domain, so it isn't part of this demo.

## 3. Google sign-in

Source: https://supabase.com/docs/guides/auth/social-login/auth-google.

1. In Google Cloud Console (https://console.cloud.google.com), create a project called `saltsupply-demo`.
2. Under **Google Auth Platform > Branding**, set the app name to Salt Supply Co. and the support email to yours, and add `saltsupply.co.nz` as an authorised domain.
3. Under **Audience**, choose External and leave it in **Testing**. Because the app only asks for `openid`, email and profile, Google needs no review, and any Google account can sign in without being on the test user list (https://support.google.com/cloud/answer/15549945). That means the list doesn't keep the site private; see "Keeping it to two people" below.
4. Under **Data Access**, the scopes are `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`.
5. Under **Clients > Create client**, choose Web application:
   - Authorised JavaScript origins:
     - `https://saltsupply.co.nz`
     - `https://www.saltsupply.co.nz`
     - `http://localhost:3000`
   - Authorised redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`. Google sends people back to Supabase, not to the site. Supabase shows this exact URL on its Google provider page.
6. In Supabase, go to **Authentication > Sign In / Providers > Google**, turn it on and paste in the client ID and secret.

### Keeping it to two people

Being noindexed keeps the site out of search, but anyone who has the URL can still create an account. Once you and the tester have both signed in once, turn off **Allow new users to sign up** under **Authentication > Sign In / Providers**. Existing accounts keep working. Even then, nobody can be charged, because payments are test mode only.

## 4. Vercel project

1. **Add New > Project**, then import `lebrun76-lab/FIsh-on-3`.
2. Set the root directory to `web`. Leave the framework as Next.js, detected automatically.
3. Under **Settings > Build and Deployment > Node.js Version**, choose 22.x or newer. `@supabase/supabase-js` 2.118 expects Node 22.
4. Production branch: the code is on `site-prototype`, and main hasn't been merged. Set the production branch to `site-prototype` under **Settings > Environments > Production > Branch Tracking** (or the Git settings, depending on the dashboard version). Otherwise you can promote a `site-prototype` preview deploy to production.
5. Add the environment variables below, then deploy.

`web/vercel.json` pins functions to `syd1` (Sydney, next to the Supabase project) and leaves `crons` empty.

### Environment variables

Set these for Production, and for Preview too if you use previews. Values that start with `NEXT_PUBLIC_` end up in the browser, and they're fixed at build time, so redeploy after changing them.

| Name | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Switches real auth on. Without it the site uses pretend sign-in. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `sb_publishable_...` key | Safe in the browser. RLS protects the data. |
| `SUPABASE_SERVICE_ROLE_KEY` | the `sb_secret_...` key | Server only. Used by the webhook and billing routes. Never put it in a `NEXT_PUBLIC_` variable. |
| `STRIPE_TEST_SECRET_KEY` | `sk_test_...` or `rk_test_...` | From the Stripe dashboard in test mode (**Developers > API keys**). Keys made by the Stripe CLI expire after 90 days, so use a dashboard key here. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | From the webhook endpoint in step 5. It isn't the same as the `stripe listen` secret. |
| `FEEDBACK_SECRET` | 32+ random characters | Required once Supabase is set. It signs the "How'd it go?" links. Generate with `openssl rand -hex 32`. |
| `CRON_SECRET` | 32+ random characters | The cron routes return 503 without it and 401 without `Authorization: Bearer <CRON_SECRET>`. Vercel sends this header itself (https://vercel.com/docs/cron-jobs/manage-cron-jobs). |
| `RESEND_API_KEY` | leave unset | Unset means app emails go to the mock outbox. |

Do **not** set `STRIPE_SECRET_KEY`. If a live key ends up there it gets refused anyway and payments switch off, but leave it empty.

Optional: `STRIPE_TEST_CUSTOMER_ID` and `STRIPE_TEST_SUBSCRIPTION_ID` are for test clocks only, so leave them unset. `SALTSUPPLY_FORECAST_DIR` and `SALTSUPPLY_SST_FILE` default to the files in `web/data/`, which ship with the deploy.

## 5. Stripe test webhook

Source: https://docs.stripe.com/webhooks.

1. In the Stripe dashboard, make sure test mode (sandbox) is on.
2. Go to **Developers > Webhooks > Add destination** (or "Add endpoint"):
   - URL: `https://saltsupply.co.nz/api/stripe/webhook`
   - Events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `customer.subscription.trial_will_end`
     - `invoice.paid`
     - `invoice.payment_failed`
3. Copy the signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` on Vercel and redeploy.

The webhook checks the `Stripe-Signature` header (a bad signature gets 400) and writes plan changes to Supabase with the secret key. Until DNS points at Vercel, you can add a second endpoint on the `.vercel.app` URL.

## 6. Domain: GoDaddy to Vercel

Doing this changes where saltsupply.co.nz points. Only do it once you're happy for the demo to replace whatever is there now. Leave the email records (MX, and the TXT records for SPF, DKIM and DMARC) as they are.

### In Vercel

1. Go to **Project > Settings > Domains > Add**, and add `saltsupply.co.nz`.
2. Add `www.saltsupply.co.nz` and set it to **redirect** to `saltsupply.co.nz` (308). The site, its links and the Stripe webhook all use the apex domain. Vercel's default suggestion is the other way round, with www as the main domain; either works, but this app expects the apex.
3. Vercel then shows the records to create, each one on its domain card. **Use the values on the card.** For a project using outside DNS, Vercel's documented values are:
   - apex: an `A` record at `@`. The long-standing value is `76.76.21.21`; newer projects may be shown a different IP, such as `216.198.79.1`.
   - www: a `CNAME` at `www` pointing to the target on the card, either a project-specific one like `d1d4fc829fe7bc7c.vercel-dns-017.com` or the general `cname.vercel-dns-0.com`.
   - Sometimes a `TXT` record at `_vercel` to prove ownership, if the domain has been used on another Vercel account.

   Sources:
   - https://vercel.com/docs/domains/working-with-domains/add-a-domain
   - https://vercel.com/kb/guide/a-record-and-caa-with-vercel

   Vercel doesn't support IPv6 for custom domains, so remove any `AAAA` records on `@` or `www`.

### In GoDaddy

Source: https://www.godaddy.com/help/edit-an-a-record-19239.

1. Sign in, open your **Domain Portfolio**, select `saltsupply.co.nz`, then **DNS** (the DNS Records tab).
2. Check under **Nameservers** that the domain uses GoDaddy's nameservers. If it uses someone else's, these edits won't do anything; make them wherever the DNS is hosted instead.
3. Apex: find the `A` record named `@` (on a new domain it often says "Parked"), select **Edit** and set:
   - Value: the IP from the Vercel card
   - TTL: the shortest choice (600 seconds, or ½ hour)

   Save. If there's more than one `A` record on `@`, delete the extras so only the Vercel one is left.
4. Delete any `AAAA` record on `@` or `www`.
5. www: find the `CNAME` named `www` (usually pointing at `@`), select **Edit** and set:
   - Value: the CNAME target from the Vercel card
   - TTL: the shortest choice

   Save. If an `A` record exists on `www`, delete it, because a name can't have both.
6. If Vercel asked for one, add a `TXT` record named `_vercel` with the value it gave.
7. Under **Forwarding** (on the domain settings page), make sure domain forwarding is off for both the domain and www. Forwarding overrides the A record.
8. If there's a `CAA` record on `@`, add `0 issue "letsencrypt.org"` so Vercel can issue the certificate. If there isn't one, do nothing.
9. If the domain has Domain Protection, GoDaddy will ask for a verification code.

Most changes show up within an hour; GoDaddy allows up to 48 hours. Vercel's domain card turns green once it sees the records, then issues the HTTPS certificate on its own.

Once the domain resolves, sign in on https://saltsupply.co.nz with Google and with an email code, start a trial on Pricing, and check that the account page shows "Pro trial".

## 7. Forecast refresh (on) and other crons (off)

Forecasts refresh in the cloud about every 3 hours, with no redeploy:

- `api/refresh_forecasts.py` is a Vercel Python function (300 s max). It runs Forecast Brain from the vendored copy in `pyjob/` (see `pyjob/README.md`), writes `forecast_runs`, `spot_forecasts` and (at most every 5.5 h) `sst_maps` to Supabase, then calls `/api/cron/revalidate-forecasts` to purge the site's cached reads.
- The trigger is Supabase `pg_cron` + `pg_net` (`7 */3 * * *` UTC) calling it with `Authorization: Bearer $FORECAST_REFRESH_SECRET`, because Hobby crons run at most once a day. `vercel.json` also has one daily Vercel cron (`15 17 * * *`, 6:15am NZDT) as a backup; it authenticates with `CRON_SECRET`.
- Each run first asks Open-Meteo for the 5 model run times (`fetch_model_runs`). If none changed since the last full run and that run is under 4.5 h old (`MAX_SKIP_H`), it stops there: no new rows, 5 calls. The run times are stored in `forecast_runs.notes.model_runs` and in every payload's `model_runs`.
- Spots run one after another (about 4 Open-Meteo calls each), stalest first, inside a 270 s budget; the SST map waits 61 s after the last spot call. Engine: vendored Forecast Brain 2.4.0 (`valid_until`, `windows[].id`, `target_species`).
- The engine's SQLite HTTP cache (`FISHON_CACHE_DB`) is restored from the private Supabase Storage bucket `engine-cache` (`fishon-cache.sqlite.gz`, ~35 KB, created on first save) at the start of a run and saved back at the end, so LINZ tide tables (30 d), SST (12 h) and marine/model comparison (3 h) stay cached and the engine can serve stale data if an API fails.
- Pages read the newest ok row from `latest_spot_forecasts` (anon key, Next data cache, tag `forecasts`) and the committed `data/forecasts/latest/*.json` file, and show whichever is newer. A spot that fails keeps its last real forecast (shown as older); live pages never fall back to mock data. A failed or partial run never empties a page.
- Open-Meteo budget: about 4 calls a spot (~97 a run with the model checks, at most ~780 a day at 8 runs) plus the SST map (~470-660 calls, at most ~4-5 a day), so roughly 3,000-4,000 of the 10,000 a day. A 45-minute gap guard stops double runs; `?force=1` overrides it and the model-run skip. `OPEN_METEO_API_KEY` (paid plan) is supported by the engine but not set.
- Manual run: `curl -H "Authorization: Bearer $CRON_SECRET" "https://saltsupply.co.nz/api/refresh_forecasts?force=1"`. `?dry=1` just checks the engine imports.

The other cron routes are in place but not scheduled. They need `CRON_SECRET`:

| Route | Job | Logic |
| --- | --- | --- |
| `/api/cron/alerts` | evening fishing alerts | `src/lib/alerts.ts` `planUserAlerts` |
| `/api/cron/followups` | "How'd it go?" emails | `src/lib/feedback.ts` `runFollowups` |
| `/api/cron/pause-reminders` | 7-day pause reminders | `src/lib/reminders.ts` `runPauseReminders` |

At the moment each route returns `{"scheduled": false, "sent": 0, ...}`, because the database read and the send loop still need writing.

On Hobby, crons can run at most once a day, Vercel picks a time anywhere within the hour, and a schedule that runs more often fails the deploy (https://vercel.com/docs/cron-jobs/usage-and-pricing). Cron times are in UTC. When the jobs are ready, a daily schedule could be:

```json
"crons": [
  { "path": "/api/cron/alerts", "schedule": "0 5 * * *" },
  { "path": "/api/cron/followups", "schedule": "0 19 * * *" },
  { "path": "/api/cron/pause-reminders", "schedule": "0 20 * * *" }
]
```

These run at 6pm, 8am and 9am NZDT, an hour later in NZST. Per-user alert times need an hourly run, which means Pro.

## Going from demo to launch (not part of this)

- A live Stripe key needs code changes on purpose. `src/lib/payment-mode.ts` refuses live keys, and the banner and noindex are tied to that.
- Vercel Pro, an Open-Meteo API plan, Resend with domain DNS records, GST in Stripe, and the cron send loops.
