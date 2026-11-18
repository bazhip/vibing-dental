-- Allow Chinese and Arabic without changing existing practice data.
alter table public.practices drop constraint if exists practices_client_language_check;
alter table public.practices add constraint practices_client_language_check
  check (client_language is null or client_language in ('en','fr','de','it','es','pt','hu','ro','zh','ar'));

-- Patch only language fallbacks in the installed reminder function. Production
-- can have independently deployed patient-matching or delivery changes; retain
-- its complete definition, SECURITY DEFINER, search_path, and existing grants.
-- Abort if its expected fallback text has changed, rather than overwrite it.
do $migration$
declare
  definition text := pg_get_functiondef('public.send_due_reminders'::regproc);
  old_parts text[] := array[
    $old$when 'ro' then 'Este timpul pentru controlul dentar al pacientului {{patient}}'$old$,
    $old$when 'ro' then 'Bună ziua, {{owner}}, este timpul pentru controlul dentar al pacientului {{patient}}.'$old$,
    $old$when 'ro' then 'Cabinetul dumneavoastră veterinar'$old$
  ];
  new_parts text[] := array[
    $new$when 'ro' then 'Este timpul pentru controlul dentar al pacientului {{patient}}'
             when 'zh' then '{{patient}} 的牙科复查提醒'
             when 'ar' then 'حان موعد إعادة فحص أسنان {{patient}}'$new$,
    $new$when 'ro' then 'Bună ziua, {{owner}}, este timpul pentru controlul dentar al pacientului {{patient}}.'
             when 'zh' then '{{owner}}，您好，{{patient}} 已到牙科复查时间。'
             when 'ar' then 'مرحبًا {{owner}}، حان موعد إعادة فحص أسنان {{patient}}.'$new$,
    $new$when 'ro' then 'Cabinetul dumneavoastră veterinar'
             when 'zh' then '您的兽医诊所'
             when 'ar' then 'عيادتكم البيطرية'$new$
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
