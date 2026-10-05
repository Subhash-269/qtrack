// seed.js — sample data for demo mode. Dates are relative to "now" so the demo always looks current.

export const DEMO_USER = { id: 'demo-user', email: 'demo@qtrack.app' }
const user_id = DEMO_USER.id

const at = (daysAgo, hour = 10, min = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(hour, min, 0, 0); return d.toISOString() }
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const tags = (...t) => JSON.stringify(t)

let n = 0
const id = (p) => `${p}-${++n}`

export function buildSeed() {
  n = 0
  const T = { projects: [], files: [], issues: [], test_cases: [], issue_test_links: [], focus_sessions: [], task_queue: [], meetings: [], notes: [], study_docs: [], study_highlights: [], board_columns: [], board_cards: [], workshop_people: [], news_cache: [], timer_state: [], user_profiles: [{ id: user_id, tier: 'free', settings: null }] }
  T.timer_state.push({ id: 'timer', user_id, state: 'idle', session_type: 'work', sessions_completed: 0, total_seconds: 1500, remaining_seconds: 1500, started_at: null, task_type: null, task_id: null, study_topic: '', media_history: [
    { embed: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ?utm_source=generator&theme=0', type: 'spotify', sub: 'playlist', name: 'Deep Focus' },
    { embed: 'https://www.youtube.com/embed/jfKfPfyJRdk', type: 'youtube', sub: 'video', name: 'Lofi beats' },
  ] })
  const row = (t, r) => { const x = { id: id(t), user_id, created_at: at(14), ...r }; T[t].push(x); return x }

  // ============================================
  // Project 1 — a developer side project
  // ============================================
  const app = row('projects', { name: 'Weather App', type: 'project', created_at: at(30) })
  const P = app.id
  const f = {
    api: row('files', { project_id: P, name: 'src/api/forecast.js', category: 'api' }),
    cache: row('files', { project_id: P, name: 'src/lib/cache.js', category: 'utils' }),
    picker: row('files', { project_id: P, name: 'src/components/CityPicker.jsx', category: 'other' }),
    units: row('files', { project_id: P, name: 'src/lib/units.js', category: 'transform' }),
    cfg: row('files', { project_id: P, name: 'vite.config.js', category: 'config' }),
    readme: row('files', { project_id: P, name: 'README.md', category: 'other' }),
  }
  const issue = (r) => row('issues', { project_id: P, type: 'bug', priority: 'medium', status: 'open', description: '', estimated_pomodoros: 2, due_date: null, repo_name: 'weather-app', branch_name: 'main', meeting_tag: null, resolved_at: null, scratch_notes: '', scratch_checklist: [], ...r })
  const i1 = issue({ title: 'Hourly forecast shows UTC instead of local time', file_id: f.api.id, priority: 'critical', status: 'in_progress', branch_name: 'feat/hourly-forecast', due_date: day(1), estimated_pomodoros: 3, meeting_tag: tags('Sprint sync'), description: 'API returns `dt` in UTC seconds. We render it without applying the city timezone offset.', scratch_checklist: [{ text: 'Reproduce with Tokyo', done: true }, { text: 'Use timezone_offset from response', done: false }, { text: 'Add test for DST boundary', done: false }], created_at: at(3) })
  const i2 = issue({ title: 'Cache never expires when offline', file_id: f.cache.id, priority: 'high', due_date: day(3), created_at: at(4) })
  const i3 = issue({ title: 'Add °C / °F toggle to settings', file_id: f.units.id, type: 'todo', priority: 'medium', branch_name: 'feat/hourly-forecast', due_date: day(5), created_at: at(5) })
  const i4 = issue({ title: 'City search drops results with accents (São Paulo)', file_id: f.picker.id, priority: 'high', created_at: at(6) })
  const i5 = issue({ title: 'Write README setup section', type: 'todo', priority: 'low', file_id: f.readme.id, created_at: at(2) })
  issue({ title: 'Rate-limit forecast requests to 1/min per city', file_id: f.api.id, type: 'todo', priority: 'medium', status: 'fixed', resolved_at: at(2, 16), meeting_tag: tags('Sprint sync'), created_at: at(9) })
  issue({ title: 'Wind speed rounded to 0 for light breeze', file_id: f.units.id, priority: 'medium', status: 'verified', resolved_at: at(3, 11), meeting_tag: tags('Sprint sync'), created_at: at(10) })
  issue({ title: 'Upgrade to Vite 8', file_id: f.cfg.id, type: 'todo', priority: 'low', status: 'fixed', resolved_at: at(1, 15), created_at: at(8) })
  issue({ title: 'Loading spinner flashes on cached data', file_id: f.picker.id, priority: 'low', status: 'fixed', branch_name: 'feat/hourly-forecast', resolved_at: at(0, 9, 30), created_at: at(4) })

  const test = (r) => row('test_cases', { project_id: P, precondition: '', estimated_pomodoros: 1, due_date: null, repo_name: 'weather-app', branch_name: 'main', meeting_tag: null, status: 'not_run', last_run: null, scratch_notes: '', scratch_checklist: [], ...r })
  const t1 = test({ title: 'Hourly forecast renders in city local time', file_id: f.api.id, branch_name: 'feat/hourly-forecast', precondition: 'Device timezone set to America/New_York', status: 'fail', last_run: at(0, 9), steps: [{ step: 'Search for "Tokyo"', expected: 'Tokyo forecast loads' }, { step: 'Open the hourly tab', expected: 'First slot shows the current Tokyo hour' }, { step: 'Compare with timeanddate.com', expected: 'Times match' }] })
  const t2 = test({ title: 'Offline mode serves cached forecast', file_id: f.cache.id, precondition: 'Forecast for Boston loaded once', status: 'pass', last_run: at(1, 14), steps: [{ step: 'Disable network in DevTools', expected: 'App stays usable' }, { step: 'Reload the page', expected: 'Boston forecast shows with "offline" badge' }] })
  test({ title: 'Unit toggle converts all values', file_id: f.units.id, status: 'not_run', steps: [{ step: 'Switch to °F', expected: 'Temperatures convert' }, { step: 'Check wind speed', expected: 'Shown in mph' }] })
  test({ title: 'Search handles accented city names', file_id: f.picker.id, status: 'blocked', last_run: at(2, 11), steps: [{ step: 'Type "Sao Paulo"', expected: 'São Paulo appears' }] })
  test({ title: 'Rate limiter rejects 2nd request within a minute', file_id: f.api.id, status: 'pass', last_run: at(2, 17), steps: [{ step: 'Request Boston twice', expected: 'Second call served from cache' }] })
  row('issue_test_links', { issue_id: i1.id, test_case_id: t1.id })
  row('issue_test_links', { issue_id: i2.id, test_case_id: t2.id })

  row('task_queue', { project_id: P, item_type: 'issue', item_id: i1.id, position: 0 })
  row('task_queue', { project_id: P, item_type: 'issue', item_id: i2.id, position: 1 })
  row('task_queue', { project_id: P, item_type: 'test', item_id: t1.id, position: 2 })
  row('task_queue', { project_id: P, item_type: 'issue', item_id: i3.id, position: 3 })

  // A week of sessions so the dashboard chart has shape
  const session = (pid, daysAgo, hour, mins, r = {}) => {
    const end = new Date(at(daysAgo, hour)); end.setMinutes(end.getMinutes() + mins)
    row('focus_sessions', { project_id: pid, issue_id: null, test_case_id: null, session_type: 'work', subtype: 'focus', study_topic: '', duration_seconds: mins * 60, started_at: at(daysAgo, hour), completed_at: end.toISOString(), ...r })
  }
  const week = [[6, [i4, i4]], [5, [i2, i3, i3]], [4, [i1, i1, i2, i4]], [3, [i1, i5]], [2, [i2, i2, i1]], [1, [i3, i1, i1, i2]], [0, [i1, i1]]]
  week.forEach(([d, items]) => items.forEach((it, k) => session(P, d, 9 + k, 25, { issue_id: it.id })))
  ;[5, 3, 1, 0].forEach(d => session(P, d, 14, 30, { subtype: 'meeting' }))
  session(P, 0, 13, 25, { test_case_id: t1.id })
  session(P, 2, 15, 12, { subtype: 'waiting' })

  // Meetings — the agenda pulls in tagged items resolved since the last attended sync
  row('meetings', { project_id: P, title: 'Sprint sync', meeting_date: day(-7), start_time: '10:00', end_time: '10:30', attended: true, meeting_notes: 'Agreed to ship hourly forecast before the unit toggle.\n? Do we need a paid API tier for hourly data?' })
  row('meetings', { project_id: P, title: 'Sprint sync', meeting_date: day(0), start_time: '16:00', end_time: '16:30' })
  row('meetings', { project_id: P, title: 'Sprint sync', meeting_date: day(7), start_time: '10:00', end_time: '10:30' })
  row('meetings', { project_id: P, title: 'Design review', meeting_date: day(2), start_time: '13:00', end_time: '14:00' })
  row('meetings', { project_id: P, title: 'Design review', meeting_date: day(-12), start_time: '13:00', end_time: '14:00', attended: true })

  const note = (pid, r) => row('notes', { project_id: pid, title: '', content: '', category: 'scratch', linked_issue_id: null, linked_file_id: null, linked_test_id: null, code_lang: '', meeting_tag: null, repo_name: '', is_study: false, tags: [], topic: '', pinned: false, updated_at: at(1), ...r })
  note(P, { title: 'Caching strategy for forecast API', category: 'decision', pinned: true, repo_name: 'weather-app', linked_file_id: f.cache.id, updated_at: at(1, 18), content: `Decision: cache forecasts per city for 10 minutes, keyed by lat/lon rounded to 2 decimals.

Why: the free API tier allows 1,000 calls/day, and the weather doesn't change faster than this. When offline, serve the stale entry with an "offline" badge.

\`\`\`js
export async function getForecast(lat, lon) {
  const key = \`\${lat.toFixed(2)},\${lon.toFixed(2)}\`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TEN_MIN) return hit.data
  const data = await fetchForecast(lat, lon)
  cache.set(key, { data, at: Date.now() })
  return data
}
\`\`\`` })
  note(P, { title: 'Timezone bug — investigation', category: 'investigation', linked_issue_id: i1.id, repo_name: 'weather-app', updated_at: at(0, 10), content: `- API "dt" is UTC seconds; the response also includes timezone_offset
- We render with getHours(), which uses the device timezone
- Fix: shift by the offset and read UTC hours

\`\`\`js
const localHour = new Date((dt + timezone_offset) * 1000).getUTCHours()
\`\`\`

? Does the offset change across DST within a 48h forecast?` })
  note(P, { title: 'Sprint sync notes', category: 'meeting', meeting_tag: tags('Sprint sync'), updated_at: at(7, 11), content: `Shipped: rate limiter, wind rounding fix
Next: hourly forecast, offline cache
! Hourly view is the priority for the beta` })

  const cols = ['Ideas', 'This week', 'Done'].map((name, position) => row('board_columns', { project_id: P, name, position }))
  ;[[0, 'Radar map layer', 'blue'], [0, 'Severe weather push alerts', 'pink'], [0, 'Widget for home screen', 'purple'], [1, 'Hourly forecast', 'yellow'], [1, 'Offline cache', 'green'], [2, 'Rate limiting', 'green']]
    .forEach(([c, text, color], position) => row('board_cards', { column_id: cols[c].id, text, color, position }))

  // ============================================
  // Project 2 — a student's course
  // ============================================
  const cs = row('projects', { name: 'CS 5800 · Algorithms', type: 'project', created_at: at(29) })
  const C = cs.id
  const todo = (r) => row('issues', { project_id: C, file_id: null, type: 'todo', priority: 'medium', status: 'open', description: '', estimated_pomodoros: 2, due_date: null, repo_name: '', branch_name: '', meeting_tag: null, resolved_at: null, scratch_notes: '', scratch_checklist: [], ...r })
  const ps3 = todo({ title: 'Problem set 3 — shortest paths', priority: 'high', due_date: day(2), estimated_pomodoros: 6, scratch_checklist: [{ text: 'Q1 Dijkstra trace', done: true }, { text: 'Q2 negative cycles proof', done: false }, { text: 'Q3 Floyd-Warshall', done: false }] })
  todo({ title: 'Read CLRS ch. 15 (DP) before lecture', due_date: day(4), estimated_pomodoros: 3 })
  todo({ title: 'Midterm review sheet', priority: 'critical', due_date: day(9), estimated_pomodoros: 8 })
  todo({ title: 'Problem set 2 — graph traversal', status: 'fixed', resolved_at: at(5, 20) })
  row('task_queue', { project_id: C, item_type: 'issue', item_id: ps3.id, position: 0 })

  const GRAPHS = 'Graph Algorithms', DP = 'Dynamic Programming'
  ;[[6, GRAPHS], [5, GRAPHS], [4, DP], [3, GRAPHS], [2, GRAPHS], [1, DP], [0, GRAPHS]].forEach(([d, topic], k) => {
    session(C, d, 19, 25, { subtype: 'study', study_topic: topic })
    if (k % 2 === 0) session(C, d, 20, 25, { subtype: 'study', study_topic: topic })
  })
  session(C, 1, 16, 25, { issue_id: ps3.id })

  const doc = row('study_docs', { project_id: C, topic: GRAPHS, name: 'Shortest Paths — Lecture Notes.pdf', storage_path: 'shortest-paths.pdf', size_bytes: 3200, created_at: at(6) })
  const hl = [
    { text: 'optimal substructure property: any subpath of a shortest path is itself a shortest path', color: 'amber', rects: [{ x: 0.3233, y: 0.2793, w: 0.5445, h: 0.0191 }, { x: 0.1275, y: 0.2995, w: 0.1189, h: 0.0191 }], note: 'Why greedy works here — same idea shows up in DP.' },
    { text: 'Once a vertex is extracted, its distance is final.', color: 'teal', rects: [{ x: 0.2603, y: 0.6, w: 0.3696, h: 0.0191 }], note: 'Breaks with negative edges → use Bellman-Ford.' },
    { text: 'proves the graph contains a negative-weight cycle', color: 'pink', rects: [{ x: 0.512, y: 0.7363, w: 0.3527, h: 0.0191 }, { x: 0.1275, y: 0.7565, w: 0.0409, h: 0.0191 }], note: 'PS3 Q2 asks to prove this — V-th pass still relaxes ⇒ cycle.' },
  ]
  hl.forEach((h, k) => {
    const nt = note(C, { title: h.text.slice(0, 50), content: `> ${h.text}\n\n${h.note}`, is_study: true, topic: GRAPHS, updated_at: at(k + 1, 21) })
    row('study_highlights', { doc_id: doc.id, topic: GRAPHS, page: 1, text: h.text, rects: h.rects, color: h.color, note_id: nt.id })
  })
  note(C, { title: "Dijkstra's algorithm", is_study: true, topic: GRAPHS, category: 'investigation', pinned: true, updated_at: at(0, 20), content: `## Dijkstra — cheat sheet
Non-negative weights only. **O((V + E) log V)** with a binary heap.

\`\`\`mermaid
graph LR
  A((A)) -- 4 --> B((B))
  A -- 1 --> C((C))
  C -- 2 --> B
  B -- 5 --> D((D))
  C -- 8 --> D
\`\`\`

Shortest A→D = A→C→B→D = **8**

\`\`\`python
import heapq

def dijkstra(graph, src):
    dist = {v: float("inf") for v in graph}
    dist[src] = 0
    pq = [(0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in graph[u]:
            if d + w < dist[v]:
                dist[v] = d + w
                heapq.heappush(pq, (dist[v], v))
    return dist
\`\`\`` })
  note(C, { title: 'Knapsack — recurrence', is_study: true, topic: DP, updated_at: at(1, 21), content: `**K(i, w) = max( K(i-1, w), vᵢ + K(i-1, w - wᵢ) )**

| item | weight | value |
|---|---|---|
| 1 | 2 | 3 |
| 2 | 3 | 4 |
| 3 | 4 | 5 |

Table is (n+1) × (W+1) → **O(nW)** pseudo-polynomial.` })
  note(C, { title: 'Office hours — questions', category: 'meeting', meeting_tag: tags('Office hours'), updated_at: at(2, 15), content: `? Is Bellman-Ford's V-1 bound tight?
? Can Dijkstra work with a negative edge if no negative cycle?
! Prof: midterm covers through DP` })

  row('meetings', { project_id: C, title: 'Lecture', meeting_date: day(1), start_time: '11:45', end_time: '13:25' })
  row('meetings', { project_id: C, title: 'Lecture', meeting_date: day(-2), start_time: '11:45', end_time: '13:25', attended: true })
  row('meetings', { project_id: C, title: 'Office hours', meeting_date: day(3), start_time: '15:00', end_time: '16:00' })
  row('meetings', { project_id: C, title: 'Study group', meeting_date: day(0), start_time: '18:00', end_time: '19:00' })

  // ============================================
  // Project 3 — a conference (workshop mode)
  // ============================================
  const conf = row('projects', { name: 'DevConf Boston', type: 'workshop', created_at: at(28) })
  const W = conf.id
  const s1 = row('meetings', { project_id: W, title: 'Keynote: The Next Decade of the Web', meeting_date: day(-1), start_time: '09:00', end_time: '10:00', speaker: 'Dana Whitfield', track: 'Main stage', attended: true, rating: 5, meeting_notes: '! Edge rendering is becoming the default\n? How does this affect SSR caching?' })
  row('meetings', { project_id: W, title: 'Scaling Postgres Without Pain', meeting_date: day(-1), start_time: '11:00', end_time: '11:45', speaker: 'Marco Ruiz', track: 'Backend', attended: true, rating: 4, meeting_notes: '! Partial indexes for soft-deleted rows\n! pg_stat_statements first, tuning second' })
  row('meetings', { project_id: W, title: 'Accessible Design Systems', meeting_date: day(0), start_time: '14:00', end_time: '14:45', speaker: 'Priya Natarajan', track: 'Frontend' })
  row('meetings', { project_id: W, title: 'Workshop: Building with LLM Agents', meeting_date: day(0), start_time: '16:00', end_time: '17:30', speaker: 'Sam Okafor', track: 'Workshops' })
  row('workshop_people', { project_id: W, name: 'Marco Ruiz', role: 'Staff Engineer', company: 'Example Data Co.', email: '', context: 'Speaker — Postgres talk. Offered to share slides.', follow_up: 'Ask for slides + index checklist', follow_up_done: false, session_id: null })
  row('workshop_people', { project_id: W, name: 'Alex Chen', role: 'Frontend Dev', company: 'Sample Labs', email: '', context: 'Met at lunch, building a design system too', follow_up: 'Connect on LinkedIn', follow_up_done: true, session_id: s1.id })
  note(W, { title: 'Day 1 takeaways', category: 'meeting', updated_at: at(1, 18), content: `- Edge rendering is mainstream now
- Partial indexes for soft deletes — try in Weather App
- Measure before tuning: pg_stat_statements
★ Accessibility belongs in the design system, not each app
! Email Marco for the Postgres slides
! Try partial indexes on the cache table` })

  return T
}
