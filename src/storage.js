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

export async function createProject(name) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, user_id })
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

export async function createIssue(projectId, fileId, title, type, priority, description, estimatedPomodoros, dueDate) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('issues')
    .insert({
      project_id: projectId,
      file_id: fileId,
      title, type, priority, description,
      estimated_pomodoros: estimatedPomodoros || 0,
      due_date: dueDate || null,
      user_id
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateIssueStatus(id, status) {
  const { error } = await supabase
    .from('issues')
    .update({ status })
    .eq('id', id)
  if (error) throw error
}

export async function updateIssuePlanning(id, estimatedPomodoros, dueDate) {
  const { error } = await supabase
    .from('issues')
    .update({ estimated_pomodoros: estimatedPomodoros, due_date: dueDate || null })
    .eq('id', id)
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

export async function createTestCase(projectId, fileId, title, precondition, steps, estimatedPomodoros, dueDate) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('test_cases')
    .insert({
      project_id: projectId,
      file_id: fileId,
      title, precondition, steps,
      estimated_pomodoros: estimatedPomodoros || 0,
      due_date: dueDate || null,
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

export async function saveFocusSession(projectId, issueId, testCaseId, sessionType, durationSeconds) {
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