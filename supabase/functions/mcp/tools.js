// QTrack MCP tools. Plain JS, no imports from npm, so Vitest can run the handlers against the
// demo mock. index.ts turns `input(z)` into the zod schema the SDK wants.
// scope 'read' tools only read. scope 'write' tools need the user's "let assistants make changes"
// switch (Settings > Assistant access), are rate limited, and return an undo_id.
import { dayBounds, getToday, searchTasks, getFocusStats } from '../_shared/today.js'
import {
  UserError, WRITE_LIMIT_PER_HOUR, getTimer, startFocus, pauseFocus, resumeFocus, stopFocus,
  addTask, addToQueue, captureNote, deleteTask, undoCall, writesAllowed, writesInLastHour,
  listProjects, setProjectArchived,
} from '../_shared/actions.js'

const tzField = (z) => z.string().optional().describe('IANA timezone of the user, e.g. "America/New_York". Defaults to UTC. Decides what "today" means.')

const validTz = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz } catch { return 'UTC' } }

const compactTask = (r) => ({ kind: r.kind === 'issue' ? 'task' : r.kind, id: r.id, title: r.title, type: r.type, status: r.status, priority: r.priority, due_date: r.due_date, project_id: r.project_id })

export const TOOLS = {
  get_today: {
    scope: 'read',
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
    scope: 'read',
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
    scope: 'read',
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

  get_timer: {
    scope: 'read',
    title: 'Current timer',
    description: "What the focus timer is doing right now on all of the user's devices: idle, running (task, minutes left) or paused (with the reason).",
    input: () => ({}),
    run: ({ client, userId }) => getTimer(client, userId),
  },

  list_projects: {
    scope: 'read',
    title: 'List projects',
    description: "The user's projects with their ids. Archived projects are hidden from Today and search; pass include_archived to see them too.",
    input: (z) => ({ include_archived: z.boolean().optional().describe('Also list archived projects') }),
    run: ({ client, userId }, args) => listProjects(client, userId, args),
  },

  archive_project: {
    scope: 'write',
    title: 'Archive project',
    description: "Archive a project by name. Nothing is deleted: its tasks, notes and focus history are kept, but it leaves the sidebar, Today, search and the default project for new tasks. The last active project can't be archived. Undo, or restore_project, brings it back.",
    input: (z) => ({ project: z.string().min(1).describe('Project name (or a unique part of it)') }),
    run: ({ client, userId }, args) => setProjectArchived(client, userId, args, true),
  },

  restore_project: {
    scope: 'write',
    title: 'Restore project',
    description: 'Bring an archived project back to the active list, by name.',
    input: (z) => ({ project: z.string().min(1).describe('Name of the archived project') }),
    run: ({ client, userId }, args) => setProjectArchived(client, userId, args, false),
  },

  start_focus: {
    scope: 'write',
    title: 'Start focus',
    description: 'Start a Pomodoro focus session. The timer starts on every device where QTrack is open. Pass task_id (from search_tasks or get_today) when you have it. With only a title, the open task whose title matches is used; if several match you get a list to pick from; if none match, a new task is created with that title and focused on. Use kind "topic" to start a study session on a topic. If another task is being timed, its time so far is logged first.',
    input: (z) => ({
      task_id: z.string().optional().describe('Id of a task or test case'),
      title: z.string().min(1).max(200).optional().describe('Title, or part of it, when there is no id'),
      kind: z.enum(['task', 'test', 'topic']).optional().describe('Limit a title match to tasks, or "topic" for a study session'),
      project: z.string().optional().describe('Project name, to narrow the match or choose where a new task goes'),
      minutes: z.number().int().min(1).max(90).optional().describe('Length of the session, default 25'),
    }),
    run: ({ client, userId }, args) => startFocus(client, userId, args),
  },

  pause_focus: {
    scope: 'write',
    title: 'Pause focus',
    description: 'Pause the running timer. Give a reason when the user is blocked: "waiting" (on someone or something) or "interrupted". Paused time with a reason shows in the focus log.',
    input: (z) => ({ reason: z.enum(['waiting', 'interrupted']).optional().describe('Why the user stopped') }),
    run: ({ client, userId }, args) => pauseFocus(client, userId, args),
  },

  resume_focus: {
    scope: 'write',
    title: 'Resume focus',
    description: 'Resume a paused timer where it left off.',
    input: () => ({}),
    run: ({ client, userId }, args) => resumeFocus(client, userId, args),
  },

  stop_focus: {
    scope: 'write',
    title: 'Stop focus',
    description: 'End the current session and log the time spent. Set mark_done when the user says the task is finished (a task becomes "fixed", a test case "pass").',
    input: (z) => ({ mark_done: z.boolean().optional().describe('Also mark the task or test case as done') }),
    run: ({ client, userId }, args) => stopFocus(client, userId, args),
  },

  add_task: {
    scope: 'write',
    title: 'Add task',
    description: 'Create a task in a project. Without a project it goes to the one used most recently. Set queue to put it in "Up next".',
    input: (z) => ({
      title: z.string().min(1).max(200),
      project: z.string().optional().describe('Project name (or part of it)'),
      type: z.enum(['todo', 'bug']).optional().describe('Default "todo"'),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Default "medium"'),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD'),
      queue: z.boolean().optional().describe('Also add it to the queue'),
    }),
    run: ({ client, userId }, args) => addTask(client, userId, args),
  },

  add_to_queue: {
    scope: 'write',
    title: 'Add to queue',
    description: "Put an existing task or test case at the end of its project's \"Up next\" queue.",
    input: (z) => ({ task_id: z.string().describe('Id from search_tasks or get_today') }),
    run: ({ client, userId }, args) => addToQueue(client, userId, args),
  },

  capture_note: {
    scope: 'write',
    title: 'Capture note',
    description: 'Save a quick scribble (scratch note). Link it to a task with link_task_id, or choose a project; otherwise it goes to the project used most recently.',
    input: (z) => ({
      text: z.string().min(1).max(5000),
      link_task_id: z.string().optional().describe('Task or test case to link the note to'),
      project: z.string().optional().describe('Project name, when not linking to a task'),
    }),
    run: ({ client, userId }, args) => captureNote(client, userId, args),
  },

  delete_task: {
    scope: 'write',
    destructive: true,
    title: 'Delete task',
    description: 'Permanently delete one task (not a test case). Needs its task_id from search_tasks or get_today; confirm with the user first, naming the task. Its focus sessions and notes are kept but unlinked, and it leaves the queue. Refused while the task is being timed. Can be undone for 10 minutes with the returned undo_id.',
    input: (z) => ({ task_id: z.string().describe('Id of the task to delete') }),
    run: ({ client, userId }, args) => deleteTask(client, userId, args),
  },

  undo: {
    scope: 'write',
    destructive: true,
    title: 'Undo',
    description: 'Reverse a change made in the last 10 minutes, using the undo_id that change returned. Puts things back as they were before it (for the timer, its state before that call).',
    input: (z) => ({ undo_id: z.string().describe('undo_id from an earlier write') }),
    run: ({ client, userId }, { undo_id }) => undoCall(client, userId, undo_id),
  },
}

