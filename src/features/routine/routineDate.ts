import { parseISODate, toISODate, todayISO } from '@/lib/dates'

export function routineDate(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return todayISO()
  return toISODate(parseISODate(value)) === value ? value : todayISO()
}
