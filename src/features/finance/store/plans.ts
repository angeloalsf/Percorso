import { isoForDay, parseISODate, todayISO } from '@/lib/dates'
import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { patch, state } from './store'
import { rowToTransaction } from './rows'
import type { Consortium, DeleteResult, InstallmentPlan, Loan, SaveResult } from './types'

/* Both tables share a shape; progress reflects confirmed payments only. */

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

export function installmentsPaidNow(plan: InstallmentPlan, _today: string = todayISO()): number {
  return plan.installmentsPaid
}

/** Remaining balance: unpaid installments × the installment amount. */
export function planRemaining(plan: InstallmentPlan, today?: string): number {
  const paid = installmentsPaidNow(plan, today)
  return Math.max(0, (plan.installmentsTotal - paid) * plan.installmentAmount)
}

/** Earliest unpaid due date, including overdue installments. */
export function planNextDue(plan: InstallmentPlan, today: string = todayISO()): string | null {
  if (installmentsPaidNow(plan, today) >= plan.installmentsTotal) return null
  const baseline = parseISODate(plan.paidAsOf)
  const first = isoForDay(baseline.getFullYear(), baseline.getMonth(), plan.dueDay)
  return first > plan.paidAsOf ? first : isoForDay(baseline.getFullYear(), baseline.getMonth() + 1, plan.dueDay)
}

export async function payPlanInstallment(
  kind: 'loan' | 'consortium',
  planId: string,
  accountId: string,
  paymentKey: string
): Promise<SaveResult> {
  const { data: txId, error } = await supabase.rpc('pay_plan_installment', {
    p_kind: kind,
    p_plan_id: planId,
    p_account_id: accountId,
    p_payment_key: paymentKey,
    p_payment_date: todayISO()
  })
  if (error || !txId) return 'error'
  const { data: tx } = await supabase.from('transactions').select('*').eq('id', txId).single()
  if (state().transactions.some((t) => t.id === txId)) return 'ok'
  if (tx) patch({ transactions: [...state().transactions, rowToTransaction(tx)] })
  else return 'error'
  const key = kind === 'loan' ? 'loans' : 'consortiums'
  patch({
    [key]: state()[key].map((p) =>
      p.id === planId ? { ...p, installmentsPaid: p.installmentsPaid + 1, paidAsOf: todayISO() } : p
    )
  })
  return 'ok'
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
