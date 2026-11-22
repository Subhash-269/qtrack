// MCP read tools, run against the demo mock (src/demo/mockSupabase.js) and its seed data.
import { describe, it, expect, beforeEach } from 'vitest'
import { mockSupabase as client, resetDemo } from '../src/demo/mockSupabase.js'
import { DEMO_USER } from '../src/demo/seed.js'
import { TOOLS, callTool } from '../supabase/functions/mcp/tools.js'
import { dayBounds } from '../supabase/functions/_shared/today.js'

const userId = DEMO_USER.id
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone // seed dates are relative to local time
const ctx = { client, userId, clientId: 'test-client' }
const run = (name, args = {}) => TOOLS[name].run(ctx, args)
const today = () => dayBounds(tz).date

beforeEach(() => resetDemo())

describe('dayBounds', () => {
  it('gives the calendar date and start of day in the requested timezone', () => {
    const now = new Date('2026-03-08T03:30:00Z') // 22:30 on Mar 7 in New York (UTC-5)
    expect(dayBounds('America/New_York', now)).toEqual({ date: '2026-03-07', startOfDayISO: '2026-03-07T05:00:00.000Z' })
    expect(dayBounds('Asia/Kolkata', now)).toEqual({ date: '2026-03-08', startOfDayISO: '2026-03-07T18:30:00.000Z' })
    expect(dayBounds('UTC', now).date).toBe('2026-03-08')
  })
})

describe('get_today', () => {
  it('returns the queue, due items, meetings and scribbles across projects', async () => {
    const { data, summary } = await run('get_today', { timezone: tz })
    expect(data.date).toBe(today())
    expect(summary).toContain(data.date)

    expect(data.up_next.length).toBeGreaterThan(0)
    expect(new Set(data.up_next.map(t => t.project)).size).toBeGreaterThan(1) // more than one project
    expect(data.up_next[0]).toMatchObject({ kind: 'task', title: 'Hourly forecast shows UTC instead of local time', project: 'Weather App' })

    const utc = data.due.find(t => t.title.startsWith('Hourly forecast shows UTC'))
    expect(utc).toMatchObject({ overdue: true, kind: 'task' })
    expect(data.due.some(t => t.kind === 'test' && !t.overdue)).toBe(true)
    expect(data.due.every(t => t.due_date <= data.date)).toBe(true)

    expect(data.meetings.length).toBeGreaterThan(0)
    expect(data.meetings.every(m => typeof m.start_time === 'string')).toBe(true)
    expect(data.scribbles.map(s => s.text)).toContain('API sends the tz offset in seconds, not hours')
  })

  it('leaves out finished tasks and cancelled meetings', async () => {
    const { data: before } = await run('get_today', { timezone: tz })
    const task = before.up_next[0]
    await client.from('issues').update({ status: 'fixed' }).eq('id', task.id)
    const m = before.meetings[0]
    await client.from('meetings').update({ cancelled: true }).eq('id', m.id)

    const { data } = await run('get_today', { timezone: tz })
    expect(data.up_next.find(t => t.id === task.id)).toBeUndefined()
    expect(data.due.find(t => t.id === task.id)).toBeUndefined()
    expect(data.meetings.find(x => x.id === m.id)).toBeUndefined()
  })

  it('falls back to UTC for an unknown timezone', async () => {
    const { data } = await run('get_today', { timezone: 'Mars/Olympus_Mons' })
    expect(data.timezone).toBe('UTC')
  })
})

describe('isolation between accounts', () => {
  const other = 'other-user'
  beforeEach(async () => {
    const [p] = (await client.from('projects').insert({ user_id: other, name: 'Secret project' }).select()).data
    const [i] = (await client.from('issues').insert({ user_id: other, project_id: p.id, title: 'Hourly secret plan', type: 'todo', status: 'open', due_date: today() }).select()).data
    await client.from('task_queue').insert({ user_id: other, project_id: p.id, item_type: 'issue', item_id: i.id, position: 0 })
    await client.from('notes').insert({ user_id: other, project_id: p.id, category: 'scratch', content: 'other user scribble' })
    await client.from('focus_sessions').insert({ user_id: other, project_id: p.id, issue_id: i.id, session_type: 'work', subtype: 'focus', duration_seconds: 3600 })
  })

  it("never returns another user's rows", async () => {
    const { data } = await run('get_today', { timezone: tz })
    const all = JSON.stringify(data)
    expect(all).not.toContain('Secret project')
    expect(all).not.toContain('Hourly secret plan')
    expect(all).not.toContain('other user scribble')

    const { data: s } = await run('search_tasks', { query: 'hourly' })
    expect(s.results.map(r => r.title)).not.toContain('Hourly secret plan')

    const { data: f } = await run('get_focus_stats', { timezone: tz })
    expect(f.by_project.map(p => p.project)).not.toContain('Secret project')
  })

  it("the other user sees only their own", async () => {
    const { data } = await TOOLS.get_today.run({ client, userId: other }, { timezone: tz })
    expect(data.up_next.map(t => t.title)).toEqual(['Hourly secret plan'])
    expect(data.scribbles.map(s => s.text)).toEqual(['other user scribble'])
    expect(data.meetings).toEqual([])
  })
})

