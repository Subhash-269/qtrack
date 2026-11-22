// Archived projects drop out of Today, search and the assistant's project choices, but keep their data.
import { describe, it, expect, beforeEach } from 'vitest'
import { mockSupabase as client, resetDemo } from '../src/demo/mockSupabase.js'
import { DEMO_USER } from '../src/demo/seed.js'
import { TOOLS, callTool } from '../supabase/functions/mcp/tools.js'

const userId = DEMO_USER.id
const ctx = { client, userId }
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
const run = (name, args = {}) => TOOLS[name].run(ctx, args)
const project = async (prefix) => (await client.from('projects').select('*').eq('user_id', userId)).data.find(p => p.name.startsWith(prefix))
const archive = async (prefix) => { const p = await project(prefix); await client.from('projects').update({ archived_at: new Date().toISOString() }).eq('id', p.id); return p }

beforeEach(() => resetDemo())

describe('archived projects', () => {
  it('are left out of get_today', async () => {
    const before = (await run('get_today', { timezone: tz })).data
    expect(before.up_next.some(t => t.project === 'Weather App')).toBe(true)

    await archive('Weather')
    const { data } = await run('get_today', { timezone: tz })
    const all = [...data.up_next, ...data.due, ...data.meetings, ...data.scribbles]
    expect(all.some(x => x.project === 'Weather App')).toBe(false)
    expect(data.up_next.length).toBeGreaterThan(0) // other projects still show
  })

  it('are left out of search_tasks', async () => {
    expect((await run('search_tasks', { query: 'utc' })).data.results).toHaveLength(1)
    await archive('Weather')
    expect((await run('search_tasks', { query: 'utc' })).data.results).toEqual([])
  })

  it('keep their tasks and focus history', async () => {
    const p = await archive('Weather')
    const tasks = (await client.from('issues').select('*').eq('project_id', p.id)).data
    expect(tasks.length).toBeGreaterThan(0)
    const week = (await run('get_focus_stats', { range: 'week', timezone: tz })).data
    expect(week.by_project.map(x => x.project)).toContain('Weather App')
  })

  it('cannot receive new tasks from the assistant until restored', async () => {
    await client.from('mcp_settings').insert({ user_id: userId, allow_writes: true })
    const p = await archive('Weather')
    await expect(callTool('add_task', ctx, { title: 'x', project: 'Weather App' })).rejects.toThrow(/is archived/)

    // With no project named, it goes to an active project, never the archived one
    const { data } = await callTool('add_task', ctx, { title: 'Goes somewhere active' })
    expect(data.project).not.toBe('Weather App')

    await client.from('projects').update({ archived_at: null }).eq('id', p.id)
    await expect(callTool('add_task', ctx, { title: 'Back again', project: 'Weather App' })).resolves.toBeTruthy()
  })

  describe('assistant tools', () => {
    beforeEach(() => client.from('mcp_settings').insert({ user_id: userId, allow_writes: true }))

    it('archive_project and restore_project, with undo', async () => {
      const { data, summary } = await callTool('archive_project', ctx, { project: 'devconf' })
      expect(summary).toMatch(/^Archived "DevConf Boston"/)
      expect((await project('DevConf')).archived_at).toBeTruthy()
      expect((await callTool('list_projects', ctx, {})).data.projects.map(p => p.name)).not.toContain('DevConf Boston')
      expect((await callTool('list_projects', ctx, { include_archived: true })).data.projects.find(p => p.name === 'DevConf Boston')).toMatchObject({ archived: true })

      await callTool('undo', ctx, { undo_id: data.undo_id })
      expect((await project('DevConf')).archived_at).toBeNull()

      await callTool('archive_project', ctx, { project: 'DevConf Boston' })
      const r = await callTool('restore_project', ctx, { project: 'devconf' })
      expect(r.summary).toBe('Restored "DevConf Boston".')
      expect((await project('DevConf')).archived_at).toBeNull()
    })

    it('says so when nothing changes, and keeps one active project', async () => {
      expect((await callTool('restore_project', ctx, { project: 'Weather App' })).summary).toMatch(/isn't archived/)
      await callTool('archive_project', ctx, { project: 'Weather App' })
      expect((await callTool('archive_project', ctx, { project: 'Weather App' })).summary).toMatch(/already archived/)
      await callTool('archive_project', ctx, { project: 'DevConf' })
      await expect(callTool('archive_project', ctx, { project: 'CS 5800' })).rejects.toThrow(/only active project/)
    })

    it('needs changes turned on', async () => {
      await client.from('mcp_settings').update({ allow_writes: false }).eq('user_id', userId)
      await expect(callTool('archive_project', ctx, { project: 'DevConf' })).rejects.toThrow(/turned off/)
      expect((await project('DevConf')).archived_at ?? null).toBeNull()
    })
  })
})
