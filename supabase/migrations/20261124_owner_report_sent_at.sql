-- When the owner report was last emailed to the pet owner (send-owner-report
-- stamps it). Nullable, additive: safe to apply before or after the app and
-- function update (the function ignores a failed stamp).
alter table public.charts add column if not exists owner_report_sent_at timestamptz;
