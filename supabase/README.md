# Supabase: QTrack MCP server

This folder holds the server side of QTrack that lives in Supabase: the `mcp` Edge Function, the queries it shares with the web app, and its database migration.

```
supabase/
├── config.toml                      # Auth OAuth server + mcp function settings
├── migrations/
│   └── 20261121000000_mcp_calls.sql # audit log table + RLS
└── functions/
    ├── _shared/today.js             # queries used by BOTH the web app and the MCP server
    └── mcp/
        ├── index.ts                 # Edge Function: OAuth discovery, token check, MCP transport
        └── tools.js                 # tool definitions + handlers (tested with Vitest)
```

## What the server does

A remote MCP server (Streamable HTTP) at `https://<project-ref>.supabase.co/functions/v1/mcp`. Each person connects their **own** QTrack account through OAuth. Supabase Auth is the authorization server, and every query runs with that user's token, so RLS applies. No secret key is used.

Read-only tools (P1):

| Tool | Input | Returns |
|---|---|---|
| `get_today` | `timezone?` | Up next, due today and overdue, today's meetings and scribbles, across all projects |
| `search_tasks` | `query`, `include_done?`, `limit?` | Matching tasks, test cases and study topics, with project names |
| `get_focus_stats` | `range?` (`today`/`week`), `timezone?` | Focus minutes, pomodoros, paused and meeting time, by project and top tasks |

Every call is written to `mcp_calls` (tool, arguments, ok, summary, OAuth client id).

## One-time setup

You need the [Supabase CLI](https://supabase.com/docs/guides/local-development) (2.117 or later), [Deno](https://deno.com/), and Docker for the local stack.

1. **Asymmetric JWT signing keys.** The token check verifies against the project JWKS and rejects legacy HS256 tokens. In the dashboard: *Project Settings → JWT Signing Keys*. Switch if the project still uses the legacy secret. Existing sessions keep working during the rotation.
2. **Link the project and pull the existing schema** (this was never in the repo):
   ```sh
   supabase link --project-ref <project-ref>
   supabase db pull                       # writes a baseline migration from the live schema
   supabase functions download news-feed  # the existing function, so it's versioned too
   ```
   Commit what these produce. The baseline migration sorts **before** `20261121000000_mcp_calls.sql`. If `db pull` names its file with a later timestamp, rename it so the baseline comes first.
3. **Apply the audit table:** `supabase db push`
4. **Turn on the OAuth 2.1 server** in the dashboard under *Authentication → OAuth Server*: enable it, set the authorization path to `/oauth/consent`, and enable **dynamic client registration**. Set the Auth **Site URL** to the deployed app origin (the Vercel URL). `config.toml` has the same settings for local runs.
5. **Deploy the function:**
   ```sh
   supabase functions deploy mcp
   ```
   `verify_jwt = false` in `config.toml` is intentional. The function checks tokens itself, and the gateway would otherwise block the unauthenticated discovery request MCP clients make first.
6. **Deploy the web app.** The consent screen is `src/OAuthConsent.jsx`, served at `/oauth/consent` (see `vercel.json`).

## Connect a client

| Client | How |
|---|---|
| Claude Code | `claude mcp add --transport http qtrack https://<project-ref>.supabase.co/functions/v1/mcp`, then `/mcp` to sign in |
| Claude | Settings → Connectors → Add custom connector, paste the URL |
| MCP Inspector | `npx -y @modelcontextprotocol/inspector`, Streamable HTTP, paste the URL |

The browser opens QTrack, you sign in if needed, then approve the client on the consent screen.

## Check it

```sh
# Unauthenticated: expect 401 and a WWW-Authenticate header pointing at the metadata
curl -si -X POST https://<project-ref>.supabase.co/functions/v1/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}' \
  | grep -i '^HTTP\|www-authenticate'

# Discovery metadata: authorization_servers must equal the issuer from Auth's discovery doc
curl -s https://<project-ref>.supabase.co/functions/v1/mcp/oauth-protected-resource
curl -s https://<project-ref>.supabase.co/auth/v1/.well-known/oauth-authorization-server
```

Locally: `supabase start`, `supabase functions serve mcp`, `npm run dev`, and set `site_url` in `config.toml` to the Vite URL. The server is then at `http://127.0.0.1:54321/functions/v1/mcp`.

## Tests

`npm test` runs the tool handlers against the demo database (`src/demo/mockSupabase.js`). That covers every tool, isolation between two accounts, and the audit log. It doesn't exercise the OAuth layer; use the curl checks above for that.

## Custom domain

If clients use a custom domain instead of `<project-ref>.supabase.co`, set `supabase secrets set MCP_AUTH_ISSUER=https://<project-ref>.supabase.co/auth/v1` and redeploy, so the advertised authorization server matches Auth's issuer.
