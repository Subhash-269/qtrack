// Write actions for the MCP server (P2), plus the undo runner the Settings page also uses.
// Plain JS with no imports from npm: runs in Deno, in the browser and under Vitest.
//
// Every action returns { summary, data, undo } where `undo` is a list of operations that put
// things back the way they were. The caller stores it in mcp_calls.undo.

import { TASK_DONE, TEST_DONE } from './today.js'

export const UNDO_WINDOW_MS = 10 * 60 * 1000
export const WRITE_LIMIT_PER_HOUR = 60
const POMODORO = 25 * 60
const TIMER_COLS = ['state', 'session_type', 'sessions_completed', 'total_seconds', 'remaining_seconds', 'started_at', 'task_type', 'task_id', 'study_topic', 'project_id', 'pause_reason', 'paused_at']
const IDLE = { state: 'idle', session_type: 'work', sessions_completed: 0, total_seconds: POMODORO, remaining_seconds: POMODORO, started_at: null, task_type: null, task_id: null, study_topic: '', project_id: null, pause_reason: null, paused_at: null }

export class UserError extends Error {}

const one = (res) => { if (res.error) throw res.error; return res.data }
const many = (res) => { if (res.error) throw res.error; return res.data || [] }
const pick = (row, cols) => Object.fromEntries(cols.map(c => [c, row[c] ?? null]))
const iso = (ms) => new Date(ms).toISOString()
const kindName = (t) => (t === 'issue' ? 'task' : t)
const escapeLike = (s) => String(s).replace(/[%_\\]/g, (c) => '\\' + c)

// ---------- lookups ----------

// Active (not archived) projects. select('*') so it works before the archive migration too.
async function projects(client, userId, { includeArchived = false } = {}) {
  const all = many(await client.from('projects').select('*').eq('user_id', userId).order('created_at', { ascending: true }))
  return includeArchived ? all : all.filter(p => !p.archived_at)
}

// A project by (part of) its name, or the one used most recently.
export async function resolveProject(client, userId, name) {
  const list = await projects(client, userId)
  if (!list.length) throw new UserError('You have no active projects in QTrack. Create one, or unarchive one.')
  if (name) {
    const n = name.trim().toLowerCase()
    const archived = (await projects(client, userId, { includeArchived: true })).find(p => p.archived_at && p.name.toLowerCase() === n)
    if (archived && !list.some(p => p.name.toLowerCase() === n)) throw new UserError(`"${archived.name}" is archived. Restore it first (restore_project, or in QTrack).`)
    const exact = list.filter(p => p.name.toLowerCase() === n)
    const partial = exact.length ? exact : list.filter(p => p.name.toLowerCase().includes(n))
    if (partial.length === 1) return partial[0]
    if (!partial.length) throw new UserError(`No project matches "${name}". Projects: ${list.map(p => p.name).join(', ')}.`)
    throw new UserError(`"${name}" matches several projects: ${partial.map(p => p.name).join(', ')}. Use the full name.`)
  }
  const last = many(await client.from('focus_sessions').select('project_id, completed_at').eq('user_id', userId).order('completed_at', { ascending: false }).limit(1))[0]
  return list.find(p => p.id === last?.project_id) || list[list.length - 1]
}

// ---------- projects ----------

export async function listProjects(client, userId, { include_archived } = {}) {
  const all = await projects(client, userId, { includeArchived: true })
  const shown = include_archived ? all : all.filter(p => !p.archived_at)
  const active = all.filter(p => !p.archived_at).length
  return {
    summary: `${active} active project${active === 1 ? '' : 's'}${all.length > active ? `, ${all.length - active} archived` : ''}.`,
    data: { projects: shown.map(p => ({ id: p.id, name: p.name, type: p.type || 'project', archived: !!p.archived_at, archived_at: p.archived_at || null })) },
  }
}

// Find a project by name among all of them (archived included), exact match first.
async function findProjectAny(client, userId, name) {
  const all = await projects(client, userId, { includeArchived: true })
  const n = String(name || '').trim().toLowerCase()
  if (!n) throw new UserError('Say which project, by name.')
  const exact = all.filter(p => p.name.toLowerCase() === n)
  const matches = exact.length ? exact : all.filter(p => p.name.toLowerCase().includes(n))
  if (matches.length === 1) return { project: matches[0], all }
  if (!matches.length) throw new UserError(`No project matches "${name}". Projects: ${all.map(p => p.name + (p.archived_at ? ' (archived)' : '')).join(', ')}.`)
  throw new UserError(`"${name}" matches several projects: ${matches.map(p => p.name).join(', ')}. Use the full name.`)
}

