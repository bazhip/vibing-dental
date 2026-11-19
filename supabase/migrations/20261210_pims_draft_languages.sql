begin;

-- Match every app language while retaining existing clinical drafts unchanged.
alter table public.pims_drafts drop constraint pims_drafts_language_check;
alter table public.pims_drafts add constraint pims_drafts_language_check
  check (language in ('en','fr','de','it','es','hu','ro','zh','ar'));

-- Patch only the installed save-language guard. Preserve independently deployed
-- source, authorization, version, review and replay checks, SECURITY DEFINER,
-- search_path and function grants. Abort rather than overwrite an unknown guard.
do $migration$
declare
  definition text := pg_get_functiondef('public.pims_draft_write(jsonb)'::regprocedure);
  old_part text := $old$language_value not in ('en','fr','de','it','es')$old$;
  new_part text := $new$language_value not in ('en','fr','de','it','es','hu','ro','zh','ar')$new$;
begin
  if strpos(definition, new_part) > 0 then
    return; -- Already patched; safe to reapply.
  end if;
  if strpos(definition, old_part) = 0 then
    raise exception 'PIMS draft language guard differs from the expected definition; review before applying';
  end if;
  execute replace(definition, old_part, new_part);
end
$migration$;

commit;
