create function consultation_private.valid_exam_layout(fields jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  defaults constant text[] := array['extraoral', 'lymph', 'buccal', 'tongue', 'palate', 'pharynx', 'gpDiagnostics'];
  field jsonb;
  field_id text;
  expected_kind text;
  seen_ids text[] := '{}';
begin
  if jsonb_typeof(fields) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(fields) > 24 then
    return false;
  end if;

  for field in select value from jsonb_array_elements(fields) loop
    if jsonb_typeof(field) <> 'object' then
      return false;
    end if;
    if field - array['id', 'kind', 'label'] <> '{}'::jsonb
      or jsonb_typeof(field->'id') is distinct from 'string'
      or jsonb_typeof(field->'kind') is distinct from 'string' then
      return false;
    end if;
    field_id := field->>'id';
    expected_kind := case when field_id = 'gpDiagnostics' or field_id like 'exam-text-%' then 'text' else 'area' end;
    if field_id !~ '^[A-Za-z0-9_-]{1,40}$' or field_id = any(seen_ids)
      or field->>'kind' <> expected_kind
      or (field ? 'label' and (jsonb_typeof(field->'label') <> 'string' or char_length(field->>'label') > 60))
      or (not (field_id = any(defaults)) and (not (field ? 'label') or btrim(field->>'label', trim_characters) = '')) then
      return false;
    end if;
    seen_ids := array_append(seen_ids, field_id);
  end loop;
  return true;
end;
$$;

revoke all on function consultation_private.valid_exam_layout(jsonb) from public, anon, authenticated;
grant execute on function consultation_private.valid_exam_layout(jsonb) to authenticated, service_role;

create table public.exam_layouts (
  practice_id uuid primary key references public.practices(id) on delete cascade,
  revision uuid not null,
  fields jsonb not null check (consultation_private.valid_exam_layout(fields))
);

alter table public.exam_layouts enable row level security;
revoke all on public.exam_layouts from public, anon, authenticated;
grant select, insert, update (revision, fields) on public.exam_layouts to authenticated;
grant all on public.exam_layouts to service_role;

create policy exam_layouts_read on public.exam_layouts
  for select to authenticated using (public.is_member_of(practice_id));
create policy exam_layouts_insert on public.exam_layouts
  for insert to authenticated with check (consultation_private.is_template_owner(practice_id));
create policy exam_layouts_update on public.exam_layouts
  for update to authenticated
  using (consultation_private.is_template_owner(practice_id))
  with check (consultation_private.is_template_owner(practice_id));
