// Read queries shared by the web app (src/storage.js) and the MCP server (functions/mcp).
// Plain JS with no imports so it runs in the browser, in Deno and under Vitest.
// Every query takes a Supabase client and the user's id, and filters on user_id on top of RLS.

export const TASK_DONE = ['fixed', 'verified', 'wont_fix']
export const TEST_DONE = ['pass']
const NOT_FOCUS = ['waiting', 'interrupted', 'meeting']

const unwrap = (res) => { if (res.error) throw res.error; return res.data || [] }
const byDate = (a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0)

// Calendar date (YYYY-MM-DD) and start-of-day instant for `now` in an IANA timezone.
// The browser passes its own local values instead; the server has to work them out.
export function dayBounds(timeZone = 'UTC', now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(now).map(p => [p.type, p.value]))
  const y = +parts.year, m = +parts.month, d = +parts.day
  const offsetMs = Date.UTC(y, m - 1, d, +parts.hour, +parts.minute, +parts.second) - Math.floor(now.getTime() / 1000) * 1000
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    startOfDayISO: new Date(Date.UTC(y, m - 1, d) - offsetMs).toISOString(),
  }
}

// Ids of archived projects. select('*') so this still works before the archive migration.
export async function archivedProjectIds(client, userId) {
  const rows = unwrap(await client.from('projects').select('*').eq('user_id', userId))
  return new Set(rows.filter(p => p.archived_at).map(p => p.id))
}

async function projectNames(client, userId) {
  const rows = unwrap(await client.from('projects').select('id, name').eq('user_id', userId))
  return Object.fromEntries(rows.map(p => [p.id, p.name]))
}

// Today across every project: queue, due/overdue tasks and tests, today's meetings, today's scratch notes.
export async function getToday(client, userId, { date, startOfDayISO }) {
  const q = (t) => client.from(t).select('*').eq('user_id', userId)
  const archived = await archivedProjectIds(client, userId)
  const live = (rows) => rows.filter(r => !archived.has(r.project_id))
  const [tasks, tests, meetings, queue, scribbles] = (await Promise.all([
    q('issues').lte('due_date', date).order('due_date', { ascending: true }),
    q('test_cases').lte('due_date', date).order('due_date', { ascending: true }),
    q('meetings').eq('meeting_date', date).order('start_time', { ascending: true }),
    q('task_queue').order('position', { ascending: true }),
    q('notes').eq('category', 'scratch').gte('created_at', startOfDayISO).order('created_at', { ascending: false }),
  ])).map(r => live(unwrap(r)))

  // Resolve queue entries to their task / test rows
  const ids = (type) => [...new Set(queue.filter(x => x.item_type === type).map(x => x.item_id))]
  const taskIds = ids('issue'), testIds = ids('test')
  const [qTasks, qTests] = (await Promise.all([
    taskIds.length ? q('issues').in('id', taskIds) : { data: [] },
    testIds.length ? q('test_cases').in('id', testIds) : { data: [] },
  ])).map(unwrap)
  const byId = Object.fromEntries([...qTasks.map(r => [r.id, { ...r, kind: 'issue' }]), ...qTests.map(r => [r.id, { ...r, kind: 'test' }])])
  const isOpen = (r) => (r.kind === 'test' ? !TEST_DONE.includes(r.status) : !TASK_DONE.includes(r.status))

  return {
    today: date,
    due: [
      ...tasks.filter(r => !TASK_DONE.includes(r.status)).map(r => ({ ...r, kind: 'issue' })),
      ...tests.filter(r => !TEST_DONE.includes(r.status)).map(r => ({ ...r, kind: 'test' })),
    ].sort(byDate),
    meetings: meetings.filter(m => !m.cancelled),
    queue: queue.map(x => ({ ...x, item: byId[x.item_id] })).filter(x => x.item && isOpen(x.item)),
    scribbles,
  }
}

