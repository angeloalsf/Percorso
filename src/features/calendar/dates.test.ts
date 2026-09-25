import { describe, expect, it } from 'vitest'
import { monthDays, monthSummary } from './dates'

describe('daily calendar', () => {
  it('aligns Monday-first months and includes leap day', () => {
    const days = monthDays('2024-02')
    expect(days.slice(0, 4)).toEqual([null, null, null, '2024-02-01'])
    expect(days.at(-1)).toBe('2024-02-29')
    expect(monthDays('2025-02').at(-1)).toBe('2025-02-28')
  })

  it('counts only marked dates within the visible month', () => {
    const entries = {
      '2026-09-01': { date: '2026-09-01', status: 'done' as const, note: '' },
      '2026-09-02': { date: '2026-09-02', status: 'missed' as const, note: 'Exercise' },
      '2026-08-31': { date: '2026-08-31', status: 'missed' as const, note: '' }
    }
    expect(monthSummary('2026-09', entries)).toEqual({ done: 1, missed: 1 })
  })
})
