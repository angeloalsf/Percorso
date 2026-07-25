import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { accountBalance } from './accounts'
import { patch, state } from './store'
import type { Account, Goal, SaveResult, Transaction } from './types'

export type GoalInput = Omit<Goal, 'id'>

function goalRow(id: string, input: GoalInput) {
  return {
    id,
    name: input.name,
    target_amount: input.targetAmount,
    target_date: input.targetDate ?? null,
    account_id: input.accountId ?? null,
    saved_amount: input.savedAmount
  }
}

export async function addGoal(input: GoalInput): Promise<SaveResult> {
  const goal: Goal = { ...input, id: newId() }
  const { error } = await supabase.from('goals').insert(goalRow(goal.id, input))
  if (error) return 'error'
  patch({ goals: [...state().goals, goal] })
  return 'ok'
}

export async function updateGoal(id: string, input: GoalInput): Promise<SaveResult> {
  const { id: _, ...row } = goalRow(id, input)
  const { error } = await supabase.from('goals').update(row).eq('id', id)
  if (error) return 'error'
  patch({ goals: state().goals.map((g) => (g.id === id ? { ...input, id } : g)) })
  return 'ok'
}

export async function deleteGoal(id: string): Promise<SaveResult> {
  const { error } = await supabase.from('goals').delete().eq('id', id)
  if (error) return 'error'
  patch({ goals: state().goals.filter((g) => g.id !== id) })
  return 'ok'
}

/** Hybrid progress: an account's live balance when linked, else the manual amount. */
export function goalProgress(goal: Goal, accounts: Account[], transactions: Transaction[]): number {
  if (goal.accountId) {
    const account = accounts.find((a) => a.id === goal.accountId)
    if (account) return accountBalance(account, transactions)
  }
  return goal.savedAmount
}
