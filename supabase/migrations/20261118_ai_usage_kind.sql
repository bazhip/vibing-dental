-- Which kind of AI call each ai_usage row is, so cost can be split by
-- feature: 'live' (dictation chunk), 'review' (end-of-dictation final
-- check), 'owner_report' (Write with AI), 'warmup' (prompt-cache warm-up).
-- '' = rows logged before this column existed, or another use.
alter table public.ai_usage add column if not exists kind text not null default '';

-- Cache writes on their own (still also counted in input_tokens, which
-- the admin cost estimate uses), so the write/read split is exact.
alter table public.ai_usage add column if not exists cache_write_tokens integer not null default 0;
