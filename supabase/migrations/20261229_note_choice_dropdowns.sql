-- Allow compact choice controls while preserving the existing validation and grants.
create or replace function consultation_private.valid_note_input(field jsonb, structured boolean)
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
  if field->>'inputType' not in ('radio', 'multiselect', 'dropdown', 'multiselectDropdown')
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

-- Older site and app builds drop unknown input types when normalizing saved
-- note layouts. Current builds can remove a dropdown by writing version 6.
create function consultation_private.prevent_note_dropdown_snapshot_downgrade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.data is distinct from old.data
    and not coalesce(jsonb_typeof(new.data->'version') = 'number' and new.data->'version' >= '6'::jsonb, false)
    and jsonb_path_exists(
      coalesce(old.data#>'{patientInfo,consultationLayout,sections}', '[]'::jsonb)
      || coalesce(old.data#>'{patientInfo,dischargeLayout,sections}', '[]'::jsonb)
      || coalesce(old.data#>'{patientInfo,consultationRetainedSections}', '[]'::jsonb)
      || coalesce(old.data#>'{patientInfo,dischargeRetainedSections}', '[]'::jsonb),
      '$[*] ? (@.inputType == "dropdown" || @.inputType == "multiselectDropdown")'
    ) then
    raise exception 'Update ToothOps to save this note.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function consultation_private.prevent_note_dropdown_snapshot_downgrade() from public, anon, authenticated;

create trigger prevent_note_dropdown_snapshot_downgrade
  before update of data on public.charts
  for each row execute function consultation_private.prevent_note_dropdown_snapshot_downgrade();
