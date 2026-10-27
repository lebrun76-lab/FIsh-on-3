-- Real sign-in for the demo (Supabase Auth: email magic link / code, Google). NOT APPLIED ANYWHERE yet.
-- Apply with the other migrations (supabase db push, or paste into the SQL editor in order).
-- 1. Spots catalogue, so favourites.spot_id and profiles.home_spot_id have something to reference.
--    Generated from web/src/lib/spots.json (23 spots). Re-running updates them in place.
-- 2. A profile row for every new auth user (trigger), plus a backfill for users made before this ran.
-- 3. Alert settings on the profile (on/off, send time), editable by the user.
-- 4. Free plan: one saved spot, enforced in the database as well as the app.

-- ---------------------------------------------------------------- 1. spots
insert into public.spots (id, name, region, island, lat, lon, coastal, species, tags, notes) values
  ('bay_of_islands', 'Bay of Islands', 'Northland', 'North', -35.25, 174.12, true, array['Snapper','Kingfish','Kahawai','Trevally','John Dory','Hapuku']::text[], array['coastal','boat','shore']::text[], 'Iconic northern fishing. Snapper and kings the main draw.'),
  ('bay_of_plenty', 'Bay of Plenty (Tauranga / Whakatāne)', 'Bay of Plenty', 'North', -37.7, 176.5, true, array['Snapper','Kingfish','Kahawai','Trevally','Gurnard','Hapuku']::text[], array['coastal','boat','shore']::text[], 'Consistent producer. Good mix of inshore and deeper water.'),
  ('coromandel', 'Coromandel', 'Waikato / Coromandel', 'North', -36.75, 175.5, true, array['Snapper','Kingfish','Kahawai','Trevally','Gurnard']::text[], array['coastal','boat','shore']::text[], 'Eastern seaboard classic. Excellent boat and kayak fishing.'),
  ('east_cape', 'East Cape', 'Gisborne / East Cape', 'North', -37.7, 178.5, true, array['Snapper','Kingfish','Kahawai','Hapuku','Bass']::text[], array['coastal','boat']::text[], 'Wild and productive. Worth the mission for serious fish.'),
  ('far_north', 'Far North (Houhora / Houhora Heads)', 'Northland', 'North', -34.8, 173.1, true, array['Snapper','Kingfish','Trevally','Kahawai','Tuna (seasonal)']::text[], array['coastal','boat']::text[], 'Remote and productive. Great for those willing to travel.'),
  ('hauraki_gulf', 'Hauraki Gulf', 'Auckland', 'North', -36.7, 175.0, true, array['Snapper','Kingfish','Kahawai','Trevally','John Dory','Gurnard']::text[], array['coastal','boat','shore']::text[], 'Auckland’s playground. Huge variety of spots from shore and boat.'),
  ('hawkes_bay', 'Hawke’s Bay', 'Hawke’s Bay', 'North', -39.5, 176.9, true, array['Snapper','Kahawai','Gurnard','Tarakihi','Kingfish']::text[], array['coastal','boat','shore']::text[], 'Good all-round fishing with solid snapper and kahawai.'),
  ('taranaki', 'Taranaki (New Plymouth)', 'Taranaki', 'North', -39.06, 174.07, true, array['Snapper','Kahawai','Gurnard','Trevally','Kingfish']::text[], array['coastal','boat','shore']::text[], 'West coast North Island. Can be weather dependent.'),
  ('wellington', 'Wellington / Cook Strait', 'Wellington', 'North', -41.29, 174.78, true, array['Blue Cod','Tarakihi','Kahawai','Barracouta','Groper','Kingfish']::text[], array['coastal','boat','shore']::text[], 'Strong currents and good fishing when the weather plays ball.'),
  ('banks_peninsula', 'Banks Peninsula / Akaroa', 'Canterbury', 'South', -43.8, 172.95, true, array['Blue Cod','Tarakihi','Kahawai','Gurnard','Flatfish']::text[], array['coastal','boat','shore']::text[], 'Sheltered harbours and good shore options around Christchurch.'),
  ('bluff', 'Bluff', 'Southland', 'South', -46.6, 168.33, true, array['Blue Cod','Tarakihi','Groper','Hapuku','Crayfish']::text[], array['coastal','boat','shore']::text[], 'Legendary blue cod fishery. One of the best in the country.'),
  ('catlins', 'Catlins', 'Otago / Southland', 'South', -46.55, 169.45, true, array['Blue Cod','Tarakihi','Kahawai','Groper']::text[], array['coastal','boat','shore']::text[], 'Quieter coastline. Rewarding when the swell drops.'),
  ('central_otago_lakes', 'Central Otago Lakes (Wānaka / Hāwea / Wakatipu)', 'Central Otago', 'South', -44.7, 169.15, false, array['Brown Trout','Rainbow Trout','Salmon (seasonal)']::text[], array['freshwater','shore','boat']::text[], 'Home water for inland South Islanders. Excellent trout fishing.'),
  ('dunedin', 'Dunedin / Otago Peninsula', 'Otago', 'South', -45.87, 170.5, true, array['Blue Cod','Tarakihi','Kahawai','Groper','Barracouta']::text[], array['coastal','boat','shore']::text[], 'Good mix of harbour and open coast fishing.'),
  ('fiordland', 'Fiordland (Milford / Doubtful / Dusky)', 'Fiordland', 'South', -44.67, 167.93, true, array['Blue Cod','Groper','Tarakihi','Crayfish','Bluefin (offshore)']::text[], array['coastal','boat']::text[], 'Top fishing, but it all depends on weather and access.'),
  ('greymouth', 'Greymouth / Hokitika', 'West Coast', 'South', -42.45, 171.21, true, array['Blue Cod','Tarakihi','Kahawai','Groper','Tuna (seasonal)']::text[], array['coastal','boat','shore']::text[], 'Main West Coast hub with good facilities.'),
  ('haast_jackson', 'Haast / Jackson Bay', 'West Coast', 'South', -43.9, 168.9, true, array['Blue Cod','Tarakihi','Bluefin Tuna','Kingfish','Groper','Bluenose']::text[], array['coastal','boat']::text[], 'Remote West Coast gem. Blue cod close, tuna and kings further out.'),
  ('kaikoura', 'Kaikōura', 'Canterbury', 'South', -42.4, 173.68, true, array['Blue Cod','Tarakihi','Groper','Kahawai','Crayfish','Tuna']::text[], array['coastal','boat','shore']::text[], 'Deep water close to shore. Famous for crayfish and big fish.'),
  ('marlborough_sounds', 'Marlborough Sounds', 'Marlborough', 'South', -41.2, 174.0, true, array['Blue Cod','Snapper','Kahawai','Tarakihi','Groper','Crayfish']::text[], array['coastal','boat','shore']::text[], 'Huge area of protected waterways. Blue cod stronghold.'),
  ('moeraki', 'Moeraki', 'Otago', 'South', -45.36, 170.86, true, array['Blue Cod','Tarakihi','Groper','Kahawai','Barracouta']::text[], array['coastal','boat','shore']::text[], 'Excellent blue cod and tarakihi. Popular from inland bases.'),
  ('nelson_bays', 'Nelson Bays / Golden Bay', 'Nelson / Tasman', 'South', -41.0, 173.2, true, array['Snapper','Blue Cod','Tarakihi','Kahawai','Gurnard','Flatfish']::text[], array['coastal','boat','shore']::text[], 'Sheltered waters, great for small boats and family fishing.'),
  ('southern_lakes', 'Southern Lakes (Te Anau / Manapouri)', 'Southland', 'South', -45.4, 167.7, false, array['Brown Trout','Rainbow Trout','Salmon']::text[], array['freshwater','shore','boat']::text[], 'Scenic and productive trout waters.'),
  ('stewart_island', 'Stewart Island / Rakiura', 'Southland', 'South', -46.9, 168.13, true, array['Blue Cod','Tarakihi','Groper','Crayfish','Hapuku']::text[], array['coastal','boat','shore']::text[], 'Remote and special. Outstanding fishing when you get there.')
