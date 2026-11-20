-- Keep the extension to consultation and discharge libraries. Imaging uses its own validator.
create function consultation_private.valid_note_input(field jsonb, structured boolean)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  option_value jsonb;
  option_text text;
  seen_options text[] := '{}';
begin
  if not (field ? 'inputType') then
    return not (field ? 'options');
  end if;
  if not structured or jsonb_typeof(field->'inputType') is distinct from 'string'
    or field->>'id' in ('gpVitals', 'consultationCurrentMedications',
      'consultationAdministeredMedications', 'consultationMedicationPlan') then
    return false;
  end if;
  if field->>'inputType' = 'shortText' then
    return not (field ? 'options');
  end if;
  if field->>'inputType' not in ('radio', 'multiselect')
    or jsonb_typeof(field->'options') is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(field->'options') not between 1 and 20 then
    return false;
  end if;
  for option_value in select value from jsonb_array_elements(field->'options') loop
    if jsonb_typeof(option_value) is distinct from 'string' then
      return false;
    end if;
    option_text := option_value #>> '{}';
    if option_text = '' or option_text <> btrim(option_text, trim_characters)
      or char_length(option_text) > 100 or option_text ~ E'[\r\n]'
      or option_text = any(seen_options) then
      return false;
    end if;
    seen_options := array_append(seen_options, option_text);
  end loop;
  return true;
end;
$$;

