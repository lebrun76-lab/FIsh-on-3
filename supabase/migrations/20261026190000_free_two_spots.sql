-- Free plan: two saved spots (was one). Pro and trial stay unlimited in the database; the app's
-- welcome picker offers up to 5. Replaces the function body only; the trigger from
-- 20261026180000_auth_demo.sql keeps pointing at it.
create or replace function public.favourites_free_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  select plan, paused_until into p from public.profiles where id = new.user_id;
  if (p.plan is null or p.plan = 'free' or (p.paused_until is not null and p.paused_until > now()))
     and (select count(*) from public.favourites f where f.user_id = new.user_id) >= 2 then
    raise exception 'Free plan saves two spots' using errcode = 'P0001', hint = 'free_fav_limit';
  end if;
  return new;
end $$;
revoke execute on function public.favourites_free_limit() from public, anon, authenticated;
