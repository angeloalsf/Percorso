import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { patch, state } from './store'
import type { Budget, SaveResult } from './types'

export async function upsertBudget(categoryId: string, monthlyLimit: number): Promise<SaveResult> {
  const existing = state().budgets.find((b) => b.categoryId === categoryId)
  if (existing) {
    const { error } = await supabase.from('budgets').update({ monthly_limit: monthlyLimit }).eq('id', existing.id)
    if (error) return 'error'
    patch({ budgets: state().budgets.map((b) => (b.id === existing.id ? { ...b, monthlyLimit } : b)) })
    return 'ok'
  }
  const budget: Budget = { id: newId(), categoryId, monthlyLimit }
  const { error } = await supabase
    .from('budgets')
    .insert({ id: budget.id, category_id: categoryId, monthly_limit: monthlyLimit })
  if (error) return 'error'
  patch({ budgets: [...state().budgets, budget] })
  return 'ok'
}

export async function deleteBudget(id: string): Promise<SaveResult> {
  const { error } = await supabase.from('budgets').delete().eq('id', id)
  if (error) return 'error'
  patch({ budgets: state().budgets.filter((b) => b.id !== id) })
  return 'ok'
}
