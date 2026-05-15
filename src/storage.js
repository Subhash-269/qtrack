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

export async function createIssue(projectId, fileId, title, type, priority, description) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('issues')
    .insert({
      project_id: projectId,
      file_id: fileId,
      title, type, priority, description,
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

export async function createTestCase(projectId, fileId, title, precondition, steps) {
  const user_id = await uid()
  const { data, error } = await supabase
    .from('test_cases')
    .insert({
      project_id: projectId,
      file_id: fileId,
      title, precondition, steps,
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

export async function deleteTestCase(id) {
  const { error } = await supabase.from('test_cases').delete().eq('id', id)
  if (error) throw error
}