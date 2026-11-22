// QTrack MCP tools (P1: read-only). Plain JS, no imports from npm, so Vitest can run the
// handlers against the demo mock. index.ts turns `input(z)` into the zod schema the SDK wants.
import { dayBounds, getToday, searchTasks, getFocusStats } from '../_shared/today.js'

const tzField = (z) => z.string().optional().describe('IANA timezone of the user, e.g. "America/New_York". Defaults to UTC. Decides what "today" means.')

const validTz = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz } catch { return 'UTC' } }

const compactTask = (r) => ({ kind: r.kind === 'issue' ? 'task' : r.kind, id: r.id, title: r.title, type: r.type, status: r.status, priority: r.priority, due_date: r.due_date, project_id: r.project_id })

export const TOOLS = {
  get_today: {
    title: 'Today in QTrack',
    description: 'What the user has on today across all projects: the queue ("up next"), tasks and test cases due today or overdue, today\'s meetings, and today\'s scribbles (quick scratch notes).',
    input: (z) => ({ timezone: tzField(z) }),
    async run({ client, userId }, { timezone }) {
      const tz = validTz(timezone || 'UTC')
      const { date, startOfDayISO } = dayBounds(tz)
      const [t, names] = await Promise.all([
        getToday(client, userId, { date, startOfDayISO }),
        client.from('projects').select('id, name').eq('user_id', userId).then(r => { if (r.error) throw r.error; return Object.fromEntries(r.data.map(p => [p.id, p.name])) }),
      ])
      const project = (id) => names[id] || null
      const data = {
        date: t.today,
        timezone: tz,
        up_next: t.queue.map(q => ({ ...compactTask(q.item), project: project(q.project_id) })),
        due: t.due.map(r => ({ ...compactTask(r), project: project(r.project_id), overdue: r.due_date < t.today })),
        meetings: t.meetings.map(m => ({ id: m.id, title: m.title, start_time: m.start_time, end_time: m.end_time, attended: !!m.attended, project: project(m.project_id) })),
        scribbles: t.scribbles.map(n => ({ id: n.id, text: n.content || n.title, created_at: n.created_at, project: project(n.project_id) })),
      }
      const summary = `${data.date}: ${data.up_next.length} up next, ${data.due.length} due or overdue, ${data.meetings.length} meetings, ${data.scribbles.length} scribbles.`
      return { summary, data }
    },
  },

  search_tasks: {
    title: 'Search tasks',
    description: 'Find tasks, test cases and study topics by name across all projects. Use this to turn what the user said ("the UTC bug") into an item id. Done items are left out unless include_done is true.',
    input: (z) => ({
      query: z.string().min(1).max(200).describe('Words from the item\'s title'),
      include_done: z.boolean().optional().describe('Also return finished items'),
      limit: z.number().int().min(1).max(25).optional().describe('Max results, default 10'),
    }),
    async run({ client, userId }, { query, include_done, limit }) {
      const results = await searchTasks(client, userId, query, { includeDone: !!include_done, limit: limit || 10 })
      const summary = results.length ? `${results.length} match${results.length === 1 ? '' : 'es'} for "${query}".` : `No matches for "${query}".`
      return { summary, data: { results } }
    },
  },

  get_focus_stats: {
    title: 'Focus stats',
    description: 'How much the user focused today or over the last 7 days: focus minutes, pomodoros, time paused (waiting / interrupted), meeting time, and a split by project and top tasks.',
    input: (z) => ({
      range: z.enum(['today', 'week']).optional().describe('"today" (default) or "week" for the last 7 days including today'),
      timezone: tzField(z),
    }),
    async run({ client, userId }, { range, timezone }) {
      const tz = validTz(timezone || 'UTC')
      const r = range || 'today'
      const { startOfDayISO } = dayBounds(tz)
      const sinceISO = r === 'week' ? new Date(new Date(startOfDayISO).getTime() - 6 * 86400000).toISOString() : startOfDayISO
      const stats = await getFocusStats(client, userId, { sinceISO })
      const h = Math.floor(stats.focus_minutes / 60), m = stats.focus_minutes % 60
      const summary = `${r === 'week' ? 'Last 7 days' : 'Today'}: ${h ? `${h}h ` : ''}${m}m focused over ${stats.pomodoros} pomodoros.`
      return { summary, data: { range: r, timezone: tz, ...stats } }
    },
  },
}

// Run a tool and write one row to mcp_calls. A failed audit write never fails the tool call.
export async function callTool(name, ctx, args) {
  const tool = TOOLS[name]
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  let out, error
  try { out = await tool.run(ctx, args || {}) } catch (e) { error = e }
  try {
    const { error: logErr } = await ctx.client.from('mcp_calls').insert({
      user_id: ctx.userId,
      tool: name,
      args: args || {},
      ok: !error,
      result_summary: error ? String(error.message || error).slice(0, 500) : out.summary,
      client_id: ctx.clientId || null,
      scope: 'read',
    })
    if (logErr) console.error('mcp_calls insert:', logErr.message)
  } catch (e) { console.error('mcp_calls insert:', e) }
  if (error) throw error
  return out
}
