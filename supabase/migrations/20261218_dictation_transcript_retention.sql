-- Transcript text is available to database operators only. The app can
-- submit a sample but cannot retrieve samples, including its own.
create schema if not exists transcript_analysis;
revoke all on schema transcript_analysis from public, anon, authenticated, service_role;

create table if not exists transcript_analysis.dictation_transcripts (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  source text not null check (source in ('dental', 'clinical')),
  language text not null check (language ~ '^[a-z]{2}$'),
  transcript text not null check (char_length(transcript) between 1 and 120000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '720 hours'),
  primary key (user_id, session_id)
);

alter table transcript_analysis.dictation_transcripts enable row level security;
revoke all on table transcript_analysis.dictation_transcripts from public, anon, authenticated, service_role;
create index if not exists dictation_transcripts_expires_at_idx
  on transcript_analysis.dictation_transcripts (expires_at);
create index if not exists dictation_transcripts_user_created_at_idx
  on transcript_analysis.dictation_transcripts (user_id, created_at);

create or replace function public.retain_dictation_transcript(
  p_session_id uuid,
  p_user_id uuid,
  p_source text,
  p_language text,
  p_transcript text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_transcript text := left(btrim(p_transcript, E' \t\r\n'), 120000);
begin
  if v_user_id is null or v_user_id is distinct from p_user_id or auth.jwt()->>'is_anonymous' = 'true' then
    raise insufficient_privilege;
  end if;
  if v_transcript is null or v_transcript = '' then
    return;
  end if;

  -- Serialize a user's writes so parallel submissions respect the same
  -- daily limit. A resumed dictation can update an existing row at the limit.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 20261215));
  if not exists (
    select 1 from transcript_analysis.dictation_transcripts
    where user_id = v_user_id and session_id = p_session_id
  ) and (
    select count(*) from transcript_analysis.dictation_transcripts
    where user_id = v_user_id and created_at > now() - interval '24 hours'
  ) >= 500 then
    return;
  end if;

  insert into transcript_analysis.dictation_transcripts as saved
    (user_id, session_id, source, language, transcript)
  values (v_user_id, p_session_id, p_source, p_language, v_transcript)
  on conflict (user_id, session_id) do update
    set transcript = excluded.transcript
    where saved.expires_at > now()
      and saved.source = excluded.source
      and saved.language = excluded.language
      and char_length(saved.transcript) < char_length(excluded.transcript);
end;
$$;

revoke all on function public.retain_dictation_transcript(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.retain_dictation_transcript(uuid, uuid, text, text, text)
  to authenticated;

-- Supabase Cron (pg_cron) is already enabled for this project.
select cron.schedule(
  'purge-dictation-transcripts',
  '* * * * *',
  $job$delete from transcript_analysis.dictation_transcripts where expires_at <= now()$job$
);
