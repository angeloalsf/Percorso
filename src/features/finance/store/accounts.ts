import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { patch, state } from './store'
import type { Account, DeleteResult, SaveResult, Transaction } from './types'

export type AccountInput = Omit<Account, 'id' | 'archived'>

export async function addAccount(input: AccountInput): Promise<SaveResult> {
  const account: Account = { ...input, id: newId(), archived: false }
  const { error } = await supabase.from('accounts').insert({
    id: account.id,
    name: account.name,
    type: account.type,
    initial_balance: account.initialBalance,
    color: account.color
  })
  if (error) return 'error'
  patch({ accounts: [...state().accounts, account] })
  return 'ok'
}

export async function updateAccount(id: string, input: AccountInput): Promise<SaveResult> {
  const { error } = await supabase
    .from('accounts')
    .update({ name: input.name, type: input.type, initial_balance: input.initialBalance, color: input.color })
    .eq('id', id)
  if (error) return 'error'
  patch({ accounts: state().accounts.map((a) => (a.id === id ? { ...a, ...input } : a)) })
  return 'ok'
}

export async function setAccountArchived(id: string, archived: boolean): Promise<SaveResult> {
  const { error } = await supabase.from('accounts').update({ archived }).eq('id', id)
  if (error) return 'error'
  patch({ accounts: state().accounts.map((a) => (a.id === id ? { ...a, archived } : a)) })
  return 'ok'
}

/** `in-use` when transactions, goals, cards, loans or consórcios reference the account. */
export async function deleteAccount(id: string): Promise<DeleteResult> {
  if (state().transactions.some((tx) => tx.accountId === id || tx.toAccountId === id)) return 'in-use'
  if (state().goals.some((g) => g.accountId === id)) return 'in-use'
  if (state().creditCards.some((c) => c.issuingAccountId === id)) return 'in-use'
  if (state().loans.some((l) => l.accountId === id)) return 'in-use'
  if (state().consortiums.some((c) => c.accountId === id)) return 'in-use'
  const { error } = await supabase.from('accounts').delete().eq('id', id)
  if (error) return error.code === '23503' ? 'in-use' : 'error'
  patch({ accounts: state().accounts.filter((a) => a.id !== id) })
  return 'ok'
}

export function accountBalance(account: Account, transactions: Transaction[]): number {
  let balance = account.initialBalance
  for (const tx of transactions) {
    if (tx.type === 'income' && tx.accountId === account.id) balance += tx.amount
    if (tx.type === 'expense' && tx.accountId === account.id) balance -= tx.amount
    if (tx.type === 'transfer') {
      if (tx.accountId === account.id) balance -= tx.amount
      if (tx.toAccountId === account.id) balance += tx.amount
    }
  }
  return balance
}