describe('search_tasks', () => {
  it('matches titles case-insensitively, tagged with project', async () => {
    const { data } = await run('search_tasks', { query: 'utc' })
    expect(data.results[0]).toMatchObject({ kind: 'task', title: 'Hourly forecast shows UTC instead of local time', project: 'Weather App', done: false })
  })

  it('finds test cases and study topics', async () => {
    const { data: tests } = await run('search_tasks', { query: 'local time' })
    expect(tests.results.some(r => r.kind === 'test')).toBe(true)
    const { data: topics } = await run('search_tasks', { query: 'graph' })
    expect(topics.results.some(r => r.kind === 'topic')).toBe(true)
  })

  it('hides done items unless asked', async () => {
    const { data: open } = await run('search_tasks', { query: 'Vite 8' })
    expect(open.results).toEqual([])
    const { data: all } = await run('search_tasks', { query: 'Vite 8', include_done: true })
    expect(all.results[0]).toMatchObject({ title: 'Upgrade to Vite 8', done: true })
  })

  it('treats % and _ in the query as plain text', async () => {
    const { data } = await run('search_tasks', { query: '%' })
    expect(data.results).toEqual([])
  })

  it('respects the limit', async () => {
    const { data } = await run('search_tasks', { query: 'e', limit: 2, include_done: true })
    expect(data.results).toHaveLength(2)
  })
})

describe('get_focus_stats', () => {
  it("adds up today's focus, separating meetings and pauses", async () => {
    const { data, summary } = await run('get_focus_stats', { timezone: tz })
    expect(data.range).toBe('today')
    expect(data.focus_minutes).toBeGreaterThan(0)
    expect(data.meeting_minutes).toBe(30) // one 30-minute sprint sync seeded today
    expect(data.pomodoros).toBeGreaterThan(0)
    expect(data.by_project[0].minutes).toBeGreaterThan(0)
    expect(data.top_tasks[0].title).toBeTruthy()
    expect(summary).toMatch(/^Today: /)
  })

  it('a week is at least as much as today', async () => {
    const { data: day } = await run('get_focus_stats', { timezone: tz })
    const { data: week } = await run('get_focus_stats', { range: 'week', timezone: tz })
    expect(week.focus_minutes).toBeGreaterThan(day.focus_minutes)
    expect(week.paused_minutes).toBeGreaterThan(0) // a "waiting" pause was seeded 2 days ago
  })
})

describe('audit log', () => {
  it('writes one mcp_calls row per call', async () => {
    await callTool('search_tasks', ctx, { query: 'cache' })
    const { data: rows } = await client.from('mcp_calls').select('*').eq('user_id', userId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ tool: 'search_tasks', args: { query: 'cache' }, ok: true, client_id: 'test-client', scope: 'read' })
    expect(rows[0].result_summary).toMatch(/match/)
  })

  it('logs failures and still throws', async () => {
    // A query builder whose every query fails, like a real client when the database is down
    const failing = () => { const b = new Proxy({}, { get: (_, k) => k === 'then' ? (res, rej) => Promise.reject(new Error('db down')).then(res, rej) : () => b }); return b }
    const broken = { ...ctx, client: { from: (t) => t === 'mcp_calls' ? client.from(t) : failing() } }
    await expect(callTool('get_today', broken, {})).rejects.toThrow('db down')
    const { data: rows } = await client.from('mcp_calls').select('*')
    expect(rows[0]).toMatchObject({ tool: 'get_today', ok: false, result_summary: 'db down' })
  })

  it('rejects unknown tools', async () => {
    await expect(callTool('drop_tables', ctx, {})).rejects.toThrow('Unknown tool')
  })
})
