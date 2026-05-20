// storage.js — Supabase-backed data layer for QTrack
// Replaces the old localStorage polyfill
import { supabase } from './supabaseClient'

const uid = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id
}

// ============================================
// Projects
// ============================================

export async function getProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createProject(name, type = 'project') {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, user_id, type })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

export async function renameProject(id, name) {
  const { data, error } = await supabase
    .from('projects')
    .update({ name })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================
// Files
// ============================================

export async function getFiles(projectId) {
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function createFile(projectId, name, category) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('files')
    .insert({ project_id: projectId, name, category, user_id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteFile(id) {
  const { error } = await supabase.from('files').delete().eq('id', id)
  if (error) throw error
}

// ============================================
// Issues
// ============================================

export async function getIssues(projectId) {
  const { data, error } = await supabase
    .from('issues')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createIssue(projectId, fileId, title, type, priority, description, estimatedPomodoros, dueDate, repoName, branchName, meetingTag) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('issues')
    .insert({
      project_id: projectId,
      file_id: fileId,
      title, type, priority, description,
      estimated_pomodoros: estimatedPomodoros || 0,
      due_date: dueDate || null,
      repo_name: repoName || '',
      branch_name: branchName || '',
      meeting_tag: meetingTag || null,
      user_id
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateIssueStatus(id, status) {
  const fields = { status };
  if (["fixed", "verified", "wont_fix"].includes(status)) fields.resolved_at = new Date().toISOString();
  else fields.resolved_at = null;
  const { error } = await supabase.from('issues').update(fields).eq('id', id)
  if (error) throw error
}

export async function updateIssuePlanning(id, estimatedPomodoros, dueDate) {
  const { error } = await supabase
    .from('issues')
    .update({ estimated_pomodoros: estimatedPomodoros, due_date: dueDate || null })
    .eq('id', id)
  if (error) throw error
}

export async function updateIssue(id, updates) {
  const fields = {};
  if (updates.title !== undefined) fields.title = updates.title;
  if (updates.type !== undefined) fields.type = updates.type;
  if (updates.priority !== undefined) fields.priority = updates.priority;
  if (updates.description !== undefined) fields.description = updates.description;
  if (updates.file_id !== undefined) fields.file_id = updates.file_id;
  if (updates.estimated_pomodoros !== undefined) fields.estimated_pomodoros = updates.estimated_pomodoros;
  if (updates.due_date !== undefined) fields.due_date = updates.due_date || null;
  if (updates.repo_name !== undefined) fields.repo_name = updates.repo_name || '';
  if (updates.branch_name !== undefined) fields.branch_name = updates.branch_name || '';
  if (updates.meeting_tag !== undefined) fields.meeting_tag = updates.meeting_tag || null;
  if (updates.scratch_notes !== undefined) fields.scratch_notes = updates.scratch_notes;
  if (updates.scratch_checklist !== undefined) fields.scratch_checklist = updates.scratch_checklist;
  if (Object.keys(fields).length === 0) return;
  const { error } = await supabase.from('issues').update(fields).eq('id', id)
  if (error) throw error
}

export async function deleteIssue(id) {
  const { error } = await supabase.from('issues').delete().eq('id', id)
  if (error) throw error
}

// ============================================
// Test Cases
// ============================================

export async function getTestCases(projectId) {
  const { data, error } = await supabase
    .from('test_cases')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createTestCase(projectId, fileId, title, precondition, steps, estimatedPomodoros, dueDate, repoName, branchName, meetingTag) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('test_cases')
    .insert({
      project_id: projectId,
      file_id: fileId,
      title, precondition, steps,
      estimated_pomodoros: estimatedPomodoros || 0,
      due_date: dueDate || null,
      repo_name: repoName || '',
      branch_name: branchName || '',
      meeting_tag: meetingTag || null,
      user_id
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTestStatus(id, status) {
  const { error } = await supabase
    .from('test_cases')
    .update({ status, last_run: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function updateTestPlanning(id, estimatedPomodoros, dueDate) {
  const { error } = await supabase
    .from('test_cases')
    .update({ estimated_pomodoros: estimatedPomodoros, due_date: dueDate || null })
    .eq('id', id)
  if (error) throw error
}

export async function updateTestCase(id, updates) {
  const fields = {};
  if (updates.title !== undefined) fields.title = updates.title;
  if (updates.precondition !== undefined) fields.precondition = updates.precondition;
  if (updates.steps !== undefined) fields.steps = updates.steps;
  if (updates.file_id !== undefined) fields.file_id = updates.file_id;
  if (updates.estimated_pomodoros !== undefined) fields.estimated_pomodoros = updates.estimated_pomodoros;
  if (updates.due_date !== undefined) fields.due_date = updates.due_date || null;
  if (updates.repo_name !== undefined) fields.repo_name = updates.repo_name || '';
  if (updates.branch_name !== undefined) fields.branch_name = updates.branch_name || '';
  if (updates.meeting_tag !== undefined) fields.meeting_tag = updates.meeting_tag || null;
  if (updates.scratch_notes !== undefined) fields.scratch_notes = updates.scratch_notes;
  if (updates.scratch_checklist !== undefined) fields.scratch_checklist = updates.scratch_checklist;
  if (Object.keys(fields).length === 0) return;
  const { error } = await supabase.from('test_cases').update(fields).eq('id', id)
  if (error) throw error
}

export async function deleteTestCase(id) {
  const { error } = await supabase.from('test_cases').delete().eq('id', id)
  if (error) throw error
}

// ============================================
// Issue ↔ Test Case Links
// ============================================

export async function getLinks(projectId) {
  try {
    const { data: issues } = await supabase
      .from('issues')
      .select('id')
      .eq('project_id', projectId)

    if (!issues || issues.length === 0) return []

    const issueIds = issues.map(i => i.id)
    const { data, error } = await supabase
      .from('issue_test_links')
      .select('*')
      .in('issue_id', issueIds)

    if (error) {
      console.warn('Links table not ready:', error.message)
      return []
    }
    return data || []
  } catch (err) {
    console.warn('Links not available:', err.message)
    return []
  }
}

export async function linkIssueToTest(issueId, testCaseId) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('issue_test_links')
    .insert({ issue_id: issueId, test_case_id: testCaseId, user_id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function unlinkIssueFromTest(issueId, testCaseId) {
  const { error } = await supabase
    .from('issue_test_links')
    .delete()
    .eq('issue_id', issueId)
    .eq('test_case_id', testCaseId)
  if (error) throw error
}

// ============================================
// Focus Sessions (Pomodoro)
// ============================================

export async function saveFocusSession(projectId, issueId, testCaseId, sessionType, durationSeconds, subtype) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('focus_sessions')
    .insert({
      user_id,
      project_id: projectId || null,
      issue_id: issueId || null,
      test_case_id: testCaseId || null,
      session_type: sessionType,
      duration_seconds: durationSeconds,
      subtype: subtype || 'focus',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function saveManualSession(projectId, issueId, testCaseId, startedAt, endedAt) {
  const user_id = await uid()
  const duration = Math.round((new Date(endedAt) - new Date(startedAt)) / 1000)
  if (duration < 60) throw new Error('Session must be at least 1 minute')
  const { data, error } = await supabase
    .from('focus_sessions')
    .insert({
      user_id,
      project_id: projectId || null,
      issue_id: issueId || null,
      test_case_id: testCaseId || null,
      session_type: 'work',
      duration_seconds: duration,
      subtype: 'manual',
      started_at: startedAt,
      completed_at: endedAt,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getTodaySessions(projectId) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('focus_sessions')
    .select('*')
    .eq('project_id', projectId)
    .gte('completed_at', today.toISOString())
    .order('completed_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getAllSessions(projectId) {
  const { data, error } = await supabase
    .from('focus_sessions')
    .select('*')
    .eq('project_id', projectId)
    .order('completed_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data || []
}

// ============================================
// Timer State (persistent + cross-device)
// ============================================

export async function getTimerState() {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('timer_state')
    .select('*')
    .eq('user_id', user_id)
    .single()
  if (error && error.code === 'PGRST116') return null // no row
  if (error) throw error
  return data
}

export async function saveTimerState(state) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('timer_state')
    .upsert({
      user_id,
      state: state.st,
      session_type: state.type,
      sessions_completed: state.done,
      total_seconds: state.total,
      remaining_seconds: state.left,
      started_at: state.startedAt || null,
      task_type: state.tType || null,
      task_id: state.tId || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export function subscribeTimerState(callback) {
  return supabase
    .channel('timer_sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'timer_state' }, payload => {
      callback(payload.new)
    })
    .subscribe()
}

export async function getMediaHistory() {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('timer_state')
    .select('media_history')
    .eq('user_id', user_id)
    .single()
  if (error) return []
  return data?.media_history || []
}

export async function saveMediaHistory(history) {
  const user_id = await uid()
  await supabase
    .from('timer_state')
    .upsert({ user_id, media_history: history }, { onConflict: 'user_id' })
}

// ============================================
// Task Queue
// ============================================

export async function getQueue(projectId) {
  const { data, error } = await supabase
    .from('task_queue')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
  if (error) throw error
  return data || []
}

export async function addToQueue(projectId, itemType, itemId, position) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('task_queue')
    .insert({ user_id, project_id: projectId, item_type: itemType, item_id: itemId, position: position || 0 })
    .select().single()
  if (error) throw error
  return data
}

export async function removeFromQueue(id) {
  const { error } = await supabase.from('task_queue').delete().eq('id', id)
  if (error) throw error
}

export async function clearQueue(projectId) {
  const user_id = await uid()
  const { error } = await supabase.from('task_queue').delete().eq('project_id', projectId).eq('user_id', user_id)
  if (error) throw error
}

export async function reorderQueue(orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    await supabase.from('task_queue').update({ position: i }).eq('id', orderedIds[i])
  }
}

// ============================================
// Meetings
// ============================================

export async function getMeetings(projectId) {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('project_id', projectId)
    .order('meeting_date', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createMeeting(projectId, { title, meeting_date, start_time, end_time, speaker, track }) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('meetings')
    .insert({ user_id, project_id: projectId, title, meeting_date, start_time: start_time || '09:00', end_time: end_time || '10:00', speaker: speaker || '', track: track || '' })
    .select().single()
  if (error) throw error
  return data
}

export async function updateMeeting(id, fields) {
  const { error } = await supabase.from('meetings').update(fields).eq('id', id)
  if (error) throw error
}

export async function deleteMeeting(id) {
  const { error } = await supabase.from('meetings').delete().eq('id', id)
  if (error) throw error
}

// ============================================
// Notes
// ============================================

export async function getNotes(projectId) {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('project_id', projectId)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createNote(projectId, { title, content, category, linked_issue_id, linked_file_id, linked_test_id, code_lang, meeting_tag, repo_name }) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('notes')
    .insert({ user_id, project_id: projectId, title: title || '', content: content || '', category: category || 'scratch', linked_issue_id: linked_issue_id || null, linked_file_id: linked_file_id || null, linked_test_id: linked_test_id || null, code_lang: code_lang || '', meeting_tag: meeting_tag || null, repo_name: repo_name || '' })
    .select().single()
  if (error) throw error
  return data
}

export async function updateNote(id, fields) {
  const { error } = await supabase
    .from('notes')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function getNote(id) {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function deleteNote(id) {
  const { error } = await supabase.from('notes').delete().eq('id', id)
  if (error) throw error
}

// ============================================
// Board
// ============================================

export async function getColumns(projectId) {
  const { data, error } = await supabase
    .from('board_columns')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createColumn(projectId, name, position) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('board_columns')
    .insert({ user_id, project_id: projectId, name, position: position || 0 })
    .select().single()
  if (error) throw error
  return data
}

export async function updateColumn(id, fields) {
  const { error } = await supabase.from('board_columns').update(fields).eq('id', id)
  if (error) throw error
}

export async function deleteColumn(id) {
  const { error } = await supabase.from('board_columns').delete().eq('id', id)
  if (error) throw error
}

export async function getCards(projectId) {
  const { data, error } = await supabase
    .from('board_cards')
    .select('*, board_columns!inner(project_id)')
    .eq('board_columns.project_id', projectId)
    .order('position', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createCard(columnId, text, color, position) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('board_cards')
    .insert({ user_id, column_id: columnId, text, color: color || 'yellow', position: position || 0 })
    .select().single()
  if (error) throw error
  return data
}

export async function updateCard(id, fields) {
  const { error } = await supabase.from('board_cards').update(fields).eq('id', id)
  if (error) throw error
}

export async function deleteCard(id) {
  const { error } = await supabase.from('board_cards').delete().eq('id', id)
  if (error) throw error
}

// ============================================
// Workshop People
// ============================================

export async function getPeople(projectId) {
  const { data, error } = await supabase
    .from('workshop_people')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createPerson(projectId, fields) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('workshop_people')
    .insert({ user_id, project_id: projectId, ...fields })
    .select().single()
  if (error) throw error
  return data
}

export async function updatePerson(id, fields) {
  const { error } = await supabase.from('workshop_people').update(fields).eq('id', id)
  if (error) throw error
}

export async function deletePerson(id) {
  const { error } = await supabase.from('workshop_people').delete().eq('id', id)
  if (error) throw error
}

// ============================================
// News Feed
// ============================================

export async function updateProjectTopics(projectId, topics) {
  const { error } = await supabase.from('projects').update({ news_topics: topics }).eq('id', projectId)
  if (error) throw error
}

export async function getSession() {
  return await supabase.auth.getSession()
}

export async function getUserProfile() {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user_id)
    .single()
  if (error) return { tier: 'free' }
  return data || { tier: 'free' }
}

export async function getTaskScratch(type, id) {
  const table = type === 'issue' ? 'issues' : 'test_cases'
  const { data, error } = await supabase
    .from(table)
    .select('scratch_notes, scratch_checklist')
    .eq('id', id)
    .single()
  if (error) return { scratch_notes: '', scratch_checklist: [] }
  return data || { scratch_notes: '', scratch_checklist: [] }
}

export async function getNewsCache(projectId) {
  const { data, error } = await supabase
    .from('news_cache')
    .select('*')
    .eq('project_id', projectId)
    .order('fetched_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data || []
}

export async function saveNewsCache(projectId, articles) {
  const user_id = await uid()
  // Clear old cache EXCEPT bookmarked articles
  await supabase.from('news_cache').delete().eq('project_id', projectId).eq('user_id', user_id).eq('bookmarked', false)
  // Insert new articles
  if (articles.length > 0) {
    const rows = articles.map(a => ({ user_id, project_id: projectId, title: a.title, url: a.url, source: a.source || '', summary: a.summary || '', topic_match: a.topic_match || '', topic_type: a.topic_type || 'custom', published_at: a.published_at || '' }))
    const { error } = await supabase.from('news_cache').insert(rows)
    if (error) throw error
  }
}

export async function toggleBookmark(id, bookmarked) {
  const { error } = await supabase.from('news_cache').update({ bookmarked }).eq('id', id)
  if (error) throw error
}

export async function deleteNewsItem(id) {
  const { error } = await supabase.from('news_cache').delete().eq('id', id)
  if (error) throw error
}