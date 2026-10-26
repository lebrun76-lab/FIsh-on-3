-- Phone alerts (Web Push, VAPID). FILE ONLY: not applied to any database yet.
-- Needs 20261026130000_alert_cap.sql (alerts_sent) and 20261026160000_howd_it_go.sql first.

-- One row per browser/device a user has switched phone alerts on in.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,         -- the push service URL for this browser
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- The switch, plus saved spots the user has turned off for phone alerts.
create table if not exists public.push_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  enabled     boolean not null default false,
  spots_off   text[] not null default '{}',
  updated_at  timestamptz not null default now()
);

-- RLS: users see and change their own rows only. The send job uses the service role.
alter table public.push_subscriptions enable row level security;
alter table public.push_settings      enable row level security;
create policy "own push subscriptions" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own push settings"      on public.push_settings      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_settings      to authenticated;

-- alerts_sent logs both channels. An email and a push for the same window are separate rows,
-- so the unique key needs the channel. Push rows are good-or-better only (score >= 6).
alter table public.alerts_sent drop constraint if exists alerts_sent_user_id_spot_id_window_start_key;
alter table public.alerts_sent add constraint alerts_sent_user_spot_window_channel_key unique (user_id, spot_id, window_start, channel);
alter table public.alerts_sent add constraint alerts_sent_push_good check (channel <> 'push' or score >= 6);
-- Push's one-per-spot-per-day check reads the last few days by channel.
create index if not exists alerts_sent_user_channel_time_idx on public.alerts_sent (user_id, channel, sent_at desc);
