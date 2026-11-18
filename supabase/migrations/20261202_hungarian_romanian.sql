-- Allow Hungarian and Romanian without changing existing practice data.
alter table public.practices drop constraint if exists practices_client_language_check;
alter table public.practices add constraint practices_client_language_check
  check (client_language is null or client_language in ('en','fr','de','it','es','pt','hu','ro'));

-- Patch only language fallbacks in the installed reminder function. Production
-- can have independently deployed patient-matching or delivery changes; retain
-- its complete definition, SECURITY DEFINER, search_path, and existing grants.
-- Abort if its expected fallback text has changed, rather than overwrite it.
do $migration$
declare
  definition text := pg_get_functiondef('public.send_due_reminders'::regproc);
  old_parts text[] := array[
    $old$coalesce(nullif(p.reminder_subject,''), 'Time for {{patient}}''s dental recheck')$old$,
    $old$coalesce(nullif(p.reminder_body,''), 'Hi {{owner}}, {{patient}} is due for a dental recheck.')$old$,
    $old$when 'pt' then 'Sua clínica veterinária'$old$
  ];
  new_parts text[] := array[
    $new$coalesce(nullif(p.reminder_subject,''), case p.client_language
             when 'hu' then '{{patient}} fogászati kontrollja esedékes'
             when 'ro' then 'Este timpul pentru controlul dentar al pacientului {{patient}}'
             else 'Time for {{patient}}''s dental recheck' end)$new$,
    $new$coalesce(nullif(p.reminder_body,''), case p.client_language
             when 'hu' then 'Kedves {{owner}}! {{patient}} fogászati kontrollja esedékes.'
             when 'ro' then 'Bună ziua, {{owner}}, este timpul pentru controlul dentar al pacientului {{patient}}.'
             else 'Hi {{owner}}, {{patient}} is due for a dental recheck.' end)$new$,
    $new$when 'pt' then 'Sua clínica veterinária'
             when 'hu' then 'Az Ön állatorvosi rendelője'
             when 'ro' then 'Cabinetul dumneavoastră veterinar'$new$
  ];
  i integer;
begin
  for i in 1..array_length(old_parts, 1) loop
    if strpos(definition, new_parts[i]) > 0 then
      continue; -- Already patched; safe to reapply.
    end if;
    if strpos(definition, old_parts[i]) = 0 then
      raise exception 'Reminder fallback % differs from the expected definition; review before applying', i;
    end if;
    definition := replace(definition, old_parts[i], new_parts[i]);
  end loop;
  execute definition;
end
$migration$;
