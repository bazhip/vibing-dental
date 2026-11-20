-- The gallery is a layout element, not a text field or attachment record.
create function consultation_private.valid_note_image_library(config jsonb, discharge boolean)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  template jsonb;
  placement jsonb;
  position numeric;
  text_templates jsonb := '[]'::jsonb;
begin
  if config->'version' is distinct from '4'::jsonb then
    return consultation_private.valid_note_builder_library(config, discharge);
  end if;
  if octet_length(config::text) > 196608
    or jsonb_typeof(config->'templates') is distinct from 'array' then
    return false;
  end if;

  for template in select value from jsonb_array_elements(config->'templates') loop
    if jsonb_typeof(template) is distinct from 'object' then return false; end if;
    if template ? 'imagePlacement' then
      if jsonb_typeof(template->'sections') is distinct from 'array' then return false; end if;
      placement := template->'imagePlacement';
      if placement is distinct from 'false'::jsonb then
        if jsonb_typeof(placement) is distinct from 'object'
          or placement - array['index', 'label', 'guidance'] <> '{}'::jsonb
          or jsonb_typeof(placement->'index') is distinct from 'number'
          or (placement ? 'label' and (jsonb_typeof(placement->'label') is distinct from 'string'
            or btrim(placement->>'label', trim_characters) = '' or char_length(placement->>'label') > 100))
          or (placement ? 'guidance' and (jsonb_typeof(placement->'guidance') is distinct from 'string'
            or char_length(placement->>'guidance') > 1000)) then return false; end if;
        position := (placement->>'index')::numeric;
        if position <> trunc(position) or position not between 0 and jsonb_array_length(template->'sections') then
          return false;
        end if;
      end if;
    end if;
    text_templates := text_templates || jsonb_build_array(template - 'imagePlacement');
  end loop;

  return consultation_private.valid_note_builder_library(
    jsonb_set(jsonb_set(config, '{version}', '3'::jsonb), '{templates}', text_templates), discharge);
end;
$$;

revoke all on function consultation_private.valid_note_image_library(jsonb, boolean) from public, anon, authenticated;
grant execute on function consultation_private.valid_note_image_library(jsonb, boolean) to authenticated, service_role;

create or replace function consultation_private.valid_template_library(config jsonb)
returns boolean language sql immutable strict set search_path = ''
as $$ select consultation_private.valid_note_image_library(config, false) $$;

create or replace function consultation_private.valid_discharge_template_library(config jsonb)
returns boolean language sql immutable strict set search_path = ''
as $$ select consultation_private.valid_note_image_library(config, true) $$;

-- Version checks are monotonic so an existing library can upgrade in place.
create or replace function consultation_private.prevent_consultation_library_downgrade()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.config->'version' = '2'::jsonb and new.config is distinct from old.config
    and not coalesce(jsonb_typeof(new.config->'version') = 'number'
      and new.config->'version' >= '2'::jsonb, false) then
    raise exception 'Update ToothOps to save consultation templates.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function consultation_private.prevent_note_builder_library_downgrade()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if jsonb_typeof(old.config->'version') = 'number' and old.config->'version' >= '3'::jsonb
    and new.config is distinct from old.config
    and not coalesce(jsonb_typeof(new.config->'version') = 'number'
      and new.config->'version' >= old.config->'version', false) then
    raise exception 'Update ToothOps to save note templates.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function consultation_private.prevent_consultation_snapshot_downgrade()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.data #>> '{patientInfo,visitType}' = 'consultation'
    and jsonb_typeof(old.data->'version') = 'number' and old.data->'version' >= '2'::jsonb
    and new.data is distinct from old.data
    and not coalesce(jsonb_typeof(new.data->'version') = 'number'
      and new.data->'version' >= least(old.data->'version', '4'::jsonb), false) then
    raise exception 'Update ToothOps to save this consultation.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function consultation_private.prevent_discharge_snapshot_downgrade()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (old.data->'patientInfo') ? 'dischargeLayout'
    and jsonb_typeof(old.data->'version') = 'number' and old.data->'version' >= '3'::jsonb
    and new.data is distinct from old.data
    and not coalesce(jsonb_typeof(new.data->'version') = 'number'
      and new.data->'version' >= least(old.data->'version', '5'::jsonb), false) then
    raise exception 'Update ToothOps to save this discharge.' using errcode = '23514';
  end if;
  return new;
end;
$$;