create function consultation_private.valid_note_builder_sections(
  sections jsonb, discharge boolean, practice_fields boolean, structured boolean
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  standard_fields constant text[] := case when discharge
    then array['dischargeMedications', 'dischargeInstructions', 'dischargeFollowUp']
    else array['complaint', 'consultationHistory', 'consultationAssessment', 'consultationPlan',
      'gpVitals', 'gpPhysicalExam', 'gpDiagnostics',
      'consultationCurrentMedications', 'consultationAdministeredMedications', 'consultationMedicationPlan']
    end;
  custom_starters constant text[] := case when discharge then array['dischargeCustom_recovery-activity']
    else array['consultationCustom_awake-oral-exam', 'consultationCustom_preanesthetic',
      'consultationCustom_client-discussion', 'consultationCustom_home-care', 'consultationCustom_follow-up']
    end;
  id_pattern constant text := case when discharge
    then '^dischargeCustom_[a-z0-9-]{1,50}$'
    else '^consultationCustom_[a-z0-9-]{1,50}$'
    end;
  allowed_keys constant text[] := array['id', 'label', 'guidance', 'example', 'suggestedText', 'inputType', 'options']
    || case when practice_fields then array['archived']
      when discharge then array['format', 'level', 'ownerReport']
      else array['format', 'level'] end;
  section jsonb;
  section_id text;
  custom boolean;
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
    custom := section_id ~ id_pattern;
    if section_id = any(seen_ids)
      or (practice_fields and (not custom or section_id = any(custom_starters)))
      or (not custom and not (section_id = any(standard_fields)))
      or ((practice_fields or (custom and not (section_id = any(custom_starters)))) and not (section ? 'label'))
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
      or (section ? 'ownerReport' and (not custom or jsonb_typeof(section->'ownerReport') <> 'boolean'))
      or (section ? 'archived' and jsonb_typeof(section->'archived') <> 'boolean')
      or not consultation_private.valid_note_input(section, structured) then
      return false;
    end if;
    seen_ids := array_append(seen_ids, section_id);
  end loop;
  return true;
end;
$$;

create function consultation_private.valid_note_builder_library(config jsonb, discharge boolean)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  expected_fields constant jsonb := case when discharge then '[]'::jsonb
    else '["complaint","consultationHistory","consultationAssessment","consultationPlan","gpVitals","gpPhysicalExam","gpDiagnostics"]'::jsonb
    end;
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  starter_ids constant text[] := case when discharge then array['discharge-v1', 'dental-recovery-v1']
    else array['dental-v1', 'dental-v2', 'soap-v1', 'recheck-v1'] end;
  structured constant boolean := config->'version' is not distinct from '3'::jsonb;
  custom_count integer := 0;
  default_id text;
  has_default boolean;
  template jsonb;
  template_id text;
  seen_ids text[] := '{}';
  order_id jsonb;
  ordered_ids text[] := '{}';
begin
  if jsonb_typeof(config) <> 'object' or octet_length(config::text) > 196608 then
    return false;
  end if;
  if config - array['defaultId', 'templates', 'order', 'version', 'practiceFields'] <> '{}'::jsonb
    or ((discharge or config ? 'version') and not structured and config->'version' is distinct from '2'::jsonb)
    or jsonb_typeof(config->'defaultId') is distinct from 'string'
    or jsonb_typeof(config->'templates') is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(config->'templates') > 24 + cardinality(starter_ids) then
    return false;
  end if;
  if config ? 'practiceFields' and (not (config ? 'version')
    or not consultation_private.valid_note_builder_sections(config->'practiceFields', discharge, true, structured)) then
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
    if template_id = any(starter_ids) then
      if not (discharge or structured) then return false; end if;
    else
      custom_count := custom_count + 1;
      if custom_count > 24 or template_id !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
        return false;
      end if;
    end if;
    if template_id = any(seen_ids)
      or char_length(template->>'name') > 100
      or btrim(template->>'name', trim_characters) = ''
      or jsonb_array_length(template->'fields') <> jsonb_array_length(expected_fields)
      or not ((template->'fields') @> expected_fields)
      or ((discharge or template_id = 'dental-v2') and not (template ? 'sections'))
      or (template ? 'sections' and not consultation_private.valid_note_builder_sections(template->'sections', discharge, false, structured))
      or (template ? 'instructions' and (jsonb_typeof(template->'instructions') <> 'string'
        or char_length(template->>'instructions') > 2000))
      or (template ? 'detail' and (jsonb_typeof(template->'detail') <> 'string'
        or template->>'detail' not in ('concise', 'detailed'))) then
      return false;
    end if;
    seen_ids := array_append(seen_ids, template_id);
    if template_id = default_id then
      has_default := template->'archived' is distinct from 'true'::jsonb;
    end if;
  end loop;

  if config ? 'order' then
    if jsonb_typeof(config->'order') <> 'array' then
      return false;
    end if;
    if jsonb_array_length(config->'order') > 24 + cardinality(starter_ids) then
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

create or replace function consultation_private.valid_template_library(config jsonb)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select consultation_private.valid_note_builder_library(config, false)
$$;

create or replace function consultation_private.valid_discharge_template_library(config jsonb)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select consultation_private.valid_note_builder_library(config, true)
$$;

revoke all on function consultation_private.valid_note_input(jsonb, boolean) from public, anon, authenticated;
revoke all on function consultation_private.valid_note_builder_sections(jsonb, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function consultation_private.valid_note_builder_library(jsonb, boolean) from public, anon, authenticated;
grant execute on function consultation_private.valid_note_input(jsonb, boolean) to authenticated, service_role;
grant execute on function consultation_private.valid_note_builder_sections(jsonb, boolean, boolean, boolean) to authenticated, service_role;
grant execute on function consultation_private.valid_note_builder_library(jsonb, boolean) to authenticated, service_role;

-- Existing version-2 editors omit input configuration or collapse built-in overrides.
create function consultation_private.prevent_note_builder_library_downgrade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.config->'version' = '3'::jsonb and new.config is distinct from old.config
    and new.config->'version' is distinct from '3'::jsonb then
    raise exception 'Update ToothOps to save note templates.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function consultation_private.prevent_note_builder_library_downgrade() from public, anon, authenticated;

create trigger prevent_note_builder_library_downgrade
  before update of config on public.consultation_template_libraries
  for each row execute function consultation_private.prevent_note_builder_library_downgrade();

create trigger prevent_note_builder_library_downgrade
  before update of config on public.discharge_template_libraries
  for each row execute function consultation_private.prevent_note_builder_library_downgrade();

-- Older visit serializers omit the saved field configuration.
create or replace function consultation_private.prevent_consultation_snapshot_downgrade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.data #>> '{patientInfo,visitType}' = 'consultation'
    and jsonb_typeof(old.data->'version') = 'number'
    and old.data->'version' >= '2'::jsonb
    and new.data is distinct from old.data
    and not coalesce(jsonb_typeof(new.data->'version') = 'number'
      and new.data->'version' >= least(old.data->'version', '3'::jsonb), false) then
    raise exception 'Update ToothOps to save this consultation.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function consultation_private.prevent_discharge_snapshot_downgrade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.data->'patientInfo') ? 'dischargeLayout'
    and jsonb_typeof(old.data->'version') = 'number'
    and old.data->'version' >= '3'::jsonb
    and new.data is distinct from old.data
    and not coalesce(jsonb_typeof(new.data->'version') = 'number'
      and new.data->'version' >= least(old.data->'version', '4'::jsonb), false) then
    raise exception 'Update ToothOps to save this discharge.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