// Archive (hide from the sidebar, Today and the assistant's defaults; data kept) or restore.
export async function setProjectArchived(client, userId, { project }, archive, now = Date.now()) {
  const { project: p, all } = await findProjectAny(client, userId, project)
  if (archive && p.archived_at) return { summary: `"${p.name}" is already archived.`, data: { project: p.name, archived: true }, undo: null }
  if (!archive && !p.archived_at) return { summary: `"${p.name}" isn't archived.`, data: { project: p.name, archived: false }, undo: null }
  if (archive && all.filter(x => !x.archived_at).length <= 1) throw new UserError(`"${p.name}" is the only active project, so it can't be archived.`)
  const archived_at = archive ? iso(now) : null
  one(await client.from('projects').update({ archived_at }).eq('id', p.id).eq('user_id', userId).select().single())
  return {
    summary: archive ? `Archived "${p.name}". Its tasks and history are kept; it's hidden from the sidebar and Today.` : `Restored "${p.name}".`,
    data: { project: p.name, project_id: p.id, archived: archive },
    undo: [{ op: 'update', table: 'projects', id: p.id, values: { archived_at: p.archived_at || null } }],
  }
}

// A task or test case by id, tagged with its kind ('issue' | 'test').
async function findItem(client, userId, id) {
  const t = one(await client.from('issues').select('*').eq('user_id', userId).eq('id', id).maybeSingle())
  if (t) return { ...t, kind: 'issue' }
  const c = one(await client.from('test_cases').select('*').eq('user_id', userId).eq('id', id).maybeSingle())
  if (c) return { ...c, kind: 'test' }
  throw new UserError(`No task or test case with id ${id}.`)
}

// ---------- timer ----------

async function timerRow(client, userId) {
  return one(await client.from('timer_state').select('*').eq('user_id', userId).maybeSingle())
}

async function writeTimer(client, userId, fields) {
  one(await client.from('timer_state').upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select().single())
}

// The timer as it is right now (a running timer counts down from started_at).
export function liveTimer(row, now = Date.now()) {
  if (!row || (row.state !== 'running' && row.state !== 'paused')) return { state: 'idle' }
  const total = row.total_seconds || POMODORO
  if (row.state === 'running') {
    const left = row.started_at ? Math.max(0, total - Math.floor((now - new Date(row.started_at).getTime()) / 1000)) : row.remaining_seconds
    return { state: left > 0 ? 'running' : 'finished', type: row.session_type, total, left, elapsed: total - left }
  }
  return { state: 'paused', type: row.session_type, total, left: row.remaining_seconds, elapsed: total - row.remaining_seconds, pause_reason: row.pause_reason || null, paused_at: row.paused_at || null }
}

async function logSession(client, userId, row, seconds, subtype) {
  const s = one(await client.from('focus_sessions').insert({
    user_id: userId,
    project_id: row.project_id || null,
    issue_id: row.task_type === 'issue' ? row.task_id : null,
    test_case_id: row.task_type === 'test' ? row.task_id : null,
    session_type: 'work',
    duration_seconds: seconds,
    subtype,
    study_topic: row.study_topic || '',
    source: 'assistant',
  }).select().single())
  return { op: 'delete', table: 'focus_sessions', id: s.id }
}

async function timerTitle(client, userId, row) {
  if (!row?.task_type) return null
  if (row.task_type === 'study') return row.study_topic || 'Study session'
  const t = row.task_type === 'issue' ? 'issues' : 'test_cases'
  return one(await client.from(t).select('title').eq('user_id', userId).eq('id', row.task_id).maybeSingle())?.title || null
}

export async function getTimer(client, userId, now = Date.now()) {
  const row = await timerRow(client, userId)
  const live = liveTimer(row, now)
  if (live.state === 'idle') return { summary: 'No timer running.', data: { state: 'idle' } }
  const title = await timerTitle(client, userId, row)
  const mins = Math.ceil(live.left / 60)
  const what = title ? `"${title}"` : live.type === 'work' ? 'a focus session' : 'a break'
  const summary = live.state === 'running' ? `${live.type === 'work' ? 'Focusing on' : 'On'} ${what}, ${mins} min left.`
    : live.state === 'paused' ? `Paused on ${what}${live.pause_reason ? ` (${live.pause_reason})` : ''}, ${mins} min left.`
      : `The session on ${what} has run out.`
  return { summary, data: { ...live, task_type: kindName(row.task_type), task_id: row.task_id, title, project_id: row.project_id } }
}

