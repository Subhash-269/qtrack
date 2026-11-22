-- Per-account settings the user can change themselves (user_profiles is read-only to users,
-- since it holds the plan tier). First setting: the daily focus goal, in pomodoros.
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  daily_goal_pomodoros integer not null default 8 check (daily_goal_pomodoros between 1 and 40),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Users read own settings" on public.user_settings;
create policy "Users read own settings" on public.user_settings for select using (auth.uid() = user_id);
drop policy if exists "Users insert own settings" on public.user_settings;
create policy "Users insert own settings" on public.user_settings for insert with check (auth.uid() = user_id);
drop policy if exists "Users update own settings" on public.user_settings;
create policy "Users update own settings" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
