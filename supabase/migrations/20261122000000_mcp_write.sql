-- P2: MCP write tools. Adds the per-user "let assistants make changes" switch, undo data on the
-- audit log, the timer columns the server needs, and a `source` tag on rows an assistant creates.

-- 1. Per-user switch. Off until the user turns it on in Settings > Assistant access.
create table if not exists public.mcp_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  allow_writes boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.mcp_settings enable row level security;

create policy "Users read their own MCP settings"
  on public.mcp_settings for select to authenticated
  using ((select auth.uid()) = user_id);

-- Only a first-party session (the QTrack app) may change the switch. Tokens issued to an
-- OAuth client carry a client_id claim, so an assistant can't turn its own writes on.
create policy "Only the app changes MCP settings"
  on public.mcp_settings for insert to authenticated
  with check ((select auth.uid()) = user_id and (auth.jwt() ->> 'client_id') is null);

create policy "Only the app updates MCP settings"
  on public.mcp_settings for update to authenticated
  using ((select auth.uid()) = user_id and (auth.jwt() ->> 'client_id') is null)
  with check ((select auth.uid()) = user_id and (auth.jwt() ->> 'client_id') is null);

-- 2. Undo data on the audit log. Users may set undone_at on their own rows and nothing else.
alter table public.mcp_calls add column if not exists undo jsonb;
alter table public.mcp_calls add column if not exists undone_at timestamptz;

create index if not exists mcp_calls_user_scope_created_idx on public.mcp_calls (user_id, scope, created_at desc);

revoke update on public.mcp_calls from authenticated;
grant update (undone_at) on public.mcp_calls to authenticated;

create policy "Users mark their own MCP calls undone"
  on public.mcp_calls for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 3. Timer: which project the task belongs to, and why it's paused, so every device shows the same thing.
alter table public.timer_state add column if not exists project_id uuid references public.projects (id) on delete set null;
alter table public.timer_state add column if not exists pause_reason text;
alter table public.timer_state add column if not exists paused_at timestamptz;

-- 4. Mark rows an assistant created ("via assistant" in the UI).
alter table public.issues add column if not exists source text;
alter table public.notes add column if not exists source text;
alter table public.focus_sessions add column if not exists source text;
