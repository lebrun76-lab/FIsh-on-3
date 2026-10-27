-- "Pause for winter" for paid subscribers. NOT APPLIED ANYWHERE (prototype schema, like the others).
-- Stripe: subscriptions.update pause_collection { behavior: 'void', resumes_at } for 1 to 6 months;
-- "Resume now" clears it. The Stripe webhook (customer.subscription.updated / .deleted, service role)
-- mirrors it here. 'infinity' = paused with no end date (set by hand in the Stripe dashboard).
-- While paused: no alerts, and the app treats the user as Free (web/src/lib/pause.ts effectivePlan).
alter table public.subscriptions
  add column if not exists paused_until   timestamptz,
  add column if not exists pause_behavior text check (pause_behavior in ('void','keep_as_draft','mark_uncollectible'));
alter table public.profiles
  add column if not exists paused_until timestamptz;
comment on column public.subscriptions.paused_until is 'Stripe pause_collection.resumes_at; null = not paused. Webhook only.';
comment on column public.profiles.paused_until is 'Copy of subscriptions.paused_until for the app and alerts job. Webhook only.';

-- RLS: unchanged on purpose. "own profile read" and "own sub read" let users read their own row.
-- Users can't write either column: profiles column grants stay display_name, home_spot_id,
-- fishing_times (20261026120000), and subscriptions has no insert/update policy. Pausing goes
-- through /api/billing/pause, which calls Stripe; the webhook writes the result.
revoke insert, update, delete on public.subscriptions from authenticated, anon;

-- Who the alerts job may email: paid, not paused (a passed date counts as resumed).
create or replace view public.alert_recipients as
  select p.id as user_id, p.fishing_times
  from public.profiles p
  where p.plan in ('trial','pro','pro_annual')
    and (p.paused_until is null or p.paused_until <= now());
revoke all on public.alert_recipients from anon, authenticated; -- service role (the job) only