on conflict (id) do update set
  name = excluded.name, region = excluded.region, island = excluded.island, lat = excluded.lat, lon = excluded.lon,
  coastal = excluded.coastal, species = excluded.species, tags = excluded.tags, notes = excluded.notes, updated_at = now();

-- ---------------------------------------------------------------- 2. profiles for new users
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)), 80))
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
  select u.id, split_part(u.email, '@', 1) from auth.users u
  on conflict (id) do nothing;

-- ---------------------------------------------------------------- 3. alert settings
alter table public.profiles
  add column if not exists alerts_enabled boolean not null default true,
  add column if not exists alert_send_at  text not null default '18:00'
    check (alert_send_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
comment on column public.profiles.alerts_enabled is 'User switch for fishing alerts (paid plans only send them).';
comment on column public.profiles.alert_send_at is 'NZ local time (HH:MM) the alert email goes out.';

-- Users may edit these columns of their own row (RLS "own profile update"). Plan, trial and pause
-- stay webhook only.
grant update (display_name, home_spot_id, fishing_times, alerts_enabled, alert_send_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------- 4. free plan: one saved spot
create or replace function public.favourites_free_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  select plan, paused_until into p from public.profiles where id = new.user_id;
  if (p.plan is null or p.plan = 'free' or (p.paused_until is not null and p.paused_until > now()))
     and (select count(*) from public.favourites f where f.user_id = new.user_id) >= 1 then
    raise exception 'Free plan saves one spot' using errcode = 'P0001', hint = 'free_fav_limit';
  end if;
  return new;
end $$;
revoke execute on function public.favourites_free_limit() from public, anon, authenticated;
drop trigger if exists favourites_free_limit on public.favourites;
create trigger favourites_free_limit before insert on public.favourites
  for each row execute function public.favourites_free_limit();
