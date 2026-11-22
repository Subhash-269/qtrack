// Pure helpers for the Today focus chart: which time window a range covers, and how focus sessions
// fall into its slots (hours for "today", days otherwise). No React, so Vitest can cover it.

export const RANGES = ['today', 'week', 'month', 'custom']
export const NOT_FOCUS = ['waiting', 'interrupted', 'meeting'] // same rule as Focus stats
const DAY = 86400000

const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const isFocus = (s) => s.session_type === 'work' && !NOT_FOCUS.includes(s.subtype)

// The local-time window for a range: { start, end } as Dates (end exclusive) plus the day list.
export function rangeWindow(range, { now = new Date(), from, to } = {}) {
  const today = startOfDay(now)
  let first, last
  if (range === 'week') { first = new Date(today.getTime() - 6 * DAY); last = today }
  else if (range === 'month') { first = new Date(today.getFullYear(), today.getMonth(), 1); last = today }
  else if (range === 'custom' && from && to) {
    first = parseYmd(from <= to ? from : to); last = parseYmd(from <= to ? to : from)
    if ((last - first) / DAY > 366) first = new Date(last.getFullYear() - 1, last.getMonth(), last.getDate() + 1)
  }
  else { first = today; last = today }
  const days = []
  for (let d = new Date(first); d <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(new Date(d))
  return { start: first, end: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), days, hourly: range === 'today' || (range === 'custom' && days.length === 1) }
}

const hourLabel = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`)
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Group focus sessions into slots. projectIds = null means every project.
// Returns { slots: [{ key, label, title, seconds, byProject: {id: sec}, isNow }], totalSeconds,
//           pomodoros, byProject: {id: sec}, hourly }
export function bucketFocus(sessions, win, { projectIds = null, now = new Date() } = {}) {
  const pick = projectIds ? new Set(projectIds) : null
  const focus = sessions.filter(s => isFocus(s) && (!pick || pick.has(s.project_id)))
    .map(s => ({ ...s, at: new Date(s.completed_at) }))
    .filter(s => s.at >= win.start && s.at < win.end)

  let slots
  if (win.hourly) {
    // 6 am to 11 pm, stretched earlier if there was focus before 6
    const minHour = Math.min(6, ...focus.map(s => s.at.getHours()))
    slots = []
    for (let h = minHour; h <= 23; h++) slots.push({ key: h, label: h % 3 === 0 ? hourLabel(h) : '', title: `${hourLabel(h).replace('a', ' am').replace('p', ' pm')}–${hourLabel((h + 1) % 24).replace('a', ' am').replace('p', ' pm')}` })
    const sameDay = ymd(win.start) === ymd(now)
    slots.forEach(s => { s.isNow = sameDay && s.key === now.getHours() })
  } else {
    const n = win.days.length
    const step = n <= 7 ? 1 : Math.ceil(n / 5)
    slots = win.days.map((d, i) => ({
      key: ymd(d),
      label: n <= 7 ? `${WD[d.getDay()]} ${d.getDate()}` : (i % step === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= step / 2) ? `${MON[d.getMonth()]} ${d.getDate()}` : '',
      title: `${WD[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`,
      isNow: ymd(d) === ymd(now),
    }))
  }
  const index = new Map(slots.map((s, i) => [s.key, i]))
  slots.forEach(s => { s.seconds = 0; s.byProject = {} })
  const byProject = {}
  let total = 0, poms = 0
  for (const s of focus) {
    const i = index.get(win.hourly ? s.at.getHours() : ymd(s.at))
    if (i === undefined) continue
    const sec = s.duration_seconds || 0
    const slot = slots[i]
    slot.seconds += sec
    slot.byProject[s.project_id] = (slot.byProject[s.project_id] || 0) + sec
    byProject[s.project_id] = (byProject[s.project_id] || 0) + sec
    total += sec
    if (sec >= 20 * 60) poms++
  }
  return { slots, totalSeconds: total, pomodoros: poms, byProject, hourly: win.hourly }
}

// A round top for the y scale, and the two faint guide lines (half and full)
export function niceMax(maxSeconds, hourly) {
  if (hourly) return 3600
  const mins = maxSeconds / 60
  const steps = [60, 120, 180, 240, 360, 480, 600, 720, 960, 1440]
  return (steps.find(s => s >= mins) || Math.ceil(mins / 60) * 60) * 60
}

export function fmtDuration(seconds) {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${pad(m % 60)}m` : ''}`
}
