import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { reconcileCardBills } from './cards'
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
    is_recurring: input.isRecurring,
    import_reference: input.importReference ?? null
  }
}

function sortTx(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => a.date.localeCompare(b.date))
}

async function reconcileAfterPurchase(): Promise<void> {
  try {
    await reconcileCardBills()
  } catch (error) {
    console.error('Could not reconcile card invoices; they will retry on the next load.', error)
  }
}

export async function addTransaction(input: TransactionInput): Promise<SaveResult> {
  const tx: Transaction = { ...input, id: newId() }
  const { error } = await supabase.from('transactions').insert(txRow(tx.id, input))
  if (error) return 'error'
  patch({ transactions: sortTx([...state().transactions, tx]) })
  if (tx.cardId) await reconcileAfterPurchase()
  return 'ok'
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<SaveResult> {
  const previous = state().transactions.find((tx) => tx.id === id)
  const { id: _, ...row } = txRow(id, input)
  const { error } = await supabase.from('transactions').update(row).eq('id', id)
  if (error) return 'error'
  patch({ transactions: sortTx(state().transactions.map((tx) => (tx.id === id ? { ...input, id } : tx))) })
  if (input.cardId || previous?.cardId) await reconcileAfterPurchase()
  return 'ok'
}

export async function deleteTransaction(id: string): Promise<SaveResult> {
  const previous = state().transactions.find((tx) => tx.id === id)
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) return 'error'
  patch({ transactions: state().transactions.filter((tx) => tx.id !== id) })
  if (previous?.cardId) await reconcileAfterPurchase()
  return 'ok'
}
