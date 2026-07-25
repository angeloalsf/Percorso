import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addDays,
  addMonths,
  currentMonthKey,
  isoForDay,
  lastNMonthKeys,
  monthKey,
  monthPacing,
  parseISODate,
  shiftMonthKey,
  toISODate,
  todayISO
} from './dates'

describe('toISODate / parseISODate', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toISODate(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('round-trips through parseISODate using local date parts (no UTC shift)', () => {
    const iso = '2026-03-01'
    const d = parseISODate(iso)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(1)
    expect(toISODate(d)).toBe(iso)
  })
})

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-07-25', 3)).toBe('2026-07-28')
  })

  it('rolls over a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('rolls over a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('supports negative days', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('addMonths', () => {
  it('adds whole months, same day-of-month', () => {
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15')
  })

  it('rolls over a year boundary', () => {
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
  })

  it('clamps when the target month is shorter (JS Date overflow semantics)', () => {
    // Jan 31 + 1 month: Date.setMonth overflows Feb into Mar 2/3 rather than clamping.
    expect(addMonths('2026-01-31', 1)).toBe('2026-03-03')
  })
})

describe('monthKey', () => {
  it('extracts the YYYY-MM prefix', () => {
    expect(monthKey('2026-07-25')).toBe('2026-07')
  })
})

describe('isoForDay', () => {
  it('returns the given day when it exists in the month', () => {
    expect(isoForDay(2026, 0, 15)).toBe('2026-01-15')
  })

  it('clamps to the last day of a short month (e.g. day 31 in February)', () => {
    expect(isoForDay(2026, 1, 31)).toBe('2026-02-28')
  })

  it('clamps to the last day of February in a leap year', () => {
    expect(isoForDay(2028, 1, 31)).toBe('2028-02-29')
  })

  it('normalizes a month index outside 0-11 the same way `new Date` does', () => {
    // month0 = -1 means "one month before January" = previous December.
    expect(isoForDay(2026, -1, 15)).toBe('2025-12-15')
    expect(isoForDay(2026, 12, 15)).toBe('2027-01-15')
  })
})

describe('shiftMonthKey', () => {
  it('shifts forward within a year', () => {
    expect(shiftMonthKey('2026-07', 2)).toBe('2026-09')
  })

  it('shifts backward across a year boundary', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
  })

  it('shifts forward across a year boundary', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
  })

  it('is a no-op for delta 0', () => {
    expect(shiftMonthKey('2026-07', 0)).toBe('2026-07')
  })
})

describe('functions that read the current date', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 25)) // 2026-07-25
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('todayISO / currentMonthKey reflect the mocked system time', () => {
    expect(todayISO()).toBe('2026-07-25')
    expect(currentMonthKey()).toBe('2026-07')
  })

  it('monthPacing reports day-of-month, month length, and days remaining', () => {
    expect(monthPacing()).toEqual({ day: 25, total: 31, remaining: 6 })
  })

  it('lastNMonthKeys returns n ascending keys ending at the current month', () => {
    expect(lastNMonthKeys(3)).toEqual(['2026-05', '2026-06', '2026-07'])
  })

  it('lastNMonthKeys rolls over a year boundary', () => {
    vi.setSystemTime(new Date(2026, 1, 10)) // 2026-02-10
    expect(lastNMonthKeys(3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })
})
