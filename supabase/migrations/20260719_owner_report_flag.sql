-- Per-practice feature flag: the owner-facing report PDF (beta).
-- Off by default for everyone; toggled per practice from the admin
-- panel (admin-api `set_feature`). Members read it via their existing
-- practice-row SELECT grant; writes happen only through the service
-- role, so no RLS policy changes are needed.
alter table public.practices
  add column if not exists owner_report_enabled boolean not null default false;