// Work out what to focus on from an id, a topic, or a title (creating a task if nothing matches).
async function resolveTarget(client, userId, { task_id, kind, title, project }) {
  if (task_id) {
    const item = await findItem(client, userId, task_id)
    return { task_type: item.kind, task_id: item.id, project_id: item.project_id, title: item.title, undo: [] }
  }
  if (!title?.trim()) throw new UserError('Say what to focus on: a task_id from search_tasks, or a title.')
  if (kind === 'topic') {
    const p = await resolveProject(client, userId, project)
    return { task_type: 'study', task_id: null, study_topic: title.trim(), project_id: p.id, title: title.trim(), undo: [] }
  }

  const pattern = `%${escapeLike(title.trim())}%`
  const projectFilter = project ? (await resolveProject(client, userId, project)).id : null
  const q = (t) => { let b = client.from(t).select('*').eq('user_id', userId).ilike('title', pattern); if (projectFilter) b = b.eq('project_id', projectFilter); return b }
  const [tasks, tests] = await Promise.all([q('issues').then(many), kind === 'task' ? [] : q('test_cases').then(many)])
  const open = [
    ...tasks.filter(r => !TASK_DONE.includes(r.status)).map(r => ({ ...r, kind: 'issue' })),
    ...(kind === 'task' ? [] : tests.filter(r => !TEST_DONE.includes(r.status)).map(r => ({ ...r, kind: 'test' }))),
  ]
  const exact = open.filter(r => r.title.toLowerCase() === title.trim().toLowerCase())
  const matches = exact.length ? exact : open
  if (matches.length === 1) { const m = matches[0]; return { task_type: m.kind, task_id: m.id, project_id: m.project_id, title: m.title, undo: [] } }
  if (matches.length > 1) {
    throw new UserError(`"${title}" matches ${matches.length} items. Call start_focus again with one task_id:\n` + matches.slice(0, 8).map(m => `- ${m.id}: ${m.title} (${kindName(m.kind)})`).join('\n'))
  }

  // No match: create a task (decision D3) and focus on it
  const p = await resolveProject(client, userId, project)
  const created = await insertTask(client, userId, { project_id: p.id, title: title.trim() })
  return { task_type: 'issue', task_id: created.id, project_id: p.id, title: created.title, created: { id: created.id, project: p.name }, undo: [{ op: 'delete', table: 'issues', id: created.id }] }
}

export async function startFocus(client, userId, args, now = Date.now()) {
  const minutes = args.minutes || 25
  const row = await timerRow(client, userId)
  const live = liveTimer(row, now)
  const target = await resolveTarget(client, userId, args)

  if (live.state === 'running' && row.session_type === 'work' && row.task_type === target.task_type && row.task_id === target.task_id && (target.task_id || row.study_topic === target.study_topic)) {
    return { summary: `Already focusing on "${target.title}", ${Math.ceil(live.left / 60)} min left.`, data: { already_running: true, title: target.title }, undo: null }
  }

  const undo = [{ op: 'timer', row: row ? pick(row, TIMER_COLS) : IDLE }]
  // Switching tasks mid-session: log the time spent on the previous one
  if ((live.state === 'running' || live.state === 'paused') && row.session_type === 'work' && row.task_type && live.elapsed >= 10) {
    undo.push(await logSession(client, userId, row, live.elapsed, row.task_type === 'study' ? 'study' : 'focus'))
  }
  await writeTimer(client, userId, {
    state: 'running', session_type: 'work',
    sessions_completed: row?.session_type === 'work' ? row.sessions_completed || 0 : 0,
    total_seconds: minutes * 60, remaining_seconds: minutes * 60, started_at: iso(now),
    task_type: target.task_type, task_id: target.task_id, study_topic: target.study_topic || '',
    project_id: target.project_id, pause_reason: null, paused_at: null,
  })
  undo.push(...target.undo)

  const ends = new Date(now + minutes * 60000)
  return {
    summary: `${target.created ? `Created task "${target.title}" in ${target.created.project} and started` : 'Started'} a ${minutes}-min focus on "${target.title}".`,
    data: { title: target.title, kind: kindName(target.task_type), task_id: target.task_id, project_id: target.project_id, minutes, started_at: iso(now), ends_at: ends.toISOString(), created_task: target.created || null, link: target.task_id ? `/focus?task=${target.task_id}` : '/focus' },
    undo,
  }
}

