import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { patch, state } from './store'
import type { SaveResult, Transaction } from './types'

export type TransactionInput = Omit<Transaction, 'id'>

function txRow(id: string, input: TransactionInput) {
  return {
    id,
    date: input.date,
    type: input.type,
    amount: input.amount,
    account_id: input.accountId ?? null,
    card_id: input.cardId ?? null,
    to_account_id: input.toAccountId ?? null,
    category_id: input.categoryId ?? null,
    note: input.note,
    is_recurring: input.isRecurring
  }
}

function sortTx(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => a.date.localeCompare(b.date))
}

export async function addTransaction(input: TransactionInput): Promise<SaveResult> {
  const tx: Transaction = { ...input, id: newId() }
  const { error } = await supabase.from('transactions').insert(txRow(tx.id, input))
  if (error) return 'error'
  patch({ transactions: sortTx([...state().transactions, tx]) })
  return 'ok'
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<SaveResult> {
  const { id: _, ...row } = txRow(id, input)
  const { error } = await supabase.from('transactions').update(row).eq('id', id)
  if (error) return 'error'
  patch({ transactions: sortTx(state().transactions.map((tx) => (tx.id === id ? { ...input, id } : tx))) })
  return 'ok'
}

export async function deleteTransaction(id: string): Promise<SaveResult> {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) return 'error'
  patch({ transactions: state().transactions.filter((tx) => tx.id !== id) })
  return 'ok'
}
