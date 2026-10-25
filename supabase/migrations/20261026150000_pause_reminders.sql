-- Reminder email 7 days before a winter pause ends. NOT APPLIED ANYWHERE (prototype schema).
-- One row per pause: subscription + paused_until. Pausing again with a new date is a new pause.
-- The job (service role) reads subscriptions where paused_until is set and not 'infinity', sends via
-- Resend, then inserts here. See web/src/lib/reminders.ts.
create table if not exists public.pause_reminders_sent (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  stripe_sub_id text not null,
  paused_until  timestamptz not null check (paused_until <> 'infinity'),
  email_id      text,                     -- Resend message id
  sent_at       timestamptz not null default now(),
  unique (stripe_sub_id, paused_until)
);
create index if not exists pause_reminders_sent_user on public.pause_reminders_sent (user_id, sent_at desc);

-- RLS like alerts_sent: users read their own rows; writes are server only (service role bypasses RLS).
alter table public.pause_reminders_sent enable row level security;
create policy "own pause reminders read" on public.pause_reminders_sent for select using (auth.uid() = user_id);
revoke insert, update, delete on public.pause_reminders_sent from authenticated, anon;
