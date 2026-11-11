-- "Last active" for the admin panel.
--
-- auth.users.last_sign_in_at only moves when someone goes through a
-- sign-in flow; a user who stays signed in for weeks keeps an old value.
-- The app now calls touch_last_seen() when it opens (and when the tab
-- comes back), and the admin panel shows the later of the two.
--
-- Server time (now()), not the client clock. Throttled here too (5 min)
-- so a chatty client can't turn it into a write per request.
alter table public.profiles add column if not exists last_seen_at timestamptz;

create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen_at = now()
   where id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
$$;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
