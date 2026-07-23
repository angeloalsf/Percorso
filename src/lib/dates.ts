/**
 * All Percorso dates are stored as local calendar dates in `YYYY-MM-DD`
 * form. Helpers here deliberately avoid UTC parsing pitfalls by working
 * with local date parts only — never `new Date(isoString)` on a
 * date-only string.
 */

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function addMonths(iso: string, months: number): string {
  const d = parseISODate(iso)
  d.setMonth(d.getMonth() + months)
  return toISODate(d)
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** ISO date for `day` of the given year / 0-based month, clamped to the month's length. */
export function isoForDay(year: number, month0: number, day: number): string {
  const lastDay = new Date(year, month0 + 1, 0).getDate()
  return toISODate(new Date(year, month0, Math.min(day, lastDay)))
}

/** Shift a `YYYY-MM` month key by `delta` months. */
export function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, (m ?? 1) - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** How far through the current calendar month we are (local time). */
export function monthPacing(): { day: number; total: number; remaining: number } {
  const now = new Date()
  const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const day = now.getDate()
  return { day, total, remaining: total - day }
}

export function currentMonthKey(): string {
  return monthKey(todayISO())
}

/** Last `n` month keys ending with the current month (ascending). */
export function lastNMonthKeys(n: number): string[] {
  const now = new Date()
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}