// Find tasks, test cases and study topics by name. Open items first, then most recent.
export async function searchTasks(client, userId, query, { includeDone = false, limit = 10 } = {}) {
  const pattern = `%${String(query).replace(/[%_\\]/g, (c) => '\\' + c)}%`
  const q = (t, cols) => client.from(t).select(cols).eq('user_id', userId)
  const [names, archived, tasks, tests, topics] = await Promise.all([
    projectNames(client, userId),
    archivedProjectIds(client, userId),
    q('issues', 'id, project_id, title, type, priority, status, due_date, created_at').ilike('title', pattern).then(unwrap),
    q('test_cases', 'id, project_id, title, status, due_date, created_at').ilike('title', pattern).then(unwrap),
    q('notes', 'project_id, topic, is_study').eq('is_study', true).ilike('topic', pattern).then(unwrap),
  ])
  const rows = [
    ...tasks.map(r => ({ kind: 'task', id: r.id, title: r.title, type: r.type, priority: r.priority, status: r.status, done: TASK_DONE.includes(r.status), due_date: r.due_date, project_id: r.project_id, created_at: r.created_at })),
    ...tests.map(r => ({ kind: 'test', id: r.id, title: r.title, status: r.status, done: TEST_DONE.includes(r.status), due_date: r.due_date, project_id: r.project_id, created_at: r.created_at })),
  ].filter(r => (includeDone || !r.done) && !archived.has(r.project_id))
  rows.sort((a, b) => (a.done - b.done) || (a.created_at < b.created_at ? 1 : -1))

  const seen = new Set()
  const topicRows = topics.filter(t => t.topic && !archived.has(t.project_id) && !seen.has(t.project_id + t.topic) && seen.add(t.project_id + t.topic))
    .map(t => ({ kind: 'topic', title: t.topic, project_id: t.project_id, done: false }))

  return [...rows, ...topicRows].slice(0, limit).map(r => { const out = { ...r, project: names[r.project_id] || null }; delete out.created_at; return out })
}

// Focus time since a given instant, split into focus / paused / meetings, per project and per task.
export async function getFocusStats(client, userId, { sinceISO }) {
  const [names, sessions] = await Promise.all([
    projectNames(client, userId),
    client.from('focus_sessions').select('*').eq('user_id', userId).eq('session_type', 'work').gte('completed_at', sinceISO).then(unwrap),
  ])
  const min = (s) => s.duration_seconds / 60
  const focus = sessions.filter(s => !NOT_FOCUS.includes(s.subtype))
  const sum = (list) => Math.round(list.reduce((a, s) => a + min(s), 0))

  const perProject = {}
  for (const s of focus) perProject[s.project_id] = (perProject[s.project_id] || 0) + min(s)
  const perTask = {}
  for (const s of focus) {
    const key = s.issue_id ? `issue:${s.issue_id}` : s.test_case_id ? `test:${s.test_case_id}` : s.study_topic ? `topic:${s.study_topic}` : null
    if (key) perTask[key] = (perTask[key] || 0) + min(s)
  }

  // Titles for the top tasks
  const top = Object.entries(perTask).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const idsOf = (k) => top.filter(([key]) => key.startsWith(k + ':')).map(([key]) => key.slice(k.length + 1))
  const [tTitles, cTitles] = await Promise.all([
    idsOf('issue').length ? client.from('issues').select('id, title').eq('user_id', userId).in('id', idsOf('issue')).then(unwrap) : [],
    idsOf('test').length ? client.from('test_cases').select('id, title').eq('user_id', userId).in('id', idsOf('test')).then(unwrap) : [],
  ])
  const title = Object.fromEntries([...tTitles, ...cTitles].map(r => [r.id, r.title]))

  return {
    since: sinceISO,
    focus_minutes: sum(focus),
    pomodoros: focus.filter(s => s.duration_seconds >= 20 * 60).length,
    sessions: focus.length,
    paused_minutes: sum(sessions.filter(s => s.subtype === 'waiting' || s.subtype === 'interrupted')),
    meeting_minutes: sum(sessions.filter(s => s.subtype === 'meeting')),
    by_project: Object.entries(perProject).map(([id, m]) => ({ project: names[id] || 'Unknown', minutes: Math.round(m) })).sort((a, b) => b.minutes - a.minutes),
    top_tasks: top.map(([key, m]) => { const [kind, ...rest] = key.split(':'); const id = rest.join(':'); return { kind: kind === 'issue' ? 'task' : kind, title: kind === 'topic' ? id : title[id] || 'Deleted item', minutes: Math.round(m) } }),
  }
}
