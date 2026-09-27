import { describe, expect, it } from 'vitest'
import { completionKey, currentWeekdays, dayProgress, routineMonthSummary, scheduledHabits, type Habit } from './dates'

const habit: Habit = { id: 'water', name: 'Drink water', weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-09-01' }
const workout: Habit = { id: 'gym', name: 'Train', weekdays: [0, 2, 4], startDate: '2026-09-01' }

describe('routine dates', () => {
  it('uses Monday-first weekdays and preserves past schedules after a change', () => {
    const changes = [{ habitId: 'gym', effectiveFrom: '2026-09-10', weekdays: [1, 3] }]
    expect(scheduledHabits('2026-09-02', [workout], changes).map((h) => h.id)).toEqual(['gym'])
    expect(scheduledHabits('2026-09-11', [workout], changes)).toEqual([])
    expect(scheduledHabits('2026-09-10', [workout], changes).map((h) => h.id)).toEqual(['gym'])
    expect(currentWeekdays(workout, changes, '2026-09-02')).toEqual([0, 2, 4])
    expect(currentWeekdays(workout, changes, '2026-09-10')).toEqual([1, 3])
  })
  it('counts completed days and missed past dates; today can remain pending', () => {
    const completions = { [completionKey('water', '2026-09-02')]: true }
    expect(dayProgress('2026-09-02', [habit, workout], [], completions, undefined, '2026-09-03')).toEqual({
      total: 2,
      done: 1,
      status: 'missed'
    })
    expect(dayProgress('2026-09-02', [habit], [], {}, undefined, '2026-09-02').status).toBe('pending')
    expect(
      dayProgress('2026-09-02', [habit], [], { [completionKey('water', '2026-09-02')]: true }, undefined, '2026-09-02')
        .status
    ).toBe('done')
  })
  it('keeps archived habits in prior months and legacy marks on unscheduled days', () => {
    const archived = { ...habit, archivedOn: '2026-09-03' }
    expect(scheduledHabits('2026-09-02', [archived], [])).toHaveLength(1)
    expect(scheduledHabits('2026-09-03', [archived], [])).toHaveLength(0)
    const entries = { '2026-09-03': { date: '2026-09-03', status: 'done' as const, note: 'Old mark' } }
    expect(routineMonthSummary('2026-09', [archived], [], {}, entries, '2026-09-05')).toEqual({ done: 1, missed: 2 })
  })
  it('does not count days before a habit starts or future dates as missed', () => {
    expect(routineMonthSummary('2026-09', [{ ...habit, startDate: '2026-09-26' }], [], {}, {}, '2026-09-27')).toEqual({
      done: 0,
      missed: 1
    })
  })
})
