-- Original names are attachment metadata and inherit the existing row policies.
alter table public.attachments add column if not exists file_name text;