export async function pauseFocus(client, userId, { reason }, now = Date.now()) {
  const row = await timerRow(client, userId)
  const live = liveTimer(row, now)
  if (live.state !== 'running') throw new UserError(live.state === 'paused' ? 'The timer is already paused.' : 'No timer is running.')
  await writeTimer(client, userId, { ...pick(row, TIMER_COLS), state: 'paused', remaining_seconds: live.left, started_at: null, pause_reason: reason || null, paused_at: iso(now) })
  const title = await timerTitle(client, userId, row)
  return {
    summary: `Paused${title ? ` "${title}"` : ''}${reason ? ` (${reason})` : ''} with ${Math.ceil(live.left / 60)} min left.`,
    data: { title, reason: reason || null, left_seconds: live.left, focused_seconds: live.elapsed },
    undo: [{ op: 'timer', row: pick(row, TIMER_COLS) }],
  }
}

export async function resumeFocus(client, userId, _args, now = Date.now()) {
  const row = await timerRow(client, userId)
  const live = liveTimer(row, now)
  if (live.state !== 'paused') throw new UserError(live.state === 'running' ? 'The timer is already running.' : 'Nothing is paused.')
  const undo = [{ op: 'timer', row: pick(row, TIMER_COLS) }]
  // Same as the app: a pause with a reason is logged as its own entry
  const pauseSecs = row.paused_at ? Math.round((now - new Date(row.paused_at).getTime()) / 1000) : 0
  if (row.pause_reason && pauseSecs >= 10) undo.push(await logSession(client, userId, row, pauseSecs, row.pause_reason))
  await writeTimer(client, userId, { ...pick(row, TIMER_COLS), state: 'running', started_at: iso(now - (row.total_seconds - row.remaining_seconds) * 1000), pause_reason: null, paused_at: null })
  const title = await timerTitle(client, userId, row)
  return { summary: `Resumed${title ? ` "${title}"` : ''}, ${Math.ceil(row.remaining_seconds / 60)} min left.`, data: { title, left_seconds: row.remaining_seconds, paused_seconds: pauseSecs }, undo }
}

export async function stopFocus(client, userId, { mark_done }, now = Date.now()) {
  const row = await timerRow(client, userId)
  const live = liveTimer(row, now)
  if (live.state === 'idle') throw new UserError('No timer is running.')
  const undo = [{ op: 'timer', row: pick(row, TIMER_COLS) }]
  const title = await timerTitle(client, userId, row)
  const logged = row.session_type === 'work' && live.elapsed >= 10 ? live.elapsed : 0
  if (logged) undo.push(await logSession(client, userId, row, logged, row.task_type === 'study' ? 'study' : 'focus'))
  await writeTimer(client, userId, IDLE)

  let done = false
  if (mark_done && (row.task_type === 'issue' || row.task_type === 'test')) {
    const item = await findItem(client, userId, row.task_id)
    if (item.kind === 'issue') {
      one(await client.from('issues').update({ status: 'fixed', resolved_at: iso(now) }).eq('id', item.id).eq('user_id', userId).select().single())
      undo.push({ op: 'update', table: 'issues', id: item.id, values: { status: item.status, resolved_at: item.resolved_at ?? null } })
    } else {
      one(await client.from('test_cases').update({ status: 'pass', last_run: iso(now) }).eq('id', item.id).eq('user_id', userId).select().single())
      undo.push({ op: 'update', table: 'test_cases', id: item.id, values: { status: item.status, last_run: item.last_run ?? null } })
    }
    done = true
  }
  const m = Math.round(logged / 60)
  return {
    summary: `Stopped${title ? ` "${title}"` : ''}${logged ? `, logged ${m < 1 ? '<1' : m} min` : ''}${done ? ', marked done' : ''}.`,
    data: { title, logged_seconds: logged, marked_done: done },
    undo,
  }
}

