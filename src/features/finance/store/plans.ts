import { isoForDay, parseISODate, todayISO } from '@/lib/dates'
import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { patch, state } from './store'
import type { Consortium, DeleteResult, InstallmentPlan, Loan, SaveResult } from './types'

/*
 * See the InstallmentPlan doc comment: list/CRUD only, no bill generation and
 * no payment linking. Both tables share a shape, so the row builder and the
 * progress derivation are shared and only `contemplated` differs.
 */

export type LoanInput = Omit<Loan, 'id'>
export type ConsortiumInput = Omit<Consortium, 'id'>

function planRow(id: string, input: LoanInput) {
  return {
    id,
    account_id: input.accountId ?? null,
    name: input.name,
    total_amount: input.totalAmount,
    installment_amount: input.installmentAmount,
    installments_total: input.installmentsTotal,
    installments_paid: input.installmentsPaid,
    paid_as_of: input.paidAsOf,
    due_day: input.dueDay
  }
}

/**
 * Installments paid as of `today`: the stored baseline plus one for every
 * `dueDay` that has come round since `paidAsOf`, capped at the total. This is
 * what every progress bar reads — `installmentsPaid` alone goes stale.
 */
export function installmentsPaidNow(plan: InstallmentPlan, today: string = todayISO()): number {
  if (today <= plan.paidAsOf) return plan.installmentsPaid
  const from = parseISODate(plan.paidAsOf)
  const to = parseISODate(today)
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  // Count the due dates falling in (paidAsOf, today].
  let elapsed = 0
  for (let i = 0; i <= months; i++) {
    const due = isoForDay(from.getFullYear(), from.getMonth() + i, plan.dueDay)
    if (due > plan.paidAsOf && due <= today) elapsed++
  }
  return Math.min(plan.installmentsTotal, plan.installmentsPaid + elapsed)
}

/** Remaining balance: unpaid installments × the installment amount. */
export function planRemaining(plan: InstallmentPlan, today?: string): number {
  const paid = installmentsPaidNow(plan, today)
  return Math.max(0, (plan.installmentsTotal - paid) * plan.installmentAmount)
}

/** Next due date: the next `dueDay` on-or-after today. Null once fully paid. */
export function planNextDue(plan: InstallmentPlan, today: string = todayISO()): string | null {
  if (installmentsPaidNow(plan, today) >= plan.installmentsTotal) return null
  const d = parseISODate(today)
  const thisMonth = isoForDay(d.getFullYear(), d.getMonth(), plan.dueDay)
  return thisMonth >= today ? thisMonth : isoForDay(d.getFullYear(), d.getMonth() + 1, plan.dueDay)
}

export async function addLoan(input: LoanInput): Promise<SaveResult> {
  const loan: Loan = { ...input, id: newId() }
  const { error } = await supabase.from('loans').insert(planRow(loan.id, input))
  if (error) return 'error'
  patch({ loans: [...state().loans, loan] })
  return 'ok'
}

export async function updateLoan(id: string, input: LoanInput): Promise<SaveResult> {
  const { id: _, ...row } = planRow(id, input)
  const { error } = await supabase.from('loans').update(row).eq('id', id)
  if (error) return 'error'
  patch({ loans: state().loans.map((l) => (l.id === id ? { ...l, ...input } : l)) })
  return 'ok'
}

export async function deleteLoan(id: string): Promise<DeleteResult> {
  const { error } = await supabase.from('loans').delete().eq('id', id)
  if (error) return error.code === '23503' ? 'in-use' : 'error'
  patch({ loans: state().loans.filter((l) => l.id !== id) })
  return 'ok'
}

export async function addConsortium(input: ConsortiumInput): Promise<SaveResult> {
  const consortium: Consortium = { ...input, id: newId() }
  const { error } = await supabase
    .from('consortiums')
    .insert({ ...planRow(consortium.id, input), contemplated: input.contemplated })
  if (error) return 'error'
  patch({ consortiums: [...state().consortiums, consortium] })
  return 'ok'
}

export async function updateConsortium(id: string, input: ConsortiumInput): Promise<SaveResult> {
  const { id: _, ...row } = planRow(id, input)
  const { error } = await supabase
    .from('consortiums')
    .update({ ...row, contemplated: input.contemplated })
    .eq('id', id)
  if (error) return 'error'
  patch({ consortiums: state().consortiums.map((c) => (c.id === id ? { ...c, ...input } : c)) })
  return 'ok'
}

export async function deleteConsortium(id: string): Promise<DeleteResult> {
  const { error } = await supabase.from('consortiums').delete().eq('id', id)
  if (error) return error.code === '23503' ? 'in-use' : 'error'
  patch({ consortiums: state().consortiums.filter((c) => c.id !== id) })
  return 'ok'
}
