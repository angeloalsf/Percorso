import { describe, expect, it } from 'vitest'
import { todayISO } from '@/lib/dates'
import { routineDate } from './routineDate'

describe('routineDate', () => {
  it('keeps a valid selected day and falls back for malformed dates', () => {
    expect(routineDate('2026-09-27')).toBe('2026-09-27')
    expect(routineDate('2026-09-31')).toBe(todayISO())
    expect(routineDate('2026-00-01')).toBe(todayISO())
    expect(routineDate(null)).toBe(todayISO())
  })
})