// ---------- tasks, queue, notes ----------

async function insertTask(client, userId, { project_id, title, type = 'todo', priority = 'medium', due_date = null }) {
  return one(await client.from('issues').insert({
    user_id: userId, project_id, file_id: null, title, type, priority, description: '',
    estimated_pomodoros: 1, due_date: due_date || null, repo_name: '', branch_name: '', meeting_tag: null, source: 'assistant',
  }).select().single())
}

async function queueItem(client, userId, item) {
  const type = item.kind === 'test' ? 'test' : 'issue'
  const existing = many(await client.from('task_queue').select('*').eq('user_id', userId).eq('project_id', item.project_id).order('position', { ascending: true }))
  if (existing.some(q => q.item_id === item.id)) return null
  const pos = existing.length ? Math.max(...existing.map(q => q.position || 0)) + 1 : 0
  const q = one(await client.from('task_queue').insert({ user_id: userId, project_id: item.project_id, item_type: type, item_id: item.id, position: pos }).select().single())
  return { op: 'delete', table: 'task_queue', id: q.id }
}

export async function addTask(client, userId, { title, project, type, priority, due_date, queue }) {
  const p = await resolveProject(client, userId, project)
  const t = await insertTask(client, userId, { project_id: p.id, title: title.trim(), type, priority, due_date })
  const undo = [{ op: 'delete', table: 'issues', id: t.id }]
  let queued = false
  if (queue) { const op = await queueItem(client, userId, { ...t, kind: 'issue' }); if (op) { undo.push(op); queued = true } }
  return {
    summary: `Added task "${t.title}" to ${p.name}${queued ? ' and queued it' : ''}.`,
    data: { task_id: t.id, title: t.title, project: p.name, type: t.type, priority: t.priority, due_date: t.due_date, queued },
    undo,
  }
}

export async function addToQueue(client, userId, { task_id }) {
  const item = await findItem(client, userId, task_id)
  const op = await queueItem(client, userId, item)
  if (!op) return { summary: `"${item.title}" is already in the queue.`, data: { task_id, already_queued: true }, undo: null }
  return { summary: `Queued "${item.title}".`, data: { task_id, title: item.title, kind: kindName(item.kind) }, undo: [op] }
}

// Delete a task. In the database, deleting a task cascades to its issue_test_links and sets
// focus_sessions.issue_id / notes.linked_issue_id to null; task_queue has no foreign key. So we
// snapshot all of those first, and undo restores the task with the same id and re-links the rest.
export async function deleteTask(client, userId, { task_id }, now = Date.now()) {
  const task = one(await client.from('issues').select('*').eq('user_id', userId).eq('id', task_id).maybeSingle())
  if (!task) throw new UserError(`No task with id ${task_id}. Use search_tasks to find its id.`)
  const row = await timerRow(client, userId)
  if (row?.task_type === 'issue' && row.task_id === task.id && liveTimer(row, now).state !== 'idle') {
    throw new UserError(`"${task.title}" is being timed right now. Stop the timer first (stop_focus).`)
  }

  const byUser = (t) => client.from(t).select('*').eq('user_id', userId)
  const [links, queue, sessions, notes] = (await Promise.all([
    byUser('issue_test_links').eq('issue_id', task.id),
    byUser('task_queue').eq('item_type', 'issue').eq('item_id', task.id),
    byUser('focus_sessions').eq('issue_id', task.id),
    byUser('notes').eq('linked_issue_id', task.id),
  ])).map(many)

  for (const q of queue) one(await client.from('task_queue').delete().eq('id', q.id).eq('user_id', userId))
  one(await client.from('issues').delete().eq('id', task.id).eq('user_id', userId))

  // Undo runs these in reverse: task first, then what hangs off it
  const undo = []
  if (notes.length) undo.push({ op: 'relink', table: 'notes', ids: notes.map(n => n.id), values: { linked_issue_id: task.id } })
  // focus_sessions has no UPDATE policy (sessions never change), so swap the unlinked rows for the originals
  if (sessions.length) undo.push({ op: 'replace', table: 'focus_sessions', rows: sessions })
  if (queue.length) undo.push({ op: 'insert', table: 'task_queue', rows: queue })
  if (links.length) undo.push({ op: 'insert', table: 'issue_test_links', rows: links })
  undo.push({ op: 'insert', table: 'issues', rows: [task] })

  const kept = [sessions.length && `${sessions.length} focus session${sessions.length === 1 ? '' : 's'}`, notes.length && `${notes.length} note${notes.length === 1 ? '' : 's'}`].filter(Boolean)
  return {
    summary: `Deleted task "${task.title}"${kept.length ? ` (its ${kept.join(' and ')} stay, unlinked)` : ''}. Undo within 10 minutes restores it.`,
    data: { task_id: task.id, title: task.title, removed_from_queue: queue.length > 0, unlinked: { focus_sessions: sessions.length, notes: notes.length, test_links: links.length } },
    undo,
  }
}

