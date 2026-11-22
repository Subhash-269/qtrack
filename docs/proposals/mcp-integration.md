# Proposal: drive QTrack from your AI assistant (MCP)

**Status:** draft · **Author:** Neel · **Date:** 2026-11-21

## The idea

Today you open QTrack and click through to start a Pomodoro. This proposal flips that around: you tell the assistant you already use (Claude, or any client that speaks MCP) "I'm working on the capstone report", and QTrack starts the focus timer on that task. Every device where QTrack is open, laptop or phone, picks it up straight away.

The second half is a **Today** screen. Open QTrack on any laptop and the first thing you see is today's tasks, meetings, notes and quick scribbles, with nothing to set up.

## What already exists (and makes this cheap)

| Need | Already in the repo |
|---|---|
| Timer that follows you across devices | `timer_state` is saved server-side, and `subscribeTimerState` listens on Supabase Realtime (`src/storage.js`) |
| A queue of what's next | `task_queue` with `addToQueue`, `reorderQueue` |
| Per-user data, safely scoped | Every table is keyed by `user_id` with Row Level Security |
| Sign-in | Supabase Auth (email, GitHub, Google) |
| Server-side code | Edge Functions are already used (`news-feed`) |

So an outside tool doesn't need anything new to start a timer. It needs a safe way to write one row into `timer_state` **as the user**, and Realtime does the rest.

## Proposal

### 1. A QTrack MCP server

Add a remote MCP server as a Supabase Edge Function (`mcp`), using the MCP Streamable HTTP transport.

- **Auth:** OAuth through Supabase Auth, so each person connects **their own** QTrack account. The server makes every query with that user's token, so RLS keeps enforcing who sees what. No service-role key in this path.
- **Tools** (first set):

| Tool | What it does | Writes? |
|---|---|---|
| `get_today` | Queue, items due today, today's meetings, pinned and recent notes | no |
| `search_tasks` | Find a task, test case or study topic by name | no |
| `start_focus` | Start a Pomodoro on a task (or a free-text title), 25 min by default | yes |
| `pause_focus` / `stop_focus` | Pause with a reason (`waiting`, `interrupted`), or end and log the session | yes |
| `add_task` | Create a todo in a project and optionally queue it | yes |
| `add_to_queue` | Put an existing task next in "Up next" | yes |
| `capture_note` | Quick scribble into a project's notes (category `scratch`) | yes |
| `get_focus_stats` | Today's and this week's focus time per project | no |

- **"Working on this" flow:** the assistant calls `search_tasks`, then `start_focus`. The server writes `timer_state` and Realtime starts the timer in every open tab. The tool also returns a link (`/focus?task=…`) the assistant can show, in case QTrack isn't open anywhere.

### 2. A "Today" view

A new default screen that aggregates, across projects:
- **Now:** the running timer and its task
- **Up next:** the queue
- **Due today and overdue:** tasks, test cases, topics
- **Meetings today**, with the auto-filled agenda that already exists
- **Scribbles:** a quick-capture box that saves as a `scratch` note

It's mostly a read view over existing tables, and the same data `get_today` returns. Build it once and both people and assistants use it.

### 3. Notion (where the plan lives)

The weekly plan lives in Notion (the Tasks database). Two ways in, in order of cost:

1. **Zero code:** connect both the Notion MCP server and the QTrack MCP server to the same assistant. "Start my first Notion task for today" becomes: the assistant reads Notion, calls `add_task` and then `start_focus` in QTrack. QTrack doesn't need to know Notion exists.
2. **Built in, later:** a scheduled Edge Function that imports today's tasks from a chosen Notion database into the queue, through a Notion integration token the user pastes in Settings. Import goes one way; QTrack writes the actual focus time back to Notion only if we decide that's wanted.

Start with option 1. Build option 2 only if the assistant-in-the-middle step feels slow in daily use.

## Safety and trust

An assistant that can start timers and create tasks can also create a mess, so:
- **Scoped access:** a `read` scope and a separate `write` scope at connect time. Read-only by default.
- **RLS stays the boundary:** the MCP server never bypasses it.
- **An audit log:** each tool call is written to a new `mcp_calls` table (tool, arguments, result, client, time), and Settings shows the recent ones. You can always check what the assistant actually did, not just what it said it did.
- **Undo:** `start_focus` and `add_task` return an id, and a matching undo works for 10 minutes.
- **Rate limit** per user on write tools.

## Phases

| Phase | Ships | Rough size |
|---|---|---|
| P0 | Today view + quick-capture scribbles | small, frontend only |
| P1 | MCP server with OAuth and read tools (`get_today`, `search_tasks`, `get_focus_stats`) | medium |
| P2 | Write tools (`start_focus`, `pause/stop`, `add_task`, `add_to_queue`, `capture_note`) + audit log + undo | medium |
| P3 | Notion import (option 2), only if needed | small–medium |

P0 is useful on its own, so it goes first.

## Open questions

1. Which clients to test against first. Claude Desktop and Claude Code support remote MCP servers. Support in other assistants (OpenAI, Gemini) changes quickly, so check it when P1 lands rather than promise it here.
2. ~~Should `start_focus` on a free-text title create a task, or a lighter "ad-hoc" session with no task?~~ Decided: create a task (see `mcp-plan.md`, D3).
3. Does the demo mode (`/demo`) need a fake MCP endpoint so people can try this without an account?
4. When focus time is logged, should it be written back to the Notion task (P3)?
