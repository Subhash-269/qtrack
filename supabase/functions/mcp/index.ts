// QTrack MCP server: lets an MCP client (Claude, Cursor, ...) read and change the signed-in user's QTrack data.
// Auth: Supabase Auth is the OAuth 2.1 authorization server. withOAuthProtectedResource() serves the
// discovery metadata + WWW-Authenticate challenge; withSupabase({ auth: 'user' }) verifies the token
// and gives us a client scoped to that user, so every query runs under RLS. No secret key is used.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.4.0'
import { pipeline } from 'npm:@supabase/middleware@1.0.0'
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1.9.2'
import { z } from 'npm:zod@4.3.6'

import { TOOLS, callTool } from './tools.js'

const VERSION = '0.2.0'

Deno.serve(
  pipeline(
    [
      // On a custom domain, set MCP_AUTH_ISSUER=https://<ref>.supabase.co/auth/v1 (see supabase/README.md)
      withOAuthProtectedResource(Deno.env.get('MCP_AUTH_ISSUER') ? { authorizationServer: Deno.env.get('MCP_AUTH_ISSUER') } : undefined),
      withSupabase({ auth: 'user' }),
    ],
    async (req, { supabase, userClaims, jwtClaims }) => {
      const ctx = {
        client: supabase,
        userId: userClaims!.id,
        clientId: (jwtClaims as Record<string, unknown> | null)?.client_id as string | undefined,
      }

      // Edge Functions are stateless: a fresh server per request
      const handler = createMcpHandler(() => {
        const server = new McpServer({ name: 'qtrack', version: VERSION })
        for (const [name, tool] of Object.entries(TOOLS)) {
          server.registerTool(
            name,
            {
              title: tool.title,
              description: tool.description,
              inputSchema: z.object(tool.input(z)),
              annotations: { readOnlyHint: tool.scope === 'read', destructiveHint: name === 'undo', openWorldHint: false },
            },
            async (args: Record<string, unknown>) => {
              try {
                const { summary, data } = await callTool(name, ctx, args)
                return {
                  content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
                  structuredContent: data,
                }
              } catch (e) {
                return { content: [{ type: 'text', text: `QTrack error: ${(e as Error).message || e}` }], isError: true }
              }
            },
          )
        }
        return server
      })

      return handler.fetch(req)
    },
  ),
)
