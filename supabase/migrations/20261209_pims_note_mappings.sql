-- User-owned section -> editor label preferences, independent of profile encounter-send maps.
-- No clinical source, patient identity, browser token or prepared ticket belongs in this table.
begin;
create or replace function public.pims_note_mapping_valid(provider text, origin text, template_id text, mapping jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare entry record; domain text;
begin
  domain := case provider when 'pulse' then 'evetpractice\.com' when 'rhapsody' then 'rhapsody\.vet' when 'vetspire' then 'vetspire\.com' end;
  if domain is null or origin is null or length(origin)>253
    or origin !~ ('^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*' || domain || '$')
    or template_id is null or template_id !~ '^[a-z][a-zA-Z0-9_-]{0,79}$'
    or mapping is null or jsonb_typeof(mapping)<>'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(mapping))>64 then return false; end if;
  for entry in select key,value from jsonb_each(mapping) loop
    if entry.key !~ '^[a-z][a-zA-Z0-9_-]{0,79}$' then return false; end if;
    if entry.value <> 'null'::jsonb and (jsonb_typeof(entry.value)<>'string' or length(entry.value#>>'{}')>500
      or length(btrim(entry.value#>>'{}'))=0 or (entry.value#>>'{}') ~ '[[:cntrl:]]') then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.pims_note_mapping_valid(text,text,text,jsonb) from public, anon, authenticated;
create table if not exists public.pims_note_mappings (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null, origin text not null, template_id text not null,
  mapping jsonb not null default '{}'::jsonb,
  version integer not null check(version>0 and version<2147483647),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(user_id,provider,origin,template_id),
  constraint pims_note_mapping_valid check(public.pims_note_mapping_valid(provider,origin,template_id,mapping))
);
alter table public.pims_note_mappings enable row level security;
drop policy if exists pims_note_mappings_owned on public.pims_note_mappings;
create policy pims_note_mappings_owned on public.pims_note_mappings for select to authenticated using(user_id=auth.uid());
revoke all on public.pims_note_mappings from public, anon, authenticated;
grant select on public.pims_note_mappings to authenticated;
create or replace function public.pims_note_mapping_get(payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'pims_forbidden'; end if;
  if payload is null or jsonb_typeof(payload)<>'object' or (select count(*) from jsonb_object_keys(payload))<>3
    or not(payload ?& array['provider','origin','template_id'])
    or jsonb_typeof(payload->'provider')<>'string' or jsonb_typeof(payload->'origin')<>'string' or jsonb_typeof(payload->'template_id')<>'string'
    or not public.pims_note_mapping_valid(payload->>'provider',payload->>'origin',payload->>'template_id','{}') then raise exception 'pims_invalid'; end if;
  select jsonb_build_object('provider',provider,'origin',origin,'template_id',template_id,'mapping',mapping,'version',version)
    into result from public.pims_note_mappings where user_id=auth.uid() and provider=payload->>'provider' and origin=payload->>'origin' and template_id=payload->>'template_id';
  return coalesce(result,payload || jsonb_build_object('version',0,'mapping','{}'::jsonb));
end $$;
create or replace function public.pims_note_mapping_save(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare expected bigint; saved public.pims_note_mappings;
begin
  if auth.uid() is null then raise exception 'pims_forbidden'; end if;
  if payload is null or jsonb_typeof(payload)<>'object' or (select count(*) from jsonb_object_keys(payload))<>5
    or not(payload ?& array['provider','origin','template_id','mapping','expected_version'])
    or jsonb_typeof(payload->'provider')<>'string' or jsonb_typeof(payload->'origin')<>'string' or jsonb_typeof(payload->'template_id')<>'string'
    or not public.pims_note_mapping_valid(payload->>'provider',payload->>'origin',payload->>'template_id',payload->'mapping')
    or jsonb_typeof(payload->'expected_version')<>'number' or (payload->>'expected_version') !~ '^[0-9]{1,10}$' then raise exception 'pims_invalid'; end if;
  expected := (payload->>'expected_version')::bigint;
  if expected>=2147483646 then raise exception 'pims_invalid'; end if;
  insert into public.pims_note_mappings as target(user_id,provider,origin,template_id,mapping,version)
    values(auth.uid(),payload->>'provider',payload->>'origin',payload->>'template_id',payload->'mapping',1)
    on conflict(user_id,provider,origin,template_id) do update set mapping=excluded.mapping,version=target.version+1,updated_at=clock_timestamp()
      where target.version=expected
    returning * into saved;
  -- A new row can only be created against version zero. Roll back unexpected inserts as conflicts.
  if saved.user_id is null or (saved.version=1 and expected<>0) then raise exception 'pims_conflict'; end if;
  return jsonb_build_object('provider',saved.provider,'origin',saved.origin,'template_id',saved.template_id,'mapping',saved.mapping,'version',saved.version);
end $$;
revoke all on function public.pims_note_mapping_get(jsonb), public.pims_note_mapping_save(jsonb) from public, anon, authenticated;
grant execute on function public.pims_note_mapping_get(jsonb), public.pims_note_mapping_save(jsonb) to authenticated;
commit;
