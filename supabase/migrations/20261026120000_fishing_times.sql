-- "When can you fish?" on the user's profile. NOT APPLIED ANYWHERE (prototype schema, like the others).
-- Values match web/src/lib/fishtimes.ts:
--   weekday_morning  Mon to Fri, window ends by 9am ("before work")
--   weekday_evening  Mon to Fri, window starts 4pm or later
--   saturday, sunday whole day
--   any              every window (stored on its own)
-- Default: weekends plus any time from 4pm. Alerts (score >= 4.5, 1 to 2 days ahead) only go out
-- for a window that sits fully inside one of these.
alter table public.profiles
  add column if not exists fishing_times text[] not null
    default array['weekday_evening','saturday','sunday']::text[];

alter table public.profiles
  add constraint profiles_fishing_times_valid check (
    cardinality(fishing_times) between 1 and 5
    and fishing_times <@ array['weekday_morning','weekday_evening','saturday','sunday','any']::text[]
    and (not ('any' = any(fishing_times)) or cardinality(fishing_times) = 1)
  );

-- RLS: the existing "own profile read" / "own profile update" policies already limit rows to
-- auth.uid() = id. Column grants were narrowed in 20261025000000 (users can't touch plan / trial),
-- so allow this column too. Re-granting the earlier columns keeps this migration self-contained.
grant update (display_name, home_spot_id, fishing_times) on public.profiles to authenticated;
