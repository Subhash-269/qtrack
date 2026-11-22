# Plan: MCP server + Today view

**Status:** decisions made (D1–D5) · **Date:** 2026-11-21 · **Branch:** `proposal/mcp-integration`
**Builds on:** [mcp-integration.md](mcp-integration.md) (the why) and [mcp-workflow/](mcp-workflow/index.html) (the screens, see `mock.png`).

This doc turns the proposal into work items. Each phase ships on its own and is usable before the next starts.

**Naming:** the product says **task** where the code says *issue*. New UI text, tool names, docs and code identifiers use "task". The `issues` table and existing `storage.js` functions keep their names for now; renaming them is a separate migration, not part of this plan.

## Where the code stands today

What already exists, and what the plan relies on:

| Piece | Where | Notes for this work |
|---|---|---|
| Timer sync | `timer_state` table, `saveTimerState` / `subscribeTimerState` in `src/storage.js` | One row per user (`onConflict: user_id`). Every open tab and phone listens through Realtime. If the MCP server writes this row, every device updates. |
| Queue | `task_queue`, `getQueue` / `addToQueue` / `reorderQueue` | Scoped per project. |
| Notes | `createNote` with `category: "scratch"` | Scribbles reuse this table, so no new table is needed. |
| Meetings | `getMeetings`, `meeting_date` / `start_time` | Today = rows where `meeting_date` is today and the meeting isn't cancelled. |
| Focus log | `saveFocusSession`, `getTodaySessions` | Stop or complete writes a session row. |
| Edge Functions | `news-feed`, called from `App.jsx:3129` | Exists in the Supabase project but **not in this repo**. |
| Demo mode | `src/demo/mockSupabase.js`, `seed.js` | The Today view has to work against the mock too. |

Gaps to close along the way:
- **No `supabase/` folder in the repo.** The schema, RLS policies and functions live only in the dashboard. P1 adds `supabase/migrations` and `supabase/functions` so the server code is reviewed like everything else.
- **`timer_state` has no `project_id`.** The app works out the task name from the *active* project's lists. If an assistant starts a task from another project, the timer runs but the label is blank. P2 fixes this (see 2.3).
- **No test runner.** Today `lint` and `build` are the only checks. P1 adds Vitest for the server tool handlers.

## P0: Today view (frontend only)

**Goal:** a "Today" screen across all projects that becomes the default view. It matches frames 01, 03, 04 and 05 of the mock.

| # | Task | Files |
|---|---|---|
| 0.1 | Add a `today` nav entry (☀) first in both nav lists, and make it the default `view` | `src/App.jsx` (nav near line 264, `useState("dashboard")`) |
| 0.2 | Move the new screen into `src/views/TodayView.jsx`, out of `App.jsx` (already 3.6k lines) | new file |
| 0.3 | **Now** card: ring, task, Pause/Done, and the paused state with its reason. Reuse the existing `tmr`, `pauseTmr`, `resumeTmr` and `markDone`. | `TodayView.jsx` |
| 0.4 | **Up next:** render `queue` with ▶ calling the existing `focusOn` | `TodayView.jsx` |
| 0.5 | **Due today and overdue:** open tasks and tests with `due_date <= today`, overdue first with a "Nd over" chip (study topics have no due date, so they only appear via the queue) | `TodayView.jsx` |
| 0.6 | **Meetings today:** today's meetings that aren't cancelled. ◎ opens the existing `MeetingFocusView`. | `TodayView.jsx` |
| 0.7 | **Scribbles:** one-line input, Enter calls `createNote({category:"scratch"})`, and today's scratch notes are listed below it | `TodayView.jsx` |
| 0.8 | Seed demo data so `/demo` opens on a populated Today | `src/demo/seed.js` |
| 0.9 | Phone layout: single column under 640px. Builds on the mobile layout (`useIsMobile`, `.qt-mobile`) merged from `feature/demo-mode-readme`. | `TodayView.jsx` |
| 0.10 | Cross-project queries plus the matching demo mock | `src/storage.js`, `src/demo/mockSupabase.js` |

**Scope: all projects (D1).** The app only loads the active project today, so P0 adds cross-project reads to `src/storage.js`: `getTodayAcrossProjects()` returns open tasks/tests/topics due today or overdue, today's meetings, every project's queue, and today's scratch notes, each row carrying `project_id`. Each row shows a small project label; starting focus on a row from another project switches `activeProjectId` first. Mirror the same queries in `src/demo/mockSupabase.js`. Scribbles typed into the box save to the active project.

**Done when:** a fresh login lands on Today, every section reads correctly in `/demo`, and starting focus from Up next updates Now and the phone.

## P1: MCP server with read tools

> **Status (2026-11-21):** code done on this branch: `supabase/functions/mcp`, the shared queries in `supabase/functions/_shared/today.js` (the Today view uses them too), the `mcp_calls` migration, the `/oauth/consent` page, and 16 Vitest tests (`npm test`). **Not done yet:** 1.1's schema pull and the deploy. Both need the Supabase CLI linked to the project; steps are in `supabase/README.md`. Built on `@supabase/server` (`withOAuthProtectedResource` + `withSupabase`), which settles D2: OAuth through Supabase Auth's OAuth 2.1 server. The token fallback isn't needed unless a client can't do OAuth.

**Goal:** connect an MCP client to QTrack and run `get_today`, `search_tasks` and `get_focus_stats` as yourself.

