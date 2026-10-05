// mockSupabase.js — in-browser stand-in for the Supabase client, used by demo mode.
// Implements just the query-builder, auth, storage and realtime surface that storage.js uses.
// Data lives in localStorage, so each visitor gets a private copy that survives reloads.
import { buildSeed, DEMO_USER } from './seed'

const DB_KEY = 'qtrack_demo_db_v1'
const today = () => new Date().toDateString()

function loadDb() {
  try {
    const saved = JSON.parse(localStorage.getItem(DB_KEY))
    // Reseed each day so relative dates ("due tomorrow", this week's chart) stay fresh
    if (saved && saved.seededOn === today()) return saved
  } catch { /* fall through to seed */ }
  return { seededOn: today(), tables: buildSeed() }
}

let db = loadDb()
const persist = () => { try { localStorage.setItem(DB_KEY, JSON.stringify(db)) } catch { /* storage full or blocked */ } }
persist()

export function resetDemo() { db = { seededOn: today(), tables: buildSeed() }; persist() }

const table = (name) => (db.tables[name] ||= [])
const clone = (v) => JSON.parse(JSON.stringify(v))
const uuid = () => crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`

// Columns the real schema fills in with defaults
const DEFAULTS = {
  projects: () => ({ type: 'project', settings: null, news_topics: [] }),
  issues: () => ({ status: 'open', resolved_at: null, scratch_notes: '', scratch_checklist: [] }),
  test_cases: () => ({ status: 'not_run', last_run: null, steps: [], scratch_notes: '', scratch_checklist: [] }),
  focus_sessions: (r) => ({ completed_at: new Date().toISOString(), started_at: new Date(Date.now() - (r.duration_seconds || 0) * 1000).toISOString() }),
  notes: () => ({ pinned: false, updated_at: new Date().toISOString(), tags: [] }),
  meetings: () => ({ attended: false, cancelled: false, meeting_notes: '', rating: 0 }),
  news_cache: () => ({ bookmarked: false, fetched_at: new Date().toISOString() }),
  workshop_people: () => ({ follow_up_done: false }),
}
const withDefaults = (name, row) => ({ id: uuid(), created_at: new Date().toISOString(), ...(DEFAULTS[name]?.(row) || {}), ...row })

// Foreign keys used by embedded filters like .eq('board_columns.project_id', x)
const JOIN_KEYS = { board_columns: 'column_id' }
function readField(tableName, row, key) {
  if (!key.includes('.')) return row[key]
  const [joined, col] = key.split('.')
  const parent = table(joined).find(p => p.id === row[JOIN_KEYS[joined] || `${joined}_id`])
  return parent?.[col]
}

function compare(a, b) {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a < b ? -1 : a > b ? 1 : 0
}

class Query {
  constructor(name) { this.name = name; this.op = 'select'; this.filters = []; this.orders = []; this.max = null; this.mode = 'many'; this.returning = false }

  select() { this.returning = true; return this }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this }
  update(fields) { this.op = 'update'; this.payload = fields; return this }
  upsert(row, opts = {}) { this.op = 'upsert'; this.payload = row; this.conflict = opts.onConflict || 'id'; return this }
  delete() { this.op = 'delete'; return this }

  eq(k, v) { this.filters.push(r => readField(this.name, r, k) === v); return this }
  neq(k, v) { this.filters.push(r => readField(this.name, r, k) !== v); return this }
  gte(k, v) { this.filters.push(r => readField(this.name, r, k) != null && compare(readField(this.name, r, k), v) >= 0); return this }
  lte(k, v) { this.filters.push(r => readField(this.name, r, k) != null && compare(readField(this.name, r, k), v) <= 0); return this }
  in(k, vs) { this.filters.push(r => vs.includes(readField(this.name, r, k))); return this }
  order(k, { ascending = true } = {}) { this.orders.push([k, ascending]); return this }
  limit(n) { this.max = n; return this }
  single() { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybe'; return this }

  matches(r) { return this.filters.every(f => f(r)) }

  run() {
    const rows = table(this.name)
    let out = []
    if (this.op === 'select') {
      out = rows.filter(r => this.matches(r))
      if (this.orders.length) out.sort((a, b) => {
        for (const [k, asc] of this.orders) { const c = compare(a[k], b[k]); if (c) return asc ? c : -c }
        return 0
      })
      if (this.max != null) out = out.slice(0, this.max)
    } else if (this.op === 'insert') {
      out = [].concat(this.payload).map(r => withDefaults(this.name, r))
      rows.push(...out)
    } else if (this.op === 'update') {
      out = rows.filter(r => this.matches(r))
      out.forEach(r => Object.assign(r, this.payload))
    } else if (this.op === 'upsert') {
      const existing = rows.find(r => r[this.conflict] === this.payload[this.conflict])
      if (existing) out = [Object.assign(existing, this.payload)]
      else { out = [withDefaults(this.name, this.payload)]; rows.push(...out) }
    } else if (this.op === 'delete') {
      out = rows.filter(r => this.matches(r))
      db.tables[this.name] = rows.filter(r => !out.includes(r))
    }
    if (this.op !== 'select') persist()

    if (this.op !== 'select' && !this.returning) return { data: null, error: null }
    if (this.mode === 'single') {
      return out.length === 1 ? { data: clone(out[0]), error: null } : { data: null, error: { code: 'PGRST116', message: 'No rows found' } }
    }
    if (this.mode === 'maybe') return { data: out[0] ? clone(out[0]) : null, error: null }
    return { data: clone(out), error: null }
  }

  then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject) }
}

// Uploaded files only exist for this page load; seeded docs are served from /public/demo
const blobs = {}
const session = { user: DEMO_USER, access_token: 'demo' }

export function exitDemo() { window.location.href = '/' }

export const mockSupabase = {
  from: (name) => new Query(name),
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user: DEMO_USER }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => { exitDemo(); return { error: null } },
  },
  storage: {
    from: () => ({
      upload: async (path, file) => { blobs[path] = URL.createObjectURL(file); return { data: { path }, error: null } },
      createSignedUrl: async (path) => ({ data: { signedUrl: blobs[path] || `/demo/${path}` }, error: null }),
      remove: async () => ({ data: null, error: null }),
    }),
  },
  channel() { const ch = { on: () => ch, subscribe: () => ch }; return ch },
  removeChannel() {},
}
