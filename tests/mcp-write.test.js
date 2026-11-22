// MCP write tools (P2), run against the demo mock and its seed data.
import { describe, it, expect, beforeEach } from 'vitest'
import { mockSupabase as client, resetDemo } from '../src/demo/mockSupabase.js'
import { DEMO_USER } from '../src/demo/seed.js'
import { callTool } from '../supabase/functions/mcp/tools.js'
import { pauseFocus, resumeFocus, liveTimer, WRITE_LIMIT_PER_HOUR } from '../supabase/functions/_shared/actions.js'

const userId = DEMO_USER.id
const ctx = { client, userId, clientId: 'claude-test' }
const call = (name, args) => callTool(name, ctx, args)
const rows = async (t, f = (q) => q) => (await f(client.from(t).select('*').eq('user_id', userId))).data
const timer = async () => (await rows('timer_state'))[0]
const issueByTitle = async (title) => (await rows('issues')).find(i => i.title === title)
const allowWrites = () => client.from('mcp_settings').insert({ user_id: userId, allow_writes: true })
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString()

const UTC_BUG = 'Hourly forecast shows UTC instead of local time'
const CACHE_BUG = 'Cache never expires when offline'

beforeEach(() => resetDemo())

describe('write switch', () => {
  it('refuses changes until the user turns them on, and logs the refusal', async () => {
    await expect(call('add_task', { title: 'Nope' })).rejects.toThrow(/turned off/)
    expect(await issueByTitle('Nope')).toBeUndefined()
    const [log] = await rows('mcp_calls')
    expect(log).toMatchObject({ tool: 'add_task', scope: 'write', ok: false, undo: null })
  })

  it('read tools work with changes off', async () => {
    await expect(call('get_timer', {})).resolves.toMatchObject({ data: { state: 'idle' } })
  })

  it('stops at the hourly limit', async () => {
    await allowWrites()
    await client.from('mcp_calls').insert(Array.from({ length: WRITE_LIMIT_PER_HOUR }, () => ({ user_id: userId, tool: 'add_task', scope: 'write', ok: true, created_at: minutesAgo(5) })))
    await expect(call('add_task', { title: 'One too many' })).rejects.toThrow(/Limit reached/)
  })

  it('older writes do not count toward the limit', async () => {
    await allowWrites()
    await client.from('mcp_calls').insert(Array.from({ length: WRITE_LIMIT_PER_HOUR }, () => ({ user_id: userId, tool: 'add_task', scope: 'write', ok: true, created_at: minutesAgo(90) })))
    await expect(call('add_task', { title: 'Fine' })).resolves.toBeTruthy()
  })
})

