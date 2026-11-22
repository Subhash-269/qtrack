// Today focus chart: range windows and how sessions land in hour / day slots.
import { describe, it, expect } from 'vitest'
import { rangeWindow, bucketFocus, niceMax, fmtDuration, ymd } from '../src/components/focusChartData.js'

const now = new Date(2026, 10, 22, 15, 30) // Sun Nov 22 2026, 3:30 pm local
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).toISOString()
const s = (completed_at, mins, project_id = 'a', extra = {}) => ({ completed_at, duration_seconds: mins * 60, session_type: 'work', subtype: 'focus', project_id, ...extra })

describe('rangeWindow', () => {
  it('today is one hourly day; week is the last 7 days; month starts on the 1st', () => {
    expect(rangeWindow('today', { now })).toMatchObject({ hourly: true })
    expect(rangeWindow('today', { now }).days.map(ymd)).toEqual(['2026-11-22'])
    const w = rangeWindow('week', { now })
    expect(w.days.map(ymd)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
    expect(w.hourly).toBe(false)
    expect(rangeWindow('month', { now }).days).toHaveLength(22)
  })

  it('custom takes the dates in either order; a single day is hourly', () => {
    expect(rangeWindow('custom', { now, from: '2026-11-10', to: '2026-11-01' }).days).toHaveLength(10)
    expect(rangeWindow('custom', { now, from: '2026-11-05', to: '2026-11-05' }).hourly).toBe(true)
  })
})

describe('bucketFocus', () => {
  it('puts focus in the hour it ended and leaves out breaks, pauses and meetings', () => {
    const win = rangeWindow('today', { now })
    const b = bucketFocus([
      s(at(22, 9, 50), 25), s(at(22, 10, 20), 25, 'b'), s(at(22, 10, 50), 15),
      s(at(22, 11), 5, 'a', { session_type: 'short_break' }), s(at(22, 12), 10, 'a', { subtype: 'waiting' }), s(at(22, 13), 30, 'a', { subtype: 'meeting' }),
      s(at(21, 10), 25), // yesterday
    ], win, { now })
    expect(b.slots[0].key).toBe(6)
    const ten = b.slots.find(x => x.key === 10)
    expect(ten.seconds).toBe(40 * 60)
    expect(ten.byProject).toEqual({ a: 15 * 60, b: 25 * 60 })
    expect(b.totalSeconds).toBe(65 * 60)
    expect(b.pomodoros).toBe(2)
    expect(b.slots.find(x => x.key === 15).isNow).toBe(true)
  })

  it('stretches the hours earlier when there was focus before 6 am', () => {
    const b = bucketFocus([s(at(22, 4, 30), 25)], rangeWindow('today', { now }), { now })
    expect(b.slots[0].key).toBe(4)
  })

  it('filters to chosen projects and sums per day for a week', () => {
    const b = bucketFocus([s(at(16, 9), 25, 'a'), s(at(16, 10), 25, 'b'), s(at(22, 9), 50, 'a')], rangeWindow('week', { now }), { projectIds: ['a'], now })
    expect(b.slots.map(x => x.seconds / 60)).toEqual([25, 0, 0, 0, 0, 0, 50])
    expect(b.slots[0].label).toBe('Mon 16')
    expect(b.slots[6].isNow).toBe(true)
    expect(b.byProject).toEqual({ a: 75 * 60 })
  })
})

describe('scale and labels', () => {
  it('rounds the top of the scale and formats durations', () => {
    expect(niceMax(50 * 60, true)).toBe(3600)
    expect(niceMax(150 * 60, false)).toBe(180 * 60)
    expect(fmtDuration(200 * 60)).toBe('3h 20m')
    expect(fmtDuration(120 * 60)).toBe('2h')
    expect(fmtDuration(25 * 60)).toBe('25m')
  })
})
