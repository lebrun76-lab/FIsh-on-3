-- "How'd it go?" follow-up (Alex, 26 Oct 2026). NOT APPLIED ANYWHERE (prototype schema).
-- Rules live in web/src/lib/feedback.ts. One email per alert in alerts_sent, ~8am NZ the next day;
-- one answer per alert (caught | nothing | didnt_go), changeable for 7 days. No coordinates anywhere.

-- Unsubscribed users get no follow-ups (set by the unsubscribe link handler, service role).
alter table public.profiles add column if not exists emails_unsubscribed_at timestamptz;

-- The engine window as it was in the alert (engine 2.4: window.id + target_species; null on older rows),
-- and when the follow-up went out (the job's "send once" marker; Resend idempotency key howd-it-go/<id>).
alter table public.alerts_sent
  add column if not exists window_id         text,
  add column if not exists target_species    text[],
  add column if not exists followup_sent_at  timestamptz,
  add column if not exists followup_email_id text;

create table if not exists public.catch_feedback (
  id             uuid primary key default gen_random_uuid(),
  alert_id       uuid not null unique references public.alerts_sent(id) on delete cascade,  -- one answer per alert
  user_id        uuid not null references auth.users(id) on delete cascade,
  spot_id        text not null references public.spots(id),
  window_id      text not null,                -- alerts_sent.window_id, or spot:start/end for older rows
  window_start   timestamptz not null,
  window_end     timestamptz not null check (window_end > window_start),
  score          real not null,                -- engine score in the alert
  target_species text[],                       -- snapshot of the window's target_species (engine 2.4+)
  outcome        text not null check (outcome in ('caught','nothing','didnt_go')),
  species        text[] not null default '{}' check (outcome = 'caught' or cardinality(species) = 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists catch_feedback_spot_idx on public.catch_feedback (spot_id, window_start);
create index if not exists catch_feedback_user_idx on public.catch_feedback (user_id, created_at desc);

-- RLS: users read their own answers; all writes go through the token route (service role).
alter table public.catch_feedback enable row level security;
create policy "own catch feedback read" on public.catch_feedback for select using (auth.uid() = user_id);
revoke insert, update, delete on public.catch_feedback from authenticated, anon;

-- Forecast Brain export: no user ids, no alert ids. Service role only.
create or replace view public.catch_feedback_export with (security_invoker = true) as
  select spot_id, window_id, window_start, window_end, score, target_species, outcome, species
  from public.catch_feedback;
revoke all on public.catch_feedback_export from authenticated, anon;
