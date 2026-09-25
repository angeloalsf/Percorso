import { toISODate } from '@/lib/dates'
import type { DayEntry } from './store'

/** Monday-first grid; leading empty cells align the first weekday. */
export function monthDays(month: string): (string | null)[] {
  const [year, monthNumber] = month.split('-').map(Number)
  const start = new Date(year, monthNumber - 1, 1)
  const offset = (start.getDay() + 6) % 7
  const count = new Date(year, monthNumber, 0).getDate()
  return [
    ...Array<string | null>(offset).fill(null),
    ...Array.from({ length: count }, (_, i) => toISODate(new Date(year, monthNumber - 1, i + 1)))
  ]
}

/** Blank dates do not count as missed goals. */
export function monthSummary(month: string, entries: Record<string, DayEntry>) {
  const marked = Object.values(entries).filter((entry) => entry.date.startsWith(`${month}-`))
  return {
    done: marked.filter((entry) => entry.status === 'done').length,
    missed: marked.filter((entry) => entry.status === 'missed').length
  }
}