// Log focus time after the fact (the user worked without the timer). Each pomodoro is its own
// 25-min work session, back to back, ending at ended_at (default now), the way the timer logs them.
export async function logFocus(client, userId, { task_id, pomodoros = 1, ended_at }, now = Date.now()) {
  const item = await findItem(client, userId, task_id)
  if (item.kind !== 'issue' && item.kind !== 'test') throw new UserError('Pomodoros can only be logged on a task or test case.')
  const end = ended_at ? new Date(ended_at).getTime() : now
  if (Number.isNaN(end)) throw new UserError(`"${ended_at}" isn't a date and time.`)
  if (end > now + 60000) throw new UserError("Can't log focus time in the future.")
  const rows = Array.from({ length: pomodoros }, (_, i) => ({
    user_id: userId, project_id: item.project_id,
    issue_id: item.kind === 'issue' ? item.id : null, test_case_id: item.kind === 'test' ? item.id : null,
    session_type: 'work', duration_seconds: POMODORO, subtype: 'focus', study_topic: '', source: 'assistant',
    completed_at: iso(end - (pomodoros - 1 - i) * POMODORO * 1000),
  }))
  const saved = many(await client.from('focus_sessions').insert(rows).select())
  return {
    summary: `Logged ${pomodoros} pomodoro${pomodoros === 1 ? '' : 's'} (${pomodoros * 25} min) on "${item.title}".`,
    data: { task_id: item.id, title: item.title, kind: kindName(item.kind), pomodoros, minutes: pomodoros * 25, ended_at: iso(end) },
    undo: saved.map(s => ({ op: 'delete', table: 'focus_sessions', id: s.id })),
  }
}

// Change a task's status, priority, due date, title or type. "done" means "fixed", as in the app.
// Moving to a finished status stamps resolved_at (the app's reports use it); reopening clears it.
export const TASK_STATUSES = ['open', 'in_progress', 'fixed', 'verified', 'wont_fix']
const STATUS_ALIASES = { done: 'fixed' }

export async function updateTask(client, userId, { task_id, status, priority, due_date, title, type }, now = Date.now()) {
  const task = one(await client.from('issues').select('*').eq('user_id', userId).eq('id', task_id).maybeSingle())
  if (!task) throw new UserError(`No task with id ${task_id}. Use search_tasks to find its id.`)

  const values = {}
  if (status !== undefined) {
    const s = STATUS_ALIASES[status] || status
    if (!TASK_STATUSES.includes(s)) throw new UserError(`Unknown status "${status}". Use one of: done, ${TASK_STATUSES.join(', ')}.`)
    if (s !== task.status) {
      values.status = s
      const wasDone = TASK_DONE.includes(task.status), isDone = TASK_DONE.includes(s)
      if (isDone && !wasDone) values.resolved_at = iso(now)
      else if (!isDone) values.resolved_at = null
    }
  }
  if (priority !== undefined && priority !== task.priority) values.priority = priority
  if (due_date !== undefined && (due_date || null) !== (task.due_date || null)) values.due_date = due_date || null
  if (title !== undefined && title.trim() && title.trim() !== task.title) values.title = title.trim()
  if (type !== undefined && type !== task.type) values.type = type

  const fields = Object.keys(values).filter(k => k !== 'resolved_at')
  if (!fields.length) return { summary: `"${task.title}" already looks like that; nothing changed.`, data: { task_id: task.id, title: task.title, changed: [] }, undo: null }

  const after = one(await client.from('issues').update(values).eq('id', task.id).eq('user_id', userId).select().single())
  const before = pick(task, Object.keys(values))
  const label = (k) => k === 'status' ? (TASK_DONE.includes(after.status) ? `marked ${after.status === 'fixed' ? 'done' : after.status.replace('_', ' ')}` : `status ${after.status.replace('_', ' ')}`)
    : k === 'due_date' ? (after.due_date ? `due ${after.due_date}` : 'no due date')
    : k === 'title' ? `renamed from "${task.title}"`
    : `${k} ${after[k]}`
  return {
    summary: `"${after.title}": ${fields.map(label).join(', ')}.`,
    data: { task_id: after.id, title: after.title, status: after.status, done: TASK_DONE.includes(after.status), priority: after.priority, due_date: after.due_date, type: after.type, changed: fields },
    undo: [{ op: 'update', table: 'issues', id: task.id, values: before }],
  }
}

