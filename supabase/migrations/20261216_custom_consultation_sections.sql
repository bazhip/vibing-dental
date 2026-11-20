-- Extend the existing library check while preserving legacy configurations.
create or replace function consultation_private.valid_template_library(config jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  expected_fields constant jsonb := '[
    "complaint", "consultationHistory", "consultationAssessment",
    "consultationPlan", "gpVitals", "gpPhysicalExam", "gpDiagnostics"
  ]';
  -- ECMAScript WhiteSpace and LineTerminator characters used by String.trim().
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  seen_ids text[] := '{}';
  default_id text;
  has_default boolean;
  template jsonb;
  template_id text;
  section jsonb;
  section_id text;
  seen_sections text[];
  order_id jsonb;
  ordered_ids text[] := '{}';
  starter_ids constant text[] := array['dental-v1', 'dental-v2', 'soap-v1', 'recheck-v1'];
  standard_fields constant text[] := array[
    'complaint', 'consultationHistory', 'consultationAssessment', 'consultationPlan',
    'gpVitals', 'gpPhysicalExam', 'gpDiagnostics',
    'consultationCurrentMedications', 'consultationAdministeredMedications', 'consultationMedicationPlan'
  ];
  dental_fields constant text[] := array[
    'consultationCustom_awake-oral-exam', 'consultationCustom_preanesthetic',
    'consultationCustom_client-discussion', 'consultationCustom_home-care', 'consultationCustom_follow-up'
  ];
begin
  if jsonb_typeof(config) <> 'object' or octet_length(config::text) > 196608 then
    return false;
  end if;
  if config - array['defaultId', 'templates', 'order', 'version'] <> '{}'::jsonb
    or (config ? 'version' and config->'version' <> '2'::jsonb)
    or jsonb_typeof(config->'defaultId') is distinct from 'string'
    or jsonb_typeof(config->'templates') is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(config->'templates') > 24 then
    return false;
  end if;

  default_id := config->>'defaultId';
  has_default := default_id = any(starter_ids);

  for template in select value from jsonb_array_elements(config->'templates') loop
    if jsonb_typeof(template) <> 'object' then
      return false;
    end if;
    if template - array['id', 'name', 'fields', 'archived', 'sections', 'instructions', 'detail'] <> '{}'::jsonb
      or jsonb_typeof(template->'id') is distinct from 'string'
      or jsonb_typeof(template->'name') is distinct from 'string'
      or jsonb_typeof(template->'fields') is distinct from 'array'
      or (template ? 'archived' and jsonb_typeof(template->'archived') <> 'boolean') then
      return false;
    end if;

    template_id := template->>'id';
    if template_id !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
      or template_id = any(seen_ids)
      or char_length(template->>'name') > 100
      or btrim(template->>'name', trim_characters) = ''
      or jsonb_array_length(template->'fields') <> jsonb_array_length(expected_fields)
      or not ((template->'fields') @> expected_fields) then
      return false;
    end if;

    if (template ? 'instructions' and (jsonb_typeof(template->'instructions') <> 'string'
      or char_length(template->>'instructions') > 2000)) or
      (template ? 'detail' and (jsonb_typeof(template->'detail') <> 'string'
      or template->>'detail' not in ('concise', 'detailed'))) then
      return false;
    end if;

    if template ? 'sections' then
      if jsonb_typeof(template->'sections') <> 'array' then
        return false;
      end if;
      if jsonb_array_length(template->'sections') not between 1 and 24 then
        return false;
      end if;
      seen_sections := '{}';
      for section in select value from jsonb_array_elements(template->'sections') loop
        if jsonb_typeof(section) <> 'object' then
          return false;
        end if;
        if section - array['id', 'label', 'guidance', 'example', 'suggestedText', 'format', 'level'] <> '{}'::jsonb
          or jsonb_typeof(section->'id') is distinct from 'string' then
          return false;
        end if;
        section_id := section->>'id';
        if section_id = any(seen_sections)
          or (not (section_id = any(standard_fields)) and section_id !~ '^consultationCustom_[a-z0-9-]{1,50}$')
          or (left(section_id, 19) = 'consultationCustom_' and not (section_id = any(dental_fields)) and not (section ? 'label'))
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
            or section->>'format' not in ('bullets', 'paragraph'))) then
          return false;
        end if;
        seen_sections := array_append(seen_sections, section_id);
      end loop;
    end if;

    seen_ids := array_append(seen_ids, template_id);
    has_default := has_default or (template_id = default_id and template->'archived' is distinct from 'true'::jsonb);
  end loop;

  if config ? 'order' then
    if jsonb_typeof(config->'order') <> 'array' then
      return false;
    end if;
    if jsonb_array_length(config->'order') > 28 then
      return false;
    end if;
    for order_id in select value from jsonb_array_elements(config->'order') loop
      if jsonb_typeof(order_id) <> 'string' then
        return false;
      end if;
      template_id := order_id #>> '{}';
      if template_id = any(ordered_ids) or not (template_id = any(seen_ids || starter_ids)) then
        return false;
      end if;
      ordered_ids := array_append(ordered_ids, template_id);
    end loop;
  end if;
  return has_default;
end;
$$;

-- A pre-customization client can read a consultation, but its version-1
-- serializer strips custom layout metadata and dictation sources on save.
create or replace function consultation_private.prevent_consultation_snapshot_downgrade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.data #>> '{patientInfo,visitType}' = 'consultation'
    and jsonb_typeof(old.data->'version') = 'number'
    and (old.data->'version') >= '2'::jsonb
    and new.data is distinct from old.data
    and not coalesce(jsonb_typeof(new.data->'version') = 'number' and (new.data->'version') >= '2'::jsonb, false) then
    raise exception 'Update ToothOps to save this consultation.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function consultation_private.prevent_consultation_snapshot_downgrade() from public, anon, authenticated;

create trigger prevent_consultation_snapshot_downgrade
  before update of data on public.charts
  for each row execute function consultation_private.prevent_consultation_snapshot_downgrade();

-- Older template managers read the current revision but omit new settings on save.
create or replace function consultation_private.prevent_consultation_library_downgrade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.config->'version' = '2'::jsonb and new.config is distinct from old.config
    and new.config->'version' is distinct from '2'::jsonb then
    raise exception 'Update ToothOps to save consultation templates.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function consultation_private.prevent_consultation_library_downgrade() from public, anon, authenticated;

create trigger prevent_consultation_library_downgrade
  before update of config on public.consultation_template_libraries
  for each row execute function consultation_private.prevent_consultation_library_downgrade();
