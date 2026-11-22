-- Audit log of every MCP tool call: what the assistant asked for and what happened.
-- Shown in Settings > Assistant access (P2). Users can read their own rows; the MCP server
-- writes them with the user's own token, so inserts are limited to the caller's user_id.

create table if not exists public.mcp_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool text not null,
  args jsonb not null default '{}'::jsonb,
  ok boolean not null default true,
  result_summary text,
  client_id text,
  scope text not null default 'read' check (scope in ('read', 'write')),
  created_at timestamptz not null default now()
);

create index if not exists mcp_calls_user_created_idx on public.mcp_calls (user_id, created_at desc);

alter table public.mcp_calls enable row level security;

create policy "Users read their own MCP calls"
  on public.mcp_calls for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users log their own MCP calls"
  on public.mcp_calls for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- No update or delete policies: the log is append-only for users.
