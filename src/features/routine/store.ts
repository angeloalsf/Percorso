import type { PostgrestError } from '@supabase/supabase-js'
import { create } from 'zustand'
import { shiftMonthKey, todayISO } from '@/lib/dates'
import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { completionKey, scheduledHabits, type Habit, type ScheduleChange } from './dates'

interface RoutineState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  habits: Habit[]
  changes: ScheduleChange[]
  completions: Record<string, boolean>
  loadedMonths: Record<string, boolean>
  loadingMonths: Record<string, boolean>
  errorMonths: Record<string, boolean>
  savingKey: string | null
  load: (userId: string) => Promise<void>
  loadMonth: (month: string, userId: string) => Promise<void>
  addHabit: (name: string, weekdays: number[], userId: string) => Promise<boolean>
  renameHabit: (habitId: string, name: string, userId: string) => Promise<boolean>
  changeSchedule: (habitId: string, weekdays: number[], userId: string) => Promise<boolean>
  archiveHabit: (habitId: string, userId: string) => Promise<boolean>
  toggleCompletion: (habitId: string, date: string, userId: string) => Promise<boolean>
  reset: () => void
}

const validDays = (days: number[]) =>
  days.length > 0 && days.length <= 7 && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
let generation = 0

async function fetchMonthCompletions(month: string, userId: string): Promise<{
  data: { habit_id: string; date: string }[]
  error: PostgrestError | null
}> {
  const rows: { habit_id: string; date: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('habit_completions')
      .select('habit_id,date')
      .eq('user_id', userId)
      .gte('date', `${month}-01`)
      .lt('date', `${shiftMonthKey(month, 1)}-01`)
      .order('date')
      .order('habit_id')
      .range(from, from + 999)
    if (error) return { data: rows, error }
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return { data: rows, error: null }
  }
}

export const useRoutineStore = create<RoutineState>((set, get) => ({
  status: 'idle',
  habits: [],
  changes: [],
  completions: {},
  loadedMonths: {},
  loadingMonths: {},
  errorMonths: {},
  savingKey: null,
  load: async (userId) => {
    if (get().status === 'ready' || get().status === 'loading') return
    const request = generation
    set({ status: 'loading' })
    const [habits, changes] = await Promise.all([
      supabase
        .from('habits')
        .select('id,name,weekdays,start_date,archived_on')
        .eq('user_id', userId)
        .order('created_at'),
      supabase.from('habit_schedule_changes').select('habit_id,effective_from,weekdays').eq('user_id', userId)
    ])
    if (request !== generation) return
    if (habits.error || changes.error) {
      set({ status: 'error' })
      return
    }
    set({
      status: 'ready',
      habits: (habits.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        weekdays: row.weekdays,
        startDate: row.start_date,
        archivedOn: row.archived_on ?? undefined
      })),
      changes: (changes.data ?? []).map((row) => ({
        habitId: row.habit_id,
        effectiveFrom: row.effective_from,
        weekdays: row.weekdays
      }))
    })
  },
  loadMonth: async (month, userId) => {
    void get().load(userId)
    if (get().loadedMonths[month] || get().loadingMonths[month]) return
    const request = generation
    set((s) => ({
      loadingMonths: { ...s.loadingMonths, [month]: true },
      errorMonths: { ...s.errorMonths, [month]: false }
    }))
    const { data, error } = await fetchMonthCompletions(month, userId)
    if (request !== generation) return
    set((s) => ({
      completions: error
        ? s.completions
        : {
            ...s.completions,
            ...Object.fromEntries(data.map((row) => [completionKey(row.habit_id, row.date), true]))
          },
      loadedMonths: { ...s.loadedMonths, [month]: !error },
      loadingMonths: { ...s.loadingMonths, [month]: false },
      errorMonths: { ...s.errorMonths, [month]: Boolean(error) }
    }))
  },
  addHabit: async (name, weekdays, userId) => {
    const trimmed = name.trim()
    const days = [...new Set(weekdays)].sort()
    if (!trimmed || trimmed.length > 80 || !validDays(days)) return false
    const habit: Habit = { id: newId(), name: trimmed, weekdays: days, startDate: todayISO() }
    const request = generation
    const { error } = await supabase.from('habits').insert({
      id: habit.id,
      user_id: userId,
      name: habit.name,
      weekdays: habit.weekdays,
      start_date: habit.startDate
    })
    if (error || request !== generation) return false
    set((s) => ({ habits: [...s.habits, habit] }))
    return true
  },
  renameHabit: async (habitId, name, userId) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 80 || !get().habits.some((h) => h.id === habitId && !h.archivedOn)) return false
    const request = generation
    const { error } = await supabase.from('habits').update({ name: trimmed }).eq('id', habitId).eq('user_id', userId)
    if (error || request !== generation) return false
    set((s) => ({ habits: s.habits.map((h) => (h.id === habitId ? { ...h, name: trimmed } : h)) }))
    return true
  },
  changeSchedule: async (habitId, weekdays, userId) => {
    const days = [...new Set(weekdays)].sort()
    if (!validDays(days) || !get().habits.some((h) => h.id === habitId && !h.archivedOn)) return false
    const effectiveFrom = todayISO()
    const request = generation
    const { error } = await supabase.from('habit_schedule_changes').upsert(
      {
        habit_id: habitId,
        user_id: userId,
        effective_from: effectiveFrom,
        weekdays: days
      },
      { onConflict: 'habit_id,effective_from' }
    )
    if (error || request !== generation) return false
    set((s) => ({
      changes: [
        ...s.changes.filter((c) => c.habitId !== habitId || c.effectiveFrom !== effectiveFrom),
        { habitId, effectiveFrom, weekdays: days }
      ]
    }))
    return true
  },
  archiveHabit: async (habitId, userId) => {
    const archivedOn = todayISO()
    const request = generation
    const { error } = await supabase
      .from('habits')
      .update({ archived_on: archivedOn })
      .eq('id', habitId)
      .eq('user_id', userId)
    if (error || request !== generation) return false
    set((s) => ({ habits: s.habits.map((h) => (h.id === habitId ? { ...h, archivedOn } : h)) }))
    return true
  },
  toggleCompletion: async (habitId, date, userId) => {
    const key = completionKey(habitId, date)
    if (
      date > todayISO() ||
      get().savingKey ||
      !scheduledHabits(date, get().habits, get().changes).some((h) => h.id === habitId)
    )
      return false
    const request = generation
    const completed = Boolean(get().completions[key])
    set({ savingKey: key })
    const { error } = completed
      ? await supabase.from('habit_completions').delete().eq('habit_id', habitId).eq('date', date).eq('user_id', userId)
      : await supabase.from('habit_completions').upsert({ habit_id: habitId, user_id: userId, date })
    if (request !== generation) return false
    set((s) => {
      const completions = { ...s.completions }
      if (!error) {
        if (completed) delete completions[key]
        else completions[key] = true
      }
      return { completions, savingKey: null }
    })
    return !error
  },
  reset: () => {
    generation++
    set({
      status: 'idle',
      habits: [],
      changes: [],
      completions: {},
      loadedMonths: {},
      loadingMonths: {},
      errorMonths: {},
      savingKey: null
    })
  }
}))