describe('start_focus', () => {
  beforeEach(allowWrites)

  it('starts the shared timer on a task by id, with its project', async () => {
    const task = await issueByTitle(UTC_BUG)
    const { data, summary } = await call('start_focus', { task_id: task.id })
    expect(summary).toBe(`Started a 25-min focus on "${UTC_BUG}".`)
    expect(data).toMatchObject({ kind: 'task', task_id: task.id, minutes: 25, created_task: null })
    expect(data.undo_id).toBeTruthy()
    expect(await timer()).toMatchObject({ state: 'running', session_type: 'work', task_type: 'issue', task_id: task.id, project_id: task.project_id, total_seconds: 1500, remaining_seconds: 1500 })
    expect((await call('get_timer', {})).summary).toMatch(/^Focusing on "Hourly forecast shows UTC/)
  })

  it('finds a single open task by part of its title', async () => {
    const { data } = await call('start_focus', { title: 'cache never', minutes: 15 })
    expect(data).toMatchObject({ title: CACHE_BUG, minutes: 15 })
    expect((await timer()).total_seconds).toBe(900)
  })

  it('asks to pick when several items match', async () => {
    await expect(call('start_focus', { title: 'hourly forecast' })).rejects.toThrow(/matches 2 items[\s\S]*Hourly forecast shows UTC[\s\S]*Hourly forecast renders/)
    expect((await timer()).state).toBe('idle')
  })

  it('creates a task when nothing matches, and undo removes it again', async () => {
    const { data, summary } = await call('start_focus', { title: 'Write the capstone report', project: 'weather' })
    expect(summary).toBe('Created task "Write the capstone report" in Weather App and started a 25-min focus on "Write the capstone report".')
    const created = await issueByTitle('Write the capstone report')
    expect(created).toMatchObject({ type: 'todo', status: 'todo', source: 'assistant', id: data.task_id })
    expect((await timer()).task_id).toBe(created.id)

    await call('undo', { undo_id: data.undo_id })
    expect(await issueByTitle('Write the capstone report')).toBeUndefined()
    expect((await timer()).state).toBe('idle')
  })

  it('puts a new task in the most recently used project by default', async () => {
    const [last] = (await client.from('focus_sessions').select('*').eq('user_id', userId).order('completed_at', { ascending: false }).limit(1)).data
    const { data } = await call('start_focus', { title: 'Brand new thing' })
    expect(data.project_id).toBe(last.project_id)
  })

  it('starts a study session on a topic', async () => {
    await call('start_focus', { title: 'Dynamic programming', kind: 'topic', project: 'CS 5800' })
    expect(await timer()).toMatchObject({ state: 'running', task_type: 'study', task_id: null, study_topic: 'Dynamic programming' })
  })

  it('logs time on the previous task when switching', async () => {
    const utc = await issueByTitle(UTC_BUG)
    await call('start_focus', { task_id: utc.id })
    await client.from('timer_state').update({ started_at: minutesAgo(5) }).eq('user_id', userId)
    const before = (await rows('focus_sessions')).length

    await call('start_focus', { title: 'cache never' })
    const sessions = await rows('focus_sessions')
    expect(sessions.length).toBe(before + 1)
    const s = sessions[sessions.length - 1]
    expect(s).toMatchObject({ issue_id: utc.id, project_id: utc.project_id, subtype: 'focus', source: 'assistant' })
    expect(s.duration_seconds).toBeGreaterThanOrEqual(299)
    expect(s.duration_seconds).toBeLessThanOrEqual(302)
  })

  it('does nothing when that task is already running', async () => {
    const utc = await issueByTitle(UTC_BUG)
    await call('start_focus', { task_id: utc.id })
    const { data, summary } = await call('start_focus', { task_id: utc.id })
    expect(summary).toMatch(/^Already focusing/)
    expect(data.undo_id).toBeUndefined()
  })

  it('rejects an id that is not the user\'s', async () => {
    const [p] = (await client.from('projects').insert({ user_id: 'other-user', name: 'Theirs' }).select()).data
    const [t] = (await client.from('issues').insert({ user_id: 'other-user', project_id: p.id, title: 'Their task', status: 'todo' }).select()).data
    await expect(call('start_focus', { task_id: t.id })).rejects.toThrow(/No task or test case/)
  })
})

describe('pause, resume, stop', () => {
  beforeEach(async () => { await allowWrites(); await call('start_focus', { title: 'cache never' }) })

  it('pause keeps the time left and the reason; resume logs the pause and carries on', async () => {
    const t0 = Date.now() + 5 * 60000 // five minutes into the session
    await pauseFocus(client, userId, { reason: 'waiting' }, t0)
    let row = await timer()
    expect(row).toMatchObject({ state: 'paused', pause_reason: 'waiting', started_at: null })
    expect(row.remaining_seconds).toBeGreaterThanOrEqual(1199)
    expect(row.remaining_seconds).toBeLessThanOrEqual(1201)
    expect(liveTimer(row, t0 + 999999).left).toBe(row.remaining_seconds) // paused time doesn't count down

    const before = (await rows('focus_sessions')).length
    await resumeFocus(client, userId, {}, t0 + 90000)
    const sessions = await rows('focus_sessions')
    expect(sessions.length).toBe(before + 1)
    expect(sessions[sessions.length - 1]).toMatchObject({ subtype: 'waiting', duration_seconds: 90 })
    row = await timer()
    expect(row).toMatchObject({ state: 'running', pause_reason: null, paused_at: null })
    expect(liveTimer(row, t0 + 90000).left).toBe(row.remaining_seconds)
  })

  it('refuses to pause twice or resume a running timer', async () => {
    await call('pause_focus', {})
    await expect(call('pause_focus', {})).rejects.toThrow(/already paused/)
    await call('resume_focus', {})
    await expect(call('resume_focus', {})).rejects.toThrow(/already running/)
  })

  it('stop logs the time, can mark the task done, and undo puts it all back', async () => {
    await client.from('timer_state').update({ started_at: minutesAgo(12) }).eq('user_id', userId)
    const cache = await issueByTitle(CACHE_BUG)
    const before = (await rows('focus_sessions')).length

    const { data, summary } = await call('stop_focus', { mark_done: true })
    expect(summary).toBe(`Stopped "${CACHE_BUG}", logged 12 min, marked done.`)
    expect((await timer()).state).toBe('idle')
    expect((await issueByTitle(CACHE_BUG)).status).toBe('done')
    expect((await rows('focus_sessions')).length).toBe(before + 1)

    await call('undo', { undo_id: data.undo_id })
    expect((await issueByTitle(CACHE_BUG)).status).toBe(cache.status)
    expect((await rows('focus_sessions')).length).toBe(before)
    expect(await timer()).toMatchObject({ state: 'running', task_id: cache.id })
  })

  it('stop on a timer that ran out logs the full session', async () => {
    await client.from('timer_state').update({ started_at: minutesAgo(40) }).eq('user_id', userId)
    const { data } = await call('stop_focus', {})
    expect(data.logged_seconds).toBe(1500)
  })
})

describe('tasks, queue and notes', () => {
  beforeEach(allowWrites)

  it('add_task creates and queues a task that shows up in get_today', async () => {
    const { data } = await call('add_task', { title: 'Email the TA', project: 'CS 5800', priority: 'high', queue: true })
    expect(data).toMatchObject({ project: 'CS 5800 · Algorithms', priority: 'high', type: 'todo', queued: true })
    const today = await callTool('get_today', ctx, {})
    expect(today.data.up_next.map(t => t.title)).toContain('Email the TA')

    await call('undo', { undo_id: data.undo_id })
    expect(await issueByTitle('Email the TA')).toBeUndefined()
    expect((await rows('task_queue')).some(q => q.item_id === data.task_id)).toBe(false)
  })

  it('add_to_queue appends once', async () => {
    const t = await issueByTitle('City search drops results with accents (São Paulo)')
    const first = await call('add_to_queue', { task_id: t.id })
    expect(first.summary).toMatch(/^Queued/)
    const q = (await rows('task_queue')).filter(x => x.project_id === t.project_id)
    expect(q[q.length - 1]).toMatchObject({ item_id: t.id, position: Math.max(...q.map(x => x.position)) })
    const again = await call('add_to_queue', { task_id: t.id })
    expect(again.data).toMatchObject({ already_queued: true })
    expect(again.data.undo_id).toBeUndefined()
  })

  it('capture_note saves a scribble linked to a task, in that task\'s project', async () => {
    const utc = await issueByTitle(UTC_BUG)
    const { data } = await call('capture_note', { text: 'offset is in seconds', link_task_id: utc.id })
    expect(data).toMatchObject({ project: 'Weather App', linked_to: UTC_BUG })
    const note = (await rows('notes')).find(n => n.id === data.note_id)
    expect(note).toMatchObject({ category: 'scratch', linked_issue_id: utc.id, project_id: utc.project_id, source: 'assistant' })
    const today = await callTool('get_today', ctx, {})
    expect(today.data.scribbles.map(s => s.text)).toContain('offset is in seconds')
  })
})

describe('delete_task', () => {
  beforeEach(allowWrites)

  // The demo mock has no foreign keys, so apply what Postgres does on delete (see actions.js)
  const applyDbRules = async (taskId) => {
    await client.from('issue_test_links').delete().eq('issue_id', taskId)               // ON DELETE CASCADE
    await client.from('focus_sessions').update({ issue_id: null }).eq('issue_id', taskId) // ON DELETE SET NULL
    await client.from('notes').update({ linked_issue_id: null }).eq('linked_issue_id', taskId)
  }

  it('deletes the task and its queue entry; undo restores it with links, sessions and notes', async () => {
    const utc = await issueByTitle(UTC_BUG)
    const count = async (t, col) => (await rows(t)).filter(r => r[col] === utc.id).length
    const before = { links: await count('issue_test_links', 'issue_id'), sessions: await count('focus_sessions', 'issue_id'), notes: await count('notes', 'linked_issue_id') }
    expect(before.links).toBeGreaterThan(0)
    expect(before.sessions).toBeGreaterThan(0)
    expect(await count('task_queue', 'item_id')).toBe(1)

    const { data, summary } = await call('delete_task', { task_id: utc.id })
    expect(summary).toMatch(new RegExp(`^Deleted task "${UTC_BUG}" \\(its ${before.sessions} focus sessions and ${before.notes} note`))
    expect(await issueByTitle(UTC_BUG)).toBeUndefined()
    expect(await count('task_queue', 'item_id')).toBe(0)
    await applyDbRules(utc.id)
    expect(await count('focus_sessions', 'issue_id')).toBe(0)

    await call('undo', { undo_id: data.undo_id })
    const back = await issueByTitle(UTC_BUG)
    expect(back).toMatchObject({ id: utc.id, status: utc.status, priority: utc.priority, project_id: utc.project_id })
    expect(await count('task_queue', 'item_id')).toBe(1)
    expect(await count('issue_test_links', 'issue_id')).toBe(before.links)
    expect(await count('focus_sessions', 'issue_id')).toBe(before.sessions)
    expect(await count('notes', 'linked_issue_id')).toBe(before.notes)
  })

  it('refuses while the task is being timed', async () => {
    const utc = await issueByTitle(UTC_BUG)
    await call('start_focus', { task_id: utc.id })
    await expect(call('delete_task', { task_id: utc.id })).rejects.toThrow(/being timed/)
    expect(await issueByTitle(UTC_BUG)).toBeTruthy()
  })

  it("only deletes the user's own tasks, and needs changes turned on", async () => {
    const [p] = (await client.from('projects').insert({ user_id: 'other-user', name: 'Theirs' }).select()).data
    const [t] = (await client.from('issues').insert({ user_id: 'other-user', project_id: p.id, title: 'Their task', status: 'todo' }).select()).data
    await expect(call('delete_task', { task_id: t.id })).rejects.toThrow(/No task with id/)
    expect((await client.from('issues').select('*').eq('id', t.id)).data).toHaveLength(1)

    await client.from('mcp_settings').update({ allow_writes: false }).eq('user_id', userId)
    const utc = await issueByTitle(UTC_BUG)
    await expect(call('delete_task', { task_id: utc.id })).rejects.toThrow(/turned off/)
    expect(await issueByTitle(UTC_BUG)).toBeTruthy()
  })
})

describe('update_task', () => {
  beforeEach(allowWrites)

  it('marks a task done with resolved_at, and undo reopens it', async () => {
    const utc = await issueByTitle(UTC_BUG)
    expect(utc.status).not.toBe('done')
    const { data, summary } = await call('update_task', { task_id: utc.id, status: 'done' })
    expect(summary).toBe(`"${UTC_BUG}": marked done.`)
    expect(data).toMatchObject({ status: 'done', done: true, changed: ['status'] })
    const after = await issueByTitle(UTC_BUG)
    expect(after.status).toBe('done')
    expect(after.resolved_at).toBeTruthy()
    expect((await call('search_tasks', { query: 'Hourly forecast' })).data.results.map(r => r.id)).not.toContain(utc.id)

    await call('undo', { undo_id: data.undo_id })
    const back = await issueByTitle(UTC_BUG)
    expect(back.status).toBe(utc.status)
    expect(back.resolved_at ?? null).toBe(utc.resolved_at ?? null)
  })

  it('reopening clears resolved_at', async () => {
    const utc = await issueByTitle(UTC_BUG)
    await call('update_task', { task_id: utc.id, status: 'done' })
    await call('update_task', { task_id: utc.id, status: 'todo' })
    expect(await issueByTitle(UTC_BUG)).toMatchObject({ status: 'todo', resolved_at: null })
  })

  it('changes several fields at once and can clear the due date', async () => {
    const utc = await issueByTitle(UTC_BUG)
    await call('update_task', { task_id: utc.id, due_date: '2030-01-02' })
    const { data, summary } = await call('update_task', { task_id: utc.id, priority: 'low', due_date: null, title: 'UTC bug', type: 'todo' })
    expect(data.changed.sort()).toEqual(['due_date', 'priority', 'title', 'type'].filter(k => k !== 'type' || utc.type !== 'todo').sort())
    expect(summary).toMatch(/^"UTC bug": .*priority low.*no due date/)
    expect(await issueByTitle('UTC bug')).toMatchObject({ priority: 'low', due_date: null })
    await call('undo', { undo_id: data.undo_id })
    expect(await issueByTitle(UTC_BUG)).toMatchObject({ priority: utc.priority, due_date: '2030-01-02' })
  })

  it('reports no change without logging an undo', async () => {
    const utc = await issueByTitle(UTC_BUG)
    const { data } = await call('update_task', { task_id: utc.id, priority: utc.priority })
    expect(data).toMatchObject({ changed: [] })
    expect(data.undo_id).toBeUndefined()
  })

  it("only touches the user's own tasks, and needs changes turned on", async () => {
    await expect(call('update_task', { task_id: 'nope', status: 'done' })).rejects.toThrow(/No task with id/)
    await client.from('mcp_settings').update({ allow_writes: false }).eq('user_id', userId)
    const utc = await issueByTitle(UTC_BUG)
    await expect(call('update_task', { task_id: utc.id, status: 'done' })).rejects.toThrow(/turned off/)
  })
})

describe('log_focus', () => {
  beforeEach(allowWrites)

  it('logs back-to-back pomodoros that count toward the task and the stats; undo removes them', async () => {
    const utc = await issueByTitle(UTC_BUG)
    const mine = async () => (await rows('focus_sessions')).filter(s => s.issue_id === utc.id)
    const before = (await mine()).length
    const end = new Date(Date.now() - 3600000).toISOString()
    const { data, summary } = await call('log_focus', { task_id: utc.id, pomodoros: 2, ended_at: end })
    expect(summary).toBe(`Logged 2 pomodoros (50 min) on "${UTC_BUG}".`)
    const added = (await mine()).slice(before)
    expect(added).toHaveLength(2)
    expect(added.map(s => s.duration_seconds)).toEqual([1500, 1500])
    expect(added[1].completed_at).toBe(end)
    expect(new Date(end) - new Date(added[0].completed_at)).toBe(1500 * 1000)
    expect(added[0]).toMatchObject({ session_type: 'work', project_id: utc.project_id, source: 'assistant' })
    await call('undo', { undo_id: data.undo_id })
    expect(await mine()).toHaveLength(before)
  })

  it('refuses future times and unknown ids', async () => {
    const utc = await issueByTitle(UTC_BUG)
    await expect(call('log_focus', { task_id: utc.id, ended_at: new Date(Date.now() + 3600000).toISOString() })).rejects.toThrow(/future/)
    await expect(call('log_focus', { task_id: 'nope' })).rejects.toThrow()
  })
})

describe('replan_day', () => {
  beforeEach(allowWrites)

  it('moves leftovers to today (queued), tomorrow, later, or lets them go; undo restores all', async () => {
    const [a, b, c, d] = (await rows('issues')).filter(i => !['done', 'skipped'].includes(i.status)).slice(0, 4)
    await client.from('task_queue').delete().eq('item_id', a.id)
    const today = new Date().toISOString().slice(0, 10)
    const { data, summary } = await call('replan_day', { moves: [{ task_id: a.id, to: 'today' }, { task_id: b.id, to: 'tomorrow' }, { task_id: c.id, to: 'later' }, { task_id: d.id, to: 'let_go' }] })
    expect(summary).toMatch(/^Replanned 4: 1 today, 1 tomorrow, 1 later, 1 let go\.$/)
    const after = Object.fromEntries((await rows('issues')).map(i => [i.id, i]))
    expect(after[a.id].due_date).toBe(today)
    expect((await rows('task_queue')).some(q => q.item_id === a.id)).toBe(true)
    expect(after[b.id].due_date > today).toBe(true)
    expect(after[c.id].due_date).toBeNull()
    expect(after[d.id].status).toBe('skipped')
    await call('undo', { undo_id: data.undo_id })
    const back = Object.fromEntries((await rows('issues')).map(i => [i.id, i]))
    expect([back[a.id].due_date, back[b.id].due_date, back[c.id].due_date, back[d.id].status]).toEqual([a.due_date, b.due_date, c.due_date, d.status])
    expect((await rows('task_queue')).some(q => q.item_id === a.id)).toBe(false)
  })
})

describe('undo', () => {
  beforeEach(allowWrites)

  it('works once, within 10 minutes, for the same user only', async () => {
    const { data } = await call('add_task', { title: 'Temp' })
    await call('undo', { undo_id: data.undo_id })
    await expect(call('undo', { undo_id: data.undo_id })).rejects.toThrow(/already undone/)

    const { data: d2 } = await call('add_task', { title: 'Old one' })
    await client.from('mcp_calls').update({ created_at: minutesAgo(11) }).eq('id', d2.undo_id)
    await expect(call('undo', { undo_id: d2.undo_id })).rejects.toThrow(/more than 10 minutes/)
    expect(await issueByTitle('Old one')).toBeTruthy()

    const { data: d3 } = await call('add_task', { title: 'Mine' })
    await client.from('mcp_settings').insert({ user_id: 'other-user', allow_writes: true })
    await expect(callTool('undo', { client, userId: 'other-user' }, { undo_id: d3.undo_id })).rejects.toThrow(/No change with undo id/)
    expect(await issueByTitle('Mine')).toBeTruthy()
  })

  it('records undone_at on the original call', async () => {
    const { data } = await call('add_task', { title: 'Temp' })
    await call('undo', { undo_id: data.undo_id })
    const [orig] = (await client.from('mcp_calls').select('*').eq('id', data.undo_id)).data
    expect(orig.undone_at).toBeTruthy()
  })
})
