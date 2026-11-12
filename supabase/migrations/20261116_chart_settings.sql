-- Chart settings, per person: profiles.chart_prefs follows the account on
-- every device (pocket depth per tooth or per root, hidden grid columns,
-- values beside the teeth, charting view, PDF contents, hide the Recheck
-- due field). Shape is defined and tolerantly normalized client-side in
-- src/utils/chartSettings.ts; NULL = the built-in defaults (today's
-- layout). Users already read and update their own profile row, so no
-- policy changes are needed.
alter table public.profiles add column if not exists chart_prefs jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_chart_prefs_check') then
    alter table public.profiles
      add constraint profiles_chart_prefs_check
      check (chart_prefs is null
             or (jsonb_typeof(chart_prefs) = 'object' and pg_column_size(chart_prefs) <= 8192));
  end if;
end $$;
