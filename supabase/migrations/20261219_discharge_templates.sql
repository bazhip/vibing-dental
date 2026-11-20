-- Discharge uses version 2 libraries with their own section IDs and visibility settings.
create or replace function consultation_private.valid_discharge_template_library(config jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  -- ECMAScript WhiteSpace and LineTerminator characters used by String.trim().
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  starter_id constant text := 'discharge-v1';
  standard_fields constant text[] := array[
    'dischargeMedications', 'dischargeInstructions', 'dischargeFollowUp'
  ];
  seen_ids text[] := '{}';
  default_id text;
  has_default boolean;
  template jsonb;
  template_id text;
  section jsonb;
  section_id text;
  custom_section boolean;
  seen_sections text[];
  order_id jsonb;
  ordered_ids text[] := '{}';
begin
  if jsonb_typeof(config) <> 'object' or octet_length(config::text) > 196608 then
    return false;
  end if;
  if config - array['defaultId', 'templates', 'order', 'version'] <> '{}'::jsonb
    or config->'version' is distinct from '2'::jsonb
    or jsonb_typeof(config->'defaultId') is distinct from 'string'
    or jsonb_typeof(config->'templates') is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(config->'templates') > 24 then
    return false;
  end if;

  default_id := config->>'defaultId';
  has_default := default_id = starter_id;

  for template in select value from jsonb_array_elements(config->'templates') loop
    if jsonb_typeof(template) <> 'object' then
      return false;
    end if;
    if template - array['id', 'name', 'fields', 'archived', 'sections', 'instructions', 'detail'] <> '{}'::jsonb
      or jsonb_typeof(template->'id') is distinct from 'string'
      or jsonb_typeof(template->'name') is distinct from 'string'
      or template->'fields' is distinct from '[]'::jsonb
      or jsonb_typeof(template->'sections') is distinct from 'array'
      or (template ? 'archived' and jsonb_typeof(template->'archived') <> 'boolean') then
      return false;
    end if;

    template_id := template->>'id';
    if template_id !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
      or template_id = any(seen_ids)
      or char_length(template->>'name') > 100
      or btrim(template->>'name', trim_characters) = ''
      or jsonb_array_length(template->'sections') not between 1 and 24 then
      return false;
    end if;
    if (template ? 'instructions' and (jsonb_typeof(template->'instructions') <> 'string'
      or char_length(template->>'instructions') > 2000)) or
      (template ? 'detail' and (jsonb_typeof(template->'detail') <> 'string'
      or template->>'detail' not in ('concise', 'detailed'))) then
      return false;
    end if;

    seen_sections := '{}';
    for section in select value from jsonb_array_elements(template->'sections') loop
      if jsonb_typeof(section) <> 'object' then
        return false;
      end if;
      if section - array['id', 'label', 'guidance', 'example', 'suggestedText', 'format', 'level', 'ownerReport'] <> '{}'::jsonb
        or jsonb_typeof(section->'id') is distinct from 'string' then
        return false;
      end if;

      section_id := section->>'id';
      custom_section := section_id ~ '^dischargeCustom_[a-z0-9-]{1,50}$';
      if section_id = any(seen_sections)
        or (not custom_section and not (section_id = any(standard_fields)))
        or (custom_section and not (section ? 'label'))
        or (section ? 'label' and (jsonb_typeof(section->'label') <> 'string'
          or char_length(section->>'label') > 100 or btrim(section->>'label', trim_characters) = ''))
        or (section ? 'guidance' and (jsonb_typeof(section->'guidance') <> 'string'
          or char_length(section->>'guidance') > 1000))
        or (section ? 'example' and (jsonb_typeof(section->'example') <> 'string'
          or char_length(section->>'example') > 1000))
        or (section ? 'suggestedText' and (jsonb_typeof(section->'suggestedText') <> 'string'
          or char_length(section->>'suggestedText') > 1000))
        or (section ? 'level' and section->'level' <> '2'::jsonb)
        or (section ? 'format' and (jsonb_typeof(section->'format') <> 'string'
          or section->>'format' not in ('bullets', 'paragraph')))
        or (section ? 'ownerReport' and (not custom_section
          or jsonb_typeof(section->'ownerReport') <> 'boolean')) then
        return false;
      end if;
      seen_sections := array_append(seen_sections, section_id);
    end loop;

    seen_ids := array_append(seen_ids, template_id);
    has_default := has_default or (template_id = default_id and template->'archived' is distinct from 'true'::jsonb);
  end loop;

  if config ? 'order' then
    if jsonb_typeof(config->'order') <> 'array' then
      return false;
    end if;
    if jsonb_array_length(config->'order') > 25 then
      return false;
    end if;
    for order_id in select value from jsonb_array_elements(config->'order') loop
      if jsonb_typeof(order_id) <> 'string' then
        return false;
      end if;
      template_id := order_id #>> '{}';
      if template_id = any(ordered_ids) or not (template_id = any(array_append(seen_ids, starter_id))) then
        return false;
      end if;
      ordered_ids := array_append(ordered_ids, template_id);
    end loop;
  end if;
  return has_default;
end;
$$;

revoke all on function consultation_private.valid_discharge_template_library(jsonb) from public, anon, authenticated;
grant execute on function consultation_private.valid_discharge_template_library(jsonb) to authenticated, service_role;

create table public.discharge_template_libraries (
  practice_id uuid primary key references public.practices(id) on delete cascade,
  revision uuid not null,
  config jsonb not null check (consultation_private.valid_discharge_template_library(config))
);

alter table public.discharge_template_libraries enable row level security;
revoke all on public.discharge_template_libraries from public, anon, authenticated;
grant select, insert, update (revision, config) on public.discharge_template_libraries to authenticated;
grant all on public.discharge_template_libraries to service_role;

create policy discharge_templates_read on public.discharge_template_libraries
  for select to authenticated using (public.is_member_of(practice_id));
create policy discharge_templates_insert on public.discharge_template_libraries
  for insert to authenticated with check (consultation_private.is_template_owner(practice_id));
create policy discharge_templates_update on public.discharge_template_libraries
  for update to authenticated
  using (consultation_private.is_template_owner(practice_id))
  with check (consultation_private.is_template_owner(practice_id));

-- Older chart serializers drop the pinned Discharge layout when saving.
create or replace function consultation_private.prevent_discharge_snapshot_downgrade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.data->'patientInfo') ? 'dischargeLayout'
    and jsonb_typeof(old.data->'version') = 'number'
    and (old.data->'version') >= '3'::jsonb
    and new.data is distinct from old.data
    and not coalesce(jsonb_typeof(new.data->'version') = 'number' and (new.data->'version') >= '3'::jsonb, false) then
    raise exception 'Update ToothOps to save this discharge.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function consultation_private.prevent_discharge_snapshot_downgrade() from public, anon, authenticated;

create trigger prevent_discharge_snapshot_downgrade
  before update of data on public.charts
  for each row execute function consultation_private.prevent_discharge_snapshot_downgrade();
