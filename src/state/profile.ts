import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

/** The user's profile row (created by a DB trigger on signup). */
interface ProfileState {
  fullName: string
  currency: string
  load: (userId: string) => Promise<void>
  reset: () => void
  saveName: (fullName: string) => Promise<boolean>
  saveCurrency: (currency: string) => Promise<boolean>
}

export const CURRENCIES = ['USD', 'EUR', 'BRL', 'GBP', 'CHF', 'JPY'] as const

export const useProfile = create<ProfileState>((set) => ({
  fullName: '',
  currency: 'USD',

  load: async (userId) => {
    const { data, error } = await supabase.from('profiles').select('full_name, currency').eq('id', userId).maybeSingle()
    if (error) throw error
    if (data) set({ fullName: data.full_name as string, currency: data.currency as string })
  },

  reset: () => set({ fullName: '', currency: 'USD' }),

  saveName: async (fullName) => {
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
    if (error) return false
    set({ fullName })
    return true
  },

  saveCurrency: async (currency) => {
    const { error } = await supabase
      .from('profiles')
      .update({ currency })
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
    if (error) return false
    set({ currency })
    return true
  }
}))
