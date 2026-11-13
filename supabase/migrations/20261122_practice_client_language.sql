-- Language the practice writes to pet owners in (owner-report defaults,
-- client emails). Null = the owner's app language at the time defaults are
-- used. Safe to apply before or after the app update (the app tolerates the
-- column being absent).
alter table public.practices add column if not exists client_language text
  check (client_language is null or client_language in ('en','fr','de','it','es','pt'));
