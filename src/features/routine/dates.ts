import { monthDays } from '@/features/calendar/dates'
import { parseISODate, todayISO } from '@/lib/dates'
import type { DayEntry } from '@/features/calendar/store'

export interface Habit {
  id: string
  name: string
  weekdays: number[]
  startDate: string
  archivedOn?: string
}

export interface ScheduleChange {
  habitId: string
  effectiveFrom: string
  weekdays: number[]
}

export const completionKey = (habitId: string, date: string): string => `${habitId}|${date}`

/** Schedule versions only affect their own date and later dates. Monday is 0. */
export function scheduledHabits(date: string, habits: Habit[], changes: ScheduleChange[]): Habit[] {
  const weekday = (parseISODate(date).getDay() + 6) % 7
  return habits.filter((habit) => {
    if (habit.startDate > date || (habit.archivedOn && date >= habit.archivedOn)) return false
    const latest = changes
      .filter((change) => change.habitId === habit.id && change.effectiveFrom <= date)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
    return (latest?.weekdays ?? habit.weekdays).includes(weekday)
  })
}

export function currentWeekdays(habit: Habit, changes: ScheduleChange[], date = todayISO()): number[] {
  return (
    changes
      .filter((change) => change.habitId === habit.id && change.effectiveFrom <= date)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.weekdays ?? habit.weekdays
  )
}

export interface DayProgress {
  total: number
  done: number
  status: 'done' | 'missed' | 'pending' | 'none'
}

/** Legacy whole-day marks remain visible on dates without scheduled habits. */
export function dayProgress(
  date: string,
  habits: Habit[],
  changes: ScheduleChange[],
  completions: Record<string, boolean>,
  legacy?: DayEntry,
  today = todayISO()
): DayProgress {
  const scheduled = scheduledHabits(date, habits, changes)
  const total = scheduled.length
  const done = scheduled.filter((habit) => completions[completionKey(habit.id, date)]).length
  if (total === 0) return { total, done, status: date < today ? (legacy?.status ?? 'none') : 'none' }
  if (done === total) return { total, done, status: 'done' }
  return { total, done, status: date < today ? 'missed' : 'pending' }
}

export function routineMonthSummary(
  month: string,
  habits: Habit[],
  changes: ScheduleChange[],
  completions: Record<string, boolean>,
  legacy: Record<string, DayEntry>,
  today = todayISO()
): { done: number; missed: number } {
  let done = 0
  let missed = 0
  for (const date of monthDays(month)) {
    if (!date || date >= today) continue
    const status = dayProgress(date, habits, changes, completions, legacy[date], today).status
    if (status === 'done') done++
    if (status === 'missed') missed++
  }
  return { done, missed }
}
