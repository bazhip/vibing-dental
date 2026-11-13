-- Version for practices.owner_report_config. Each save replaces the whole
-- set of owner report templates, so a stale tab or device could overwrite
-- newer templates. team-api's set_owner_report_config now does a
-- compare-and-swap on this number (409 when it moved since the client
-- loaded it) and bumps it on every write. Safe to apply before or after
-- the function/app deploy: both tolerate the column's absence.
alter table public.practices
  add column if not exists owner_report_config_rev integer not null default 0;
