-- Radiographic and CT reports get their own saved templates, separate from
-- the treatment report's. Existing rows stay treatment templates.
alter table public.report_templates
  add column if not exists kind text not null default 'treatment';
alter table public.report_templates
  drop constraint if exists report_templates_kind_check;
alter table public.report_templates
  add constraint report_templates_kind_check check (kind in ('treatment', 'radiology', 'ct'));
