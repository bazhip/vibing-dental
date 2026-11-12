-- Record who accepted which version of the Terms / Privacy Policy / DPA.
--
-- terms_version: the version string the user agreed to (src/constants/legal.ts
-- TERMS_VERSION). terms_accepted_at: when. Both null = never recorded (every
-- account created before this migration) — the app asks those users to accept
-- the current terms.
--
-- Users write their own row (existing "users update own profile" policy);
-- the app only ever sets these to the current version and now().

alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

-- Email signups tick the box before the account exists, so the signup
-- request carries terms_version in user metadata; copy it onto the new
-- profile. The timestamp is the server's (when the account was created),
-- never a client-supplied value, so a malformed one can't break signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public as $$
declare
  accepted text := nullif(new.raw_user_meta_data ->> 'terms_version', '');
begin
  insert into public.profiles (id, practice_name, doctor_name, terms_version, terms_accepted_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'practice_name', ''),
    coalesce(new.raw_user_meta_data ->> 'doctor_name', ''),
    accepted,
    case when accepted is not null then now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
