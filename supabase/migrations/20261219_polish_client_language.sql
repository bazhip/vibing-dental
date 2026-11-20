begin;

alter table public.practices drop constraint practices_client_language_check;
alter table public.practices add constraint practices_client_language_check
  check (client_language is null or client_language in ('en','fr','de','it','es','pt','hu','ro','zh','ar','pl'));

-- Retain the installed reminder logic and add only its Polish fallback text.
do $migration$
declare
  definition text := pg_get_functiondef('public.send_due_reminders()'::regprocedure);
  originals text[] := array[
    $text$when 'ar' then 'حان موعد إعادة فحص أسنان {{patient}}'$text$,
    $text$when 'ar' then 'مرحبًا {{owner}}، حان موعد إعادة فحص أسنان {{patient}}.'$text$,
    $text$when 'ar' then 'عيادتكم البيطرية'$text$
  ];
  polish text[] := array[
    $text$when 'pl' then 'Kontrola uzębienia — {{patient}}'$text$,
    $text$when 'pl' then '{{owner}}, przypominamy o zalecanej kontroli uzębienia. Pacjent: {{patient}}. Prosimy o telefon w celu umówienia wizyty.'$text$,
    $text$when 'pl' then 'Państwa placówka weterynaryjna'$text$
  ];
  i integer;
begin
  for i in 1..array_length(originals, 1) loop
    if strpos(definition, polish[i]) > 0 then
      continue;
    end if;
    if strpos(definition, originals[i]) = 0 then
      raise exception 'Reminder fallback % differs from the expected definition', i;
    end if;
    definition := replace(definition, originals[i], originals[i] || E'\n             ' || polish[i]);
  end loop;
  execute definition;
end
$migration$;

commit;
