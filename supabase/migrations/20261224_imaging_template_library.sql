create function consultation_private.valid_imaging_sections(sections jsonb, practice_fields boolean)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  -- ECMAScript WhiteSpace and LineTerminator characters used by String.trim().
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  built_in_ids constant text[] := array[
    'consultationCustom_imaging-technique', 'consultationCustom_imaging-findings', 'consultationCustom_imaging-impression'
  ];
  dental_section_ids constant text[] := array[
    'consultationCustom_awake-oral-exam', 'consultationCustom_preanesthetic',
    'consultationCustom_client-discussion', 'consultationCustom_home-care', 'consultationCustom_follow-up'
  ];
  allowed_keys constant text[] := array['id', 'label', 'guidance', 'example', 'suggestedText'] ||
    case when practice_fields then array['archived'] else array['format', 'level'] end;
  section jsonb;
  section_id text;
  built_in boolean;
  seen_ids text[] := '{}';
begin
  if jsonb_typeof(sections) <> 'array' then
    return false;
  end if;
  if (practice_fields and jsonb_array_length(sections) > 128)
    or (not practice_fields and jsonb_array_length(sections) not between 1 and 24) then
    return false;
  end if;

  for section in select value from jsonb_array_elements(sections) loop
    if jsonb_typeof(section) <> 'object' then
      return false;
    end if;
    if section - allowed_keys <> '{}'::jsonb
      or jsonb_typeof(section->'id') is distinct from 'string' then
      return false;
    end if;

    section_id := section->>'id';
    built_in := section_id = any(built_in_ids);
    if section_id !~ '^consultationCustom_[a-z0-9-]{1,50}$'
      or section_id = any(seen_ids)
      or section_id = any(dental_section_ids)
      or (practice_fields and built_in)
      or (not built_in and not (section ? 'label'))
      or (section ? 'label' and (jsonb_typeof(section->'label') <> 'string'
        or char_length(section->>'label') > 100 or btrim(section->>'label', trim_characters) = ''))
      or (section ? 'guidance' and (jsonb_typeof(section->'guidance') <> 'string'
        or char_length(section->>'guidance') > 1000))
      or (section ? 'example' and (jsonb_typeof(section->'example') <> 'string'
        or char_length(section->>'example') > 1000))
      or (section ? 'suggestedText' and (jsonb_typeof(section->'suggestedText') <> 'string'
        or char_length(section->>'suggestedText') > 1000))
      or (section ? 'archived' and jsonb_typeof(section->'archived') <> 'boolean')
      or (section ? 'level' and section->'level' <> '2'::jsonb)
      or (section ? 'format' and (jsonb_typeof(section->'format') <> 'string'
        or section->>'format' not in ('bullets', 'paragraph'))) then
      return false;
    end if;
    seen_ids := array_append(seen_ids, section_id);
  end loop;
  return true;
end;
$$;

create function consultation_private.valid_imaging_report_fields(fields jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  field jsonb;
begin
  if jsonb_typeof(fields) <> 'object' or fields - array['radiology', 'ct'] <> '{}'::jsonb then
    return false;
  end if;
  for field in select value from jsonb_each(fields) loop
    if jsonb_typeof(field) <> 'object' or field - array['label', 'starterText'] <> '{}'::jsonb
      or (field ? 'label' and (jsonb_typeof(field->'label') <> 'string' or char_length(field->>'label') > 100))
      or (field ? 'starterText' and (jsonb_typeof(field->'starterText') <> 'string' or char_length(field->>'starterText') > 4000)) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create function consultation_private.valid_imaging_template_library(config jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  -- ECMAScript WhiteSpace and LineTerminator characters used by String.trim().
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  starter_id constant text := 'imaging-v1';
  seen_ids text[] := '{}';
  default_id text;
  has_default boolean;
  template jsonb;
  template_id text;
  order_id jsonb;
  ordered_ids text[] := '{}';
begin
  if jsonb_typeof(config) <> 'object' or octet_length(config::text) > 196608 then
    return false;
  end if;
  if config - array['defaultId', 'templates', 'order', 'version', 'practiceFields', 'imagingReportFields'] <> '{}'::jsonb
    or config->'version' is distinct from '2'::jsonb
    or jsonb_typeof(config->'defaultId') is distinct from 'string'
    or jsonb_typeof(config->'templates') is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(config->'templates') > 24
    or (config ? 'practiceFields' and not consultation_private.valid_imaging_sections(config->'practiceFields', true))
    or (config ? 'imagingReportFields' and not consultation_private.valid_imaging_report_fields(config->'imagingReportFields')) then
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
      or not consultation_private.valid_imaging_sections(template->'sections', false) then
      return false;
    end if;
    if (template ? 'instructions' and (jsonb_typeof(template->'instructions') <> 'string'
      or char_length(template->>'instructions') > 2000)) or
      (template ? 'detail' and (jsonb_typeof(template->'detail') <> 'string'
      or template->>'detail' not in ('concise', 'detailed'))) then
      return false;
    end if;

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

revoke all on function consultation_private.valid_imaging_report_fields(jsonb) from public, anon, authenticated;
grant execute on function consultation_private.valid_imaging_report_fields(jsonb) to authenticated, service_role;
revoke all on function consultation_private.valid_imaging_sections(jsonb, boolean) from public, anon, authenticated;
revoke all on function consultation_private.valid_imaging_template_library(jsonb) from public, anon, authenticated;
grant execute on function consultation_private.valid_imaging_sections(jsonb, boolean) to authenticated, service_role;
grant execute on function consultation_private.valid_imaging_template_library(jsonb) to authenticated, service_role;

create table public.imaging_template_libraries (
  practice_id uuid primary key references public.practices(id) on delete cascade,
  revision uuid not null,
  config jsonb not null check (consultation_private.valid_imaging_template_library(config))
);

alter table public.imaging_template_libraries enable row level security;
revoke all on public.imaging_template_libraries from public, anon, authenticated;
grant select, insert, update (revision, config) on public.imaging_template_libraries to authenticated;
grant all on public.imaging_template_libraries to service_role;

create policy imaging_templates_read on public.imaging_template_libraries
  for select to authenticated using (public.is_member_of(practice_id));
create policy imaging_templates_insert on public.imaging_template_libraries
  for insert to authenticated with check (consultation_private.is_template_owner(practice_id));
create policy imaging_templates_update on public.imaging_template_libraries
  for update to authenticated
  using (consultation_private.is_template_owner(practice_id))
  with check (consultation_private.is_template_owner(practice_id));