| # | Task | Notes |
|---|---|---|
| 1.1 | Add `supabase/` to the repo: `config.toml`, a baseline migration dumped from the live schema (`supabase db dump`), and `functions/news-feed` pulled down | One-time catch-up, no behaviour change |
| 1.2 | Create the `supabase/functions/mcp` Edge Function using the official MCP TypeScript SDK with the Streamable HTTP transport | Deno. Each request makes a stateless server instance. |
| 1.3 | **Auth:** expose OAuth protected-resource metadata pointing at Supabase Auth as the authorization server. Verify the bearer JWT on every request and build a Supabase client **with the user's token**, never the service-role key. | Check that the current Supabase Auth OAuth-server support covers what MCP clients need (dynamic client registration, PKCE). If it doesn't, fall back to a personal access token made in Settings (decision D2). |
| 1.4 | Shared query module (`functions/mcp/queries.ts`) that mirrors what `TodayView` computes, so the screen and `get_today` agree | Keep both side by side in the code for now. A shared package can come later. |
| 1.5 | Tools: `get_today`, `search_tasks` (title search over tasks, tests and topics with `ilike`), `get_focus_stats` (today and this week, per project) | Inputs as zod schemas, short text output plus structured content |
| 1.6 | `mcp_calls` migration: `user_id, tool, args jsonb, result_summary, client, scope, created_at`, RLS to own rows, and log every call | Logging reads too keeps the audit view complete |
| 1.7 | Vitest unit tests for the query module against the demo seed | Add a `npm test` script |
| 1.8 | Manual check from Claude Code (`claude mcp add --transport http qtrack <url>`) and Claude Desktop | First clients to target (proposal open question 1) |

**Done when:** a second account can't see the first account's data through any tool (an RLS test), and frames 02 and 06 work end to end with read tools only.

## P2: Write tools, audit view, undo

> **Status (2026-11-22):** done on this branch, waiting on deploy (migration `20261122000000_mcp_write.sql` + redeploy `mcp`). Differences from the plan below: 2.1 is a per-user switch in `mcp_settings` instead of OAuth scopes, because Supabase's OAuth server only offers its standard sign-in scopes. Its RLS rejects tokens that carry a `client_id`, so only the app can flip it. `get_timer` was added as a read tool. 2.7 also lists connected apps with a Disconnect button.

| # | Task | Notes |
|---|---|---|
| 2.1 | Scopes: `qtrack:read` (default) and `qtrack:write`. Write tools check the scope before doing anything. | Shown on the connect screen |
| 2.2 | `start_focus`, `pause_focus` (reason: `waiting`/`interrupted`/free text), `resume_focus`, `stop_focus` (writes a `focus_sessions` row like the app does) | Write the same `timer_state` shape as `saveTimerState`, so the client needs no changes |
| 2.3 | Add `project_id` to `timer_state`. The client switches `activeProjectId` (or looks up the task) when a remote start names a different project. | Small migration plus a client change near `App.jsx:148` |
| 2.4 | `add_task`, `add_to_queue`, `capture_note` (scratch note, optional `link_task`) | Reuse the same column sets as `storage.js` |
| 2.5 | Undo: each write returns an `undo_id`, and `undo(undo_id)` reverses it within 10 minutes. Store the inverse operation in `mcp_calls`. | Covers `start_focus`, `add_task`, `capture_note`, `stop_focus` |
| 2.6 | Per-user rate limit on write tools, counted in `mcp_calls` (proposal: 60 per hour) | Return a clear error the assistant can repeat |
| 2.7 | **Settings → Assistant access:** connected clients, a read / read + write switch, a revoke button, and the recent `mcp_calls` with Undo | Frame 06 of the mock |
| 2.8 | Tag notes and sessions created through MCP (`source: "assistant"`) so the UI can show the "via assistant" chip | Frame 05 |

**Done when:** the whole day in `mcp-workflow/mock.png` works on real accounts, and each write appears in Settings and can be undone.

## P3: Notion import (only if needed)

This phase is held back on purpose. Use option 1 from the proposal first, with both MCP servers connected to the same assistant. Build the scheduled import only if that feels slow after a couple of weeks of daily use.

## Decisions needed

| # | Question | Recommendation |
|---|---|---|
| D1 | Should Today cover the active project or all projects? | **Decided: all projects**, in both the Today view and `get_today`. |
| D2 | Sign in with OAuth through Supabase Auth, or a personal access token? | **Decided:** OAuth first, personal access token in Settings as the fallback. |
| D3 | Should `start_focus` on a free-text title create a task? | **Decided: yes.** If `search_tasks` finds no match, `start_focus` creates a todo task in the given project (default: the most recently used one), then starts focus on it. The undo for that call removes both the timer and the new task. |
| D4 | Does demo mode need a fake MCP endpoint? | Not for P1 or P2. The mock page covers the pitch. (Not decided yet; this is the default.) |
| D5 | Should the mobile branch merge before P0? | **Decided: yes**, merged to `main`. |

## Risks

- **`App.jsx` conflicts** with the mobile work. Mitigation: D5, and keep the new UI in `src/views/`.
- **Realtime filter:** `subscribeTimerState` doesn't filter by `user_id` and relies on RLS for Realtime. Before P2 makes remote writes common, confirm RLS covers Realtime and add `filter: user_id=eq.<id>` anyway.
- **MCP auth churn:** client support for remote servers and OAuth changes fast. Mitigation: D2 fallback.
- **Edge Function cold starts:** `start_focus` should feel instant. Keep the function small and measure in P1.

## Order of work

1. ~~Merge mobile → `main` (D5)~~ done; `main` merged into this branch.
2. P0 (one PR).
3. P1.1 baseline `supabase/` folder (its own PR, no behaviour change).
4. P1 server and read tools.
5. P2 in two PRs: (a) timer write tools and `project_id`, (b) tasks, notes, undo and the Settings audit view.
