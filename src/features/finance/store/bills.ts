import { addDays, todayISO } from '@/lib/dates'
import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { patch, state } from './store'
import { rowToBill, rowToTransaction } from './rows'
import type { Bill, SaveResult } from './types'

export type BillInput = Omit<Bill, 'id'>

export function billRow(id: string, input: BillInput) {
  return {
    id,
    name: input.name,
    amount: input.amount,
    due_date: input.dueDate,
    status: input.status,
    recurring: input.recurring,
    card_id: input.cardId ?? null,
    cycle_close: input.cycleClose ?? null,
    recurrence_id: input.recurrenceId ?? null,
    paid_at: input.status === 'paid' ? new Date().toISOString() : null
  }
}

export async function addBill(input: BillInput): Promise<SaveResult> {
  const bill: Bill = { ...input, id: newId() }
  const { error } = await supabase.from('bills').insert(billRow(bill.id, input))
  if (error) return 'error'
  if (input.status === 'paid' && input.recurring) await refreshBills()
  else patch({ bills: [...state().bills, bill] })
  return 'ok'
}

export async function updateBill(id: string, input: BillInput): Promise<SaveResult> {
  const { id: _, ...row } = billRow(id, input)
  const { error } = await supabase.from('bills').update(row).eq('id', id)
  if (error) return 'error'
  if (input.status === 'paid' && input.recurring) await refreshBills()
  else patch({ bills: state().bills.map((b) => (b.id === id ? { ...input, id } : b)) })
  return 'ok'
}

export async function deleteBill(id: string): Promise<SaveResult> {
  const { error } = await supabase.from('bills').delete().eq('id', id)
  if (error) return 'error'
  patch({ bills: state().bills.filter((b) => b.id !== id) })
  return 'ok'
}

/** Quick action: flip a bill to paid (and stamp paid_at) without a full form. */
export async function markBillPaid(id: string): Promise<SaveResult> {
  if (state().bills.find((b) => b.id === id)?.cardId) return 'error'
  const { error } = await supabase
    .from('bills')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return 'error'
  await refreshBills()
  return 'ok'
}

type BillAlertState = 'overdue' | 'dueSoon'

export interface BillAlert {
  bill: Bill
  state: BillAlertState
}

/**
 * Pending bills that need attention: `overdue` (due date already past) or
 * `dueSoon` (due within `windowDays`, default 7). Paid bills never alert.
 * Sorted overdue-first (oldest due first), then soonest-due.
 */
export function billAlerts(bills: Bill[], today: string = todayISO(), windowDays = 7): BillAlert[] {
  const horizon = addDays(today, windowDays)
  const alerts: BillAlert[] = []
  for (const bill of bills) {
    if (bill.status !== 'pending') continue
    if (bill.dueDate < today) alerts.push({ bill, state: 'overdue' })
    else if (bill.dueDate <= horizon) alerts.push({ bill, state: 'dueSoon' })
  }
  return alerts.sort((a, b) => {
    if (a.state !== b.state) return a.state === 'overdue' ? -1 : 1
    return a.bill.dueDate.localeCompare(b.bill.dueDate)
  })
}

async function refreshBills(): Promise<void> {
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return
  const { data, error } = await supabase.from('bills').select('*').eq('user_id', user.id).order('due_date')
  if (error) throw error
  patch({ bills: data.map(rowToBill) })
}

/** Idempotent transaction in PostgreSQL: expense and bill status commit together. */
export async function payCardBill(bill: Bill, accountId: string): Promise<SaveResult> {
  const { data: transactionId, error } = await supabase.rpc('pay_card_bill', {
    p_bill_id: bill.id,
    p_account_id: accountId,
    p_payment_date: todayISO()
  })
  if (error) return 'error'
  if (transactionId && !state().transactions.some((tx) => tx.id === transactionId)) {
    const { data } = await supabase.from('transactions').select('*').eq('id', transactionId).single()
    if (!data) return 'error' // committed already; retrying the RPC fetches the same payment
    patch({ transactions: [...state().transactions, rowToTransaction(data)] })
  }
  patch({
    bills: state().bills.map((b) =>
      b.id === bill.id ? { ...b, status: 'paid', paymentTransactionId: transactionId ?? undefined } : b
    )
  })
  return 'ok'
}
