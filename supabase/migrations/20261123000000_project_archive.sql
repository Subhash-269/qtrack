-- Archive a project: hidden from the sidebar, Today and the assistant's defaults, but kept with all
-- its data and history. Null = active. Uses the existing projects RLS (users update their own).
alter table public.projects add column if not exists archived_at timestamptz;
