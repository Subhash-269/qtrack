// Task status words (todo, in_progress, done, skipped) and the old bug-tracker words they replace.
import { describe, it, expect, beforeEach } from 'vitest'
import { mockSupabase as client, resetDemo } from '../src/demo/mockSupabase.js'
import { DEMO_USER } from '../src/demo/seed.js'
import { callTool } from '../supabase/functions/mcp/tools.js'
import { isTaskDone, normalizeTaskStatus, taskStatusLabel, TASK_STATUSES } from '../supabase/functions/_shared/status.js'

const userId = DEMO_USER.id
const call = (name, args) => callTool(name, { client, userId, clientId: 'test' }, args)

beforeEach(() => resetDemo())

describe('status words', () => {
  it('maps the old words to the new ones', () => {
    expect(['open', 'fixed', 'verified', 'wont_fix', 'reopened', 'review'].map(normalizeTaskStatus)).toEqual(['todo', 'done', 'done', 'skipped', 'todo', 'in_progress'])
    expect(TASK_STATUSES.map(normalizeTaskStatus)).toEqual(TASK_STATUSES)
  })

  it('counts done and skipped as finished, old words included', () => {
    expect(['done', 'skipped', 'fixed', 'verified', 'wont_fix'].every(isTaskDone)).toBe(true)
    expect(['todo', 'in_progress', 'open'].some(isTaskDone)).toBe(false)
  })

  it('labels', () => {
    expect(['todo', 'in_progress', 'done', 'skipped', 'wont_fix'].map(taskStatusLabel)).toEqual(['To do', 'In progress', 'Done', 'Skipped', 'Skipped'])
  })

  it('the seed and new tasks only use the new words', async () => {
    await client.from('mcp_settings').insert({ user_id: userId, allow_writes: true })
    await call('add_task', { title: 'Fresh one' })
    const { data } = await client.from('issues').select('*').eq('user_id', userId)
    expect(data.every(i => TASK_STATUSES.includes(i.status))).toBe(true)
  })

  it('update_task accepts old words and stores new ones; skipped closes the task', async () => {
    await client.from('mcp_settings').insert({ user_id: userId, allow_writes: true })
    const [t] = (await client.from('issues').select('*').eq('user_id', userId).eq('status', 'in_progress')).data
    expect((await call('update_task', { task_id: t.id, status: 'wont_fix' })).data).toMatchObject({ status: 'skipped', done: true })
    expect((await call('update_task', { task_id: t.id, status: 'skipped' })).data.changed).toEqual([])
    const { data, summary } = await call('update_task', { task_id: t.id, status: 'todo' })
    expect(summary).toMatch(/moved to to do/)
    expect(data).toMatchObject({ status: 'todo', done: false })
  })
})