export async function captureNote(client, userId, { text, project, link_task_id }) {
  let projectId, projectName, linked = null
  if (link_task_id) {
    linked = await findItem(client, userId, link_task_id)
    projectId = linked.project_id
    projectName = (await projects(client, userId, { includeArchived: true })).find(p => p.id === projectId)?.name
  } else {
    const p = await resolveProject(client, userId, project); projectId = p.id; projectName = p.name
  }
  const n = one(await client.from('notes').insert({
    user_id: userId, project_id: projectId, title: '', content: text.trim(), category: 'scratch',
    linked_issue_id: linked?.kind === 'issue' ? linked.id : null, linked_test_id: linked?.kind === 'test' ? linked.id : null,
    linked_file_id: null, code_lang: '', meeting_tag: null, repo_name: '', is_study: false, tags: [], topic: '', source: 'assistant',
  }).select().single())
  return {
    summary: `Saved to Scribbles in ${projectName}${linked ? `, linked to "${linked.title}"` : ''}.`,
    data: { note_id: n.id, project: projectName, linked_to: linked ? linked.title : null },
    undo: [{ op: 'delete', table: 'notes', id: n.id }],
  }
}

// ---------- undo ----------

export async function applyUndo(client, userId, ops) {
  for (const o of ops || []) {
    if (o.op === 'timer') await writeTimer(client, userId, o.row)
    else if (o.op === 'delete') one(await client.from(o.table).delete().eq('id', o.id).eq('user_id', userId))
    else if (o.op === 'update') one(await client.from(o.table).update(o.values).eq('id', o.id).eq('user_id', userId))
    else if (o.op === 'insert') one(await client.from(o.table).insert(o.rows.map(r => ({ ...r, user_id: userId }))))
    else if (o.op === 'replace') {
      one(await client.from(o.table).delete().in('id', o.rows.map(r => r.id)).eq('user_id', userId))
      one(await client.from(o.table).insert(o.rows.map(r => ({ ...r, user_id: userId }))))
    }
    else if (o.op === 'relink') one(await client.from(o.table).update(o.values).in('id', o.ids).eq('user_id', userId))
    else throw new Error(`Unknown undo op: ${o.op}`)
  }
}

// Undo one logged call (from the assistant's `undo` tool or the Settings page).
export async function undoCall(client, userId, callId, now = Date.now()) {
  const call = one(await client.from('mcp_calls').select('*').eq('user_id', userId).eq('id', callId).maybeSingle())
  if (!call) throw new UserError(`No change with undo id ${callId}.`)
  if (call.undone_at) throw new UserError(`"${call.tool}" was already undone.`)
  if (!call.ok || !call.undo?.length) throw new UserError(`"${call.tool}" didn't change anything, so there's nothing to undo.`)
  if (now - new Date(call.created_at).getTime() > UNDO_WINDOW_MS) throw new UserError(`"${call.tool}" is more than 10 minutes old and can't be undone any more.`)
  await applyUndo(client, userId, [...call.undo].reverse())
  one(await client.from('mcp_calls').update({ undone_at: iso(now) }).eq('id', call.id).eq('user_id', userId))
  return { summary: `Undid ${call.tool}: ${call.result_summary}`, data: { undone: call.id, tool: call.tool } }
}

// ---------- guards ----------

export async function writesAllowed(client, userId) {
  const s = one(await client.from('mcp_settings').select('allow_writes').eq('user_id', userId).maybeSingle())
  return !!s?.allow_writes
}

export async function writesInLastHour(client, userId, now = Date.now()) {
  return many(await client.from('mcp_calls').select('id').eq('user_id', userId).eq('scope', 'write').gte('created_at', iso(now - 3600000))).length
}
