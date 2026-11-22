-- Reusable definitions and page layouts are practice settings. Page placements
-- are independent snapshots so deleting or editing a library item keeps them intact.
create function consultation_private.valid_practice_chart_field_list(fields jsonb, field_limit integer)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  -- ECMAScript WhiteSpace and LineTerminator characters used by String.trim().
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  field_def jsonb;
  field_id text;
  seen_ids text[] := '{}';
begin
  if jsonb_typeof(fields) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(fields) > field_limit then
    return false;
  end if;

  for field_def in select value from jsonb_array_elements(fields) loop
    if jsonb_typeof(field_def) <> 'object' then
      return false;
    end if;
    if field_def - array['id', 'label', 'guidance', 'inputType', 'options'] <> '{}'::jsonb
      or jsonb_typeof(field_def->'id') is distinct from 'string'
      or jsonb_typeof(field_def->'label') is distinct from 'string' then
      return false;
    end if;

    field_id := field_def->>'id';
    if field_id !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
      or field_id = any(seen_ids)
      or char_length(field_def->>'label') > 100
      or btrim(field_def->>'label', trim_characters) = ''
      or (field_def ? 'guidance' and (jsonb_typeof(field_def->'guidance') <> 'string'
        or char_length(field_def->>'guidance') > 1000))
      or not consultation_private.valid_note_input(field_def, true) then
      return false;
    end if;

    seen_ids := array_append(seen_ids, field_id);
  end loop;

  return true;
end;
$$;

create function consultation_private.valid_practice_chart_fields(config jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  placements jsonb;
begin
  if jsonb_typeof(config) <> 'object' or octet_length(config::text) > 196608 then
    return false;
  end if;
  if config - array['fields', 'pages'] <> '{}'::jsonb
    or jsonb_typeof(config->'fields') is distinct from 'array'
    or jsonb_typeof(config->'pages') is distinct from 'object' then
    return false;
  end if;
  if (config->'pages') - array['patient', 'exam', 'anesthesia', 'images'] <> '{}'::jsonb then
    return false;
  end if;

  if not consultation_private.valid_practice_chart_field_list(config->'fields', 128) then
    return false;
  end if;
  for placements in select value from jsonb_each(config->'pages') loop
    if not consultation_private.valid_practice_chart_field_list(placements, 24) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function consultation_private.valid_practice_chart_field_list(jsonb, integer) from public, anon, authenticated;
revoke all on function consultation_private.valid_practice_chart_fields(jsonb) from public, anon, authenticated;
grant execute on function consultation_private.valid_practice_chart_field_list(jsonb, integer) to authenticated, service_role;
grant execute on function consultation_private.valid_practice_chart_fields(jsonb) to authenticated, service_role;

create table public.practice_chart_field_libraries (
  practice_id uuid primary key references public.practices(id) on delete cascade,
  revision uuid not null,
  config jsonb not null check (consultation_private.valid_practice_chart_fields(config))
);

alter table public.practice_chart_field_libraries enable row level security;
revoke all on public.practice_chart_field_libraries from public, anon, authenticated;
grant select, insert, update (revision, config) on public.practice_chart_field_libraries to authenticated;
grant all on public.practice_chart_field_libraries to service_role;

create policy practice_chart_fields_read on public.practice_chart_field_libraries
  for select to authenticated using (public.is_member_of(practice_id));
create policy practice_chart_fields_insert on public.practice_chart_field_libraries
  for insert to authenticated with check (consultation_private.is_template_owner(practice_id));
create policy practice_chart_fields_update on public.practice_chart_field_libraries
  for update to authenticated
  using (consultation_private.is_template_owner(practice_id))
  with check (consultation_private.is_template_owner(practice_id));
