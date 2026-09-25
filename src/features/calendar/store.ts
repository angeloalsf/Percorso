import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { shiftMonthKey, todayISO } from '@/lib/dates'

export type DayStatus = 'done' | 'missed'
export interface DayEntry {
  date: string
  status: DayStatus
  note: string
}

interface CalendarState {
  entries: Record<string, DayEntry>
  loadedMonths: Record<string, boolean>
  loadingMonths: Record<string, boolean>
  errorMonths: Record<string, boolean>
  savingDate: string | null
  loadMonth: (month: string, userId: string) => Promise<void>
  saveDay: (date: string, status: DayStatus | null, note: string, userId: string) => Promise<boolean>
  reset: () => void
}

let generation = 0

export const useCalendarStore = create<CalendarState>((set, get) => ({
  entries: {},
  loadedMonths: {},
  loadingMonths: {},
  errorMonths: {},
  savingDate: null,
  loadMonth: async (month, userId) => {
    if (get().loadedMonths[month] || get().loadingMonths[month]) return
    const requestGeneration = generation
    set((s) => ({
      loadingMonths: { ...s.loadingMonths, [month]: true },
      errorMonths: { ...s.errorMonths, [month]: false }
    }))
    const { data, error } = await supabase
      .from('calendar_days')
      .select('date,status,note')
      .eq('user_id', userId)
      .gte('date', `${month}-01`)
      .lt('date', `${shiftMonthKey(month, 1)}-01`)
      .order('date')
    if (requestGeneration !== generation) return
    set((s) => ({
      entries: error
        ? s.entries
        : { ...s.entries, ...Object.fromEntries((data ?? []).map((row) => [row.date, row as DayEntry])) },
      loadingMonths: { ...s.loadingMonths, [month]: false },
      loadedMonths: { ...s.loadedMonths, [month]: !error },
      errorMonths: { ...s.errorMonths, [month]: Boolean(error) }
    }))
  },
  saveDay: async (date, status, note, userId) => {
    // The calendar uses local dates; check again here even if the button was enabled earlier.
    if (date >= todayISO() || get().savingDate || note.length > 500) return false
    const requestGeneration = generation
    set({ savingDate: date })
    const { error } = status
      ? await supabase
          .from('calendar_days')
          .upsert({ user_id: userId, date, status, note }, { onConflict: 'user_id,date' })
      : await supabase.from('calendar_days').delete().eq('user_id', userId).eq('date', date)
    if (requestGeneration !== generation) return false
    set((s) => {
      const entries = { ...s.entries }
      if (!error) {
        if (status) entries[date] = { date, status, note }
        else delete entries[date]
      }
      return { entries, savingDate: null }
    })
    return !error
  },
  reset: () => {
    generation++
    set({ entries: {}, loadedMonths: {}, loadingMonths: {}, errorMonths: {}, savingDate: null })
  }
}))
