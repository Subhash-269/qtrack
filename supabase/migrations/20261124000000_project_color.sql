-- A color per project, shown as a dot in the sidebar switcher and the collapsed rail.
-- Null = auto-assigned from the project id (see src/components/projectColors.js).
alter table public.projects add column if not exists color text;