// Run a tool and write one row to mcp_calls. Write tools are checked against the user's switch
// and the hourly limit first, and their undo data is stored on the row. A failed audit write never
// fails a read; for a change it's reported, since the change couldn't be undone otherwise.
export async function callTool(name, ctx, args) {
  const tool = TOOLS[name]
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  args = args || {}
  let out, error
  try {
    if (tool.scope === 'write') {
      if (!(await writesAllowed(ctx.client, ctx.userId))) {
        throw new UserError('Changes are turned off for assistants. The user can turn on "Let assistants make changes" in QTrack under Settings > Assistant access.')
      }
      if ((await writesInLastHour(ctx.client, ctx.userId)) >= WRITE_LIMIT_PER_HOUR) {
        throw new UserError(`Limit reached: ${WRITE_LIMIT_PER_HOUR} changes per hour. Try again later.`)
      }
    }
    out = await tool.run(ctx, args)
  } catch (e) { error = e }

  const row = {
    user_id: ctx.userId,
    tool: name,
    args,
    ok: !error,
    result_summary: error ? String(error.message || error).slice(0, 500) : out.summary,
    client_id: ctx.clientId || null,
    scope: tool.scope,
    undo: !error && out.undo?.length ? out.undo : null,
  }
  let logged = null
  try {
    const res = await ctx.client.from('mcp_calls').insert(row).select('id').single()
    if (res.error) throw res.error
    logged = res.data
  } catch (e) {
    console.error('mcp_calls insert:', e.message || e)
    if (!error && row.undo) error = new Error(`The change was made but couldn't be logged, so it can't be undone: ${e.message || e}`)
  }
  if (error) throw error
  const data = row.undo && logged ? { ...out.data, undo_id: logged.id } : out.data
  return { summary: out.summary, data }
}
