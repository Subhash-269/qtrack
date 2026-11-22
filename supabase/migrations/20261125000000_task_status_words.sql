-- Task statuses in task words instead of bug-tracker words:
--   open/reopened -> todo, review -> in_progress, fixed/verified -> done, wont_fix -> skipped
-- A trigger maps the old words on insert/update, so a browser still running the previous build keeps
-- working; the check constraint then only has to allow the new words.

create or replace function public.issues_normalize_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.status := case new.status
    when 'open' then 'todo' when 'reopened' then 'todo'
    when 'review' then 'in_progress'
    when 'fixed' then 'done' when 'verified' then 'done'
    when 'wont_fix' then 'skipped'
    else new.status end;
  return new;
end $$;

drop trigger if exists issues_normalize_status on public.issues;
create trigger issues_normalize_status before insert or update of status on public.issues
  for each row execute function public.issues_normalize_status();

update public.issues set status = status
  where status in ('open', 'reopened', 'review', 'fixed', 'verified', 'wont_fix');

alter table public.issues alter column status set default 'todo';
alter table public.issues drop constraint if exists issues_status_check;
alter table public.issues add constraint issues_status_check
  check (status in ('todo', 'in_progress', 'done', 'skipped'));
