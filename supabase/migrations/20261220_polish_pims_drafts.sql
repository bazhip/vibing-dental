begin;

alter table public.pims_drafts drop constraint pims_drafts_language_check;
alter table public.pims_drafts add constraint pims_drafts_language_check
  check (language in ('en','fr','de','it','es','hu','ro','zh','ar','pl'));

-- Extend the language guard without replacing the surrounding draft logic.
do $migration$
declare
  definition text := pg_get_functiondef('public.pims_draft_write(jsonb)'::regprocedure);
  old_guard text := $guard$language_value not in ('en','fr','de','it','es','hu','ro','zh','ar')$guard$;
  new_guard text := $guard$language_value not in ('en','fr','de','it','es','hu','ro','zh','ar','pl')$guard$;
begin
  if strpos(definition, new_guard) > 0 then
    return;
  end if;
  if strpos(definition, old_guard) = 0 then
    raise exception 'PIMS draft language guard differs from the expected definition';
  end if;
  execute replace(definition, old_guard, new_guard);
end
$migration$;

commit;
