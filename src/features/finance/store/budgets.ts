import { newId } from '@/lib/id'
import { todayISO } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import { patch, state } from './store'
import type { Budget, BudgetLimitHistory, SaveResult } from './types'

export function budgetLimitAt(budget: Budget, history: BudgetLimitHistory[], month: string): number | null {
  const end = `${month}-31`
  if ((budget.effectiveFrom ?? '0000-01-01') <= end) return budget.monthlyLimit
  return (
    history
      .filter((h) => h.categoryId === budget.categoryId && h.validFrom <= end && h.validUntil > end)
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]?.monthlyLimit ?? null
  )
}

async function refreshBudgetHistory(): Promise<void> {
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return
  const { data } = await supabase.from('budget_limit_history').select('*').eq('user_id', user.id)
  if (data)
    patch({
      budgetHistory: data.map((r) => ({
        categoryId: r.category_id,
        monthlyLimit: Number(r.monthly_limit),
        validFrom: r.valid_from,
        validUntil: r.valid_until
      }))
    })
}

export async function upsertBudget(categoryId: string, monthlyLimit: number): Promise<SaveResult> {
  const existing = state().budgets.find((b) => b.categoryId === categoryId)
  if (existing) {
    const { error } = await supabase.from('budgets').update({ monthly_limit: monthlyLimit }).eq('id', existing.id)
    if (error) return 'error'
    patch({
      budgets: state().budgets.map((b) =>
        b.id === existing.id ? { ...b, monthlyLimit, effectiveFrom: todayISO() } : b
      )
    })
    await refreshBudgetHistory()
    return 'ok'
  }
  const budget: Budget = { id: newId(), categoryId, monthlyLimit, effectiveFrom: todayISO() }
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
  await refreshBudgetHistory()
  return 'ok'
}
