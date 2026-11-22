// Task statuses, shared by the web app, the MCP server and the tests.
// Tasks used to have bug-tracker statuses; LEGACY maps those to the current ones. The database was
// migrated (20261125000000) and a trigger maps legacy values on write, but code still normalizes on
// read so an old row or an old client never shows up as "not done".

export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'skipped']
export const TASK_DONE = ['done', 'skipped']
export const TASK_STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done', skipped: 'Skipped' }
export const LEGACY_TASK_STATUS = { open: 'todo', reopened: 'todo', review: 'in_progress', fixed: 'done', verified: 'done', wont_fix: 'skipped' }

export const normalizeTaskStatus = (s) => LEGACY_TASK_STATUS[s] || s
export const isTaskDone = (s) => TASK_DONE.includes(normalizeTaskStatus(s))
export const taskStatusLabel = (s) => TASK_STATUS_LABEL[normalizeTaskStatus(s)] || String(s || '').replace(/_/g, ' ')
