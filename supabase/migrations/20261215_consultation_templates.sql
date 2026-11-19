create schema if not exists consultation_private;
revoke all on schema consultation_private from public, anon, authenticated;
grant usage on schema consultation_private to authenticated, service_role;

-- Consult templates follow the same co-owner rule as team-api.
create or replace function consultation_private.is_template_owner(target_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.practice_members as membership
    where membership.practice_id = target_practice_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'owner'
  )
$$;

-- The editor changes the order of a fixed set of fields. Reject malformed
-- layouts and unrelated data before a practice-wide config becomes unreadable.
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
begin
  if jsonb_typeof(config) <> 'object' or octet_length(config::text) > 16384 then
    return false;
  end if;
  if config - array['defaultId', 'templates'] <> '{}'::jsonb
    or jsonb_typeof(config->'defaultId') is distinct from 'string'
    or jsonb_typeof(config->'templates') is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(config->'templates') > 24 then
    return false;
  end if;

  default_id := config->>'defaultId';
  has_default := default_id in ('dental-v1', 'soap-v1', 'recheck-v1');

  for template in select value from jsonb_array_elements(config->'templates') loop
    if jsonb_typeof(template) <> 'object' then
      return false;
    end if;
    if template - array['id', 'name', 'fields', 'archived'] <> '{}'::jsonb
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

    seen_ids := array_append(seen_ids, template_id);
    has_default := has_default or (template_id = default_id and template->'archived' is distinct from 'true'::jsonb);
  end loop;

  return has_default;
end;
$$;

revoke all on function consultation_private.is_template_owner(uuid) from public, anon, authenticated;
revoke all on function consultation_private.valid_template_library(jsonb) from public, anon, authenticated;
grant execute on function consultation_private.is_template_owner(uuid) to authenticated;
grant execute on function consultation_private.valid_template_library(jsonb) to authenticated, service_role;

-- Each visit pins its chosen layout independently of the current library.
create table public.consultation_template_libraries (
  practice_id uuid primary key references public.practices(id) on delete cascade,
  revision uuid not null,
  config jsonb not null check (consultation_private.valid_template_library(config))
);

alter table public.consultation_template_libraries enable row level security;
revoke all on public.consultation_template_libraries from public, anon, authenticated;
grant select, insert, update (revision, config) on public.consultation_template_libraries to authenticated;
grant all on public.consultation_template_libraries to service_role;

create policy consultation_templates_read on public.consultation_template_libraries
  for select to authenticated using (public.is_member_of(practice_id));
create policy consultation_templates_insert on public.consultation_template_libraries
  for insert to authenticated with check (consultation_private.is_template_owner(practice_id));
create policy consultation_templates_update on public.consultation_template_libraries
  for update to authenticated
  using (consultation_private.is_template_owner(practice_id))
  with check (consultation_private.is_template_owner(practice_id));
