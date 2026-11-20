-- Keep field metadata reusable across templates while leaving layout validation intact.
create function consultation_private.valid_practice_note_fields(fields jsonb, discharge boolean)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  -- ECMAScript WhiteSpace and LineTerminator characters used by String.trim().
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  dental_fields constant text[] := array[
    'consultationCustom_awake-oral-exam', 'consultationCustom_preanesthetic',
    'consultationCustom_client-discussion', 'consultationCustom_home-care', 'consultationCustom_follow-up'
  ];
  id_pattern constant text := case when discharge then '^dischargeCustom_[a-z0-9-]{1,50}$'
    else '^consultationCustom_[a-z0-9-]{1,50}$' end;
  field_def jsonb;
  field_id text;
  seen_ids text[] := '{}';
begin
  if jsonb_typeof(fields) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(fields) > 128 then
    return false;
  end if;

  for field_def in select value from jsonb_array_elements(fields) loop
    if jsonb_typeof(field_def) <> 'object' then
      return false;
    end if;
    if field_def - array['id', 'label', 'guidance', 'example', 'suggestedText', 'archived'] <> '{}'::jsonb
      or jsonb_typeof(field_def->'id') is distinct from 'string'
      or jsonb_typeof(field_def->'label') is distinct from 'string' then
      return false;
    end if;

    field_id := field_def->>'id';
    if field_id !~ id_pattern or field_id = any(seen_ids)
      or (not discharge and field_id = any(dental_fields))
      or char_length(field_def->>'label') > 100
      or btrim(field_def->>'label', trim_characters) = ''
      or (field_def ? 'guidance' and (jsonb_typeof(field_def->'guidance') <> 'string'
        or char_length(field_def->>'guidance') > 1000))
      or (field_def ? 'example' and (jsonb_typeof(field_def->'example') <> 'string'
        or char_length(field_def->>'example') > 1000))
      or (field_def ? 'suggestedText' and (jsonb_typeof(field_def->'suggestedText') <> 'string'
        or char_length(field_def->>'suggestedText') > 1000))
      or (field_def ? 'archived' and jsonb_typeof(field_def->'archived') <> 'boolean') then
      return false;
    end if;
    seen_ids := array_append(seen_ids, field_id);
  end loop;

  return true;
end;
$$;

-- Check constraints bind to function OIDs. Recreate them to use the new wrappers.
alter function consultation_private.valid_template_library(jsonb)
  rename to valid_template_library_without_practice_fields;
alter function consultation_private.valid_discharge_template_library(jsonb)
  rename to valid_discharge_template_library_without_practice_fields;

create function consultation_private.valid_template_library(config jsonb)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case when jsonb_typeof(config) = 'object' and config ? 'practiceFields' then
    config->'version' is not distinct from '2'::jsonb
    and octet_length(config::text) <= 196608
    and consultation_private.valid_practice_note_fields(config->'practiceFields', false)
    and consultation_private.valid_template_library_without_practice_fields(config - 'practiceFields')
  else consultation_private.valid_template_library_without_practice_fields(config) end
$$;

create function consultation_private.valid_discharge_template_library(config jsonb)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case when jsonb_typeof(config) = 'object' and config ? 'practiceFields' then
    octet_length(config::text) <= 196608
    and consultation_private.valid_practice_note_fields(config->'practiceFields', true)
    and consultation_private.valid_discharge_template_library_without_practice_fields(config - 'practiceFields')
  else consultation_private.valid_discharge_template_library_without_practice_fields(config) end
$$;

revoke all on function consultation_private.valid_practice_note_fields(jsonb, boolean) from public, anon, authenticated;
revoke all on function consultation_private.valid_template_library(jsonb) from public, anon, authenticated;
revoke all on function consultation_private.valid_discharge_template_library(jsonb) from public, anon, authenticated;
grant execute on function consultation_private.valid_practice_note_fields(jsonb, boolean) to authenticated, service_role;
grant execute on function consultation_private.valid_template_library(jsonb) to authenticated, service_role;
grant execute on function consultation_private.valid_discharge_template_library(jsonb) to authenticated, service_role;

alter table public.consultation_template_libraries
  drop constraint consultation_template_libraries_config_check,
  add constraint consultation_template_libraries_config_check
    check (consultation_private.valid_template_library(config));

alter table public.discharge_template_libraries
  drop constraint discharge_template_libraries_config_check,
  add constraint discharge_template_libraries_config_check
    check (consultation_private.valid_discharge_template_library(config));

-- A pre-field-library editor can read the current revision but omits the list when saving.
create function consultation_private.prevent_practice_note_fields_downgrade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.config ? 'practiceFields' and not (new.config ? 'practiceFields') then
    raise exception 'Update ToothOps to save practice note fields.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function consultation_private.prevent_practice_note_fields_downgrade() from public, anon, authenticated;

create trigger prevent_practice_note_fields_downgrade
  before update of config on public.consultation_template_libraries
  for each row execute function consultation_private.prevent_practice_note_fields_downgrade();

create trigger prevent_practice_note_fields_downgrade
  before update of config on public.discharge_template_libraries
  for each row execute function consultation_private.prevent_practice_note_fields_downgrade();
