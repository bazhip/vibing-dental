-- Per-practice owner report customization: templates (section order and
-- visibility, headings, custom text sections, intro/home-care defaults,
-- closing note, footer, display toggles, report language) as JSON.
-- NULL = the built-in default report. Shape is defined (and tolerantly
-- normalized) client-side in src/utils/ownerReportConfig.ts.
--
-- Members read it via their existing practice-row SELECT grant; writes go
-- through the team-api edge function (`set_owner_report_config`, owner
-- only, service role), so no RLS policy changes are needed. The check
-- constraint is a backstop for the function's own ~50 KB / object-only
-- validation.
alter table public.practices
  add column if not exists owner_report_config jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'practices_owner_report_config_check'
  ) then
    alter table public.practices
      add constraint practices_owner_report_config_check
      check (
        owner_report_config is null
        or (jsonb_typeof(owner_report_config) = 'object'
            and pg_column_size(owner_report_config) <= 65536)
      );
  end if;
end $$;
