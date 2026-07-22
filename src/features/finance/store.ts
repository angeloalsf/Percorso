import { create } from 'zustand'
import { monthKey } from '@/lib/dates'
import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'

export type AccountType = 'checking' | 'savings' | 'cash' | 'card' | 'investment'

export interface Account {
  id: string
  name: string
  type: AccountType
  initialBalance: number
  color: string
  archived: boolean
}

export type CategoryType = 'income' | 'expense'

export interface Category {
  id: string
  name: string
  type: CategoryType
  color: string
}

export type TransactionType = 'income' | 'expense' | 'transfer'

export interface Transaction {
  id: string
  date: string
  type: TransactionType
  amount: number
  accountId: string
  /** Destination account for transfers. */
  toAccountId?: string
  categoryId?: string
  note: string
}

export interface Budget {
  id: string
  categoryId: string
  monthlyLimit: number
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'
export type SaveResult = 'ok' | 'error'
export type DeleteResult = 'ok' | 'in-use' | 'error'

/* ------------------------------ row mapping ------------------------------ */

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToAccount(r: any): Account {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    initialBalance: Number(r.initial_balance),
    color: r.color,
    archived: r.archived
  }
}

function rowToCategory(r: any): Category {
  return { id: r.id, name: r.name, type: r.type, color: r.color }
}

function rowToTransaction(r: any): Transaction {
  return {
    id: r.id,
    date: r.date,
    type: r.type,
    amount: Number(r.amount),
    accountId: r.account_id,
    toAccountId: r.to_account_id ?? undefined,
    categoryId: r.category_id ?? undefined,
    note: r.note
  }
}

function rowToBudget(r: any): Budget {
  return { id: r.id, categoryId: r.category_id, monthlyLimit: Number(r.monthly_limit) }
}

/* --------------------------------- store --------------------------------- */

interface FinanceState {
  status: LoadStatus
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  load: () => Promise<void>
  reset: () => void
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  status: 'idle',
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],

  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return
    set({ status: 'loading' })
    const [accounts, categories, transactions, budgets] = await Promise.all([
      supabase.from('accounts').select('*').order('created_at'),
      supabase.from('categories').select('*').order('created_at'),
      supabase.from('transactions').select('*').order('date').order('created_at'),
      supabase.from('budgets').select('*').order('created_at')
    ])
    if (accounts.error || categories.error || transactions.error || budgets.error) {
      set({ status: 'error' })
      return
    }
    set({
      status: 'ready',
      accounts: accounts.data.map(rowToAccount),
      categories: categories.data.map(rowToCategory),
      transactions: transactions.data.map(rowToTransaction),
      budgets: budgets.data.map(rowToBudget)
    })
  },

  reset: () => set({ status: 'idle', accounts: [], categories: [], transactions: [], budgets: [] })
}))

const state = (): FinanceState => useFinanceStore.getState()
const patch = useFinanceStore.setState

function sortTx(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => a.date.localeCompare(b.date))
}

/* ------------------------------- accounts -------------------------------- */

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

/** `in-use` when transactions still reference the account. */
export async function deleteAccount(id: string): Promise<DeleteResult> {
  if (state().transactions.some((tx) => tx.accountId === id || tx.toAccountId === id)) return 'in-use'
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

/* ------------------------------ categories ------------------------------- */

export type CategoryInput = Omit<Category, 'id'>

export async function addCategory(input: CategoryInput): Promise<SaveResult> {
  const category: Category = { ...input, id: newId() }
  const { error } = await supabase
    .from('categories')
    .insert({ id: category.id, name: category.name, type: category.type, color: category.color })
  if (error) return 'error'
  patch({ categories: [...state().categories, category] })
  return 'ok'
}

export async function updateCategory(id: string, input: CategoryInput): Promise<SaveResult> {
  const { error } = await supabase
    .from('categories')
    .update({ name: input.name, type: input.type, color: input.color })
    .eq('id', id)
  if (error) return 'error'
  patch({ categories: state().categories.map((c) => (c.id === id ? { ...c, ...input } : c)) })
  return 'ok'
}

/** `in-use` when transactions or budgets still use the category. */
export async function deleteCategory(id: string): Promise<DeleteResult> {
  if (state().transactions.some((tx) => tx.categoryId === id) || state().budgets.some((b) => b.categoryId === id))
    return 'in-use'
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return error.code === '23503' ? 'in-use' : 'error'
  patch({ categories: state().categories.filter((c) => c.id !== id) })
  return 'ok'
}

/** Seed a starter set of categories, named in the caller's active language. */
export async function seedCategories(
  expenseNames: string[],
  incomeNames: string[],
  colors: string[]
): Promise<SaveResult> {
  const rows = [
    ...expenseNames.map((name, i) => ({
      id: newId(),
      name,
      type: 'expense' as const,
      color: colors[i % colors.length]
    })),
    ...incomeNames.map((name, i) => ({
      id: newId(),
      name,
      type: 'income' as const,
      color: colors[(i + 3) % colors.length]
    }))
  ]
  const { error } = await supabase.from('categories').insert(rows)
  if (error) return 'error'
  patch({ categories: [...state().categories, ...rows.map((r) => rowToCategory({ ...r, id: r.id }))] })
  return 'ok'
}

/* ----------------------------- transactions ------------------------------ */

export type TransactionInput = Omit<Transaction, 'id'>

function txRow(id: string, input: TransactionInput) {
  return {
    id,
    date: input.date,
    type: input.type,
    amount: input.amount,
    account_id: input.accountId,
    to_account_id: input.toAccountId ?? null,
    category_id: input.categoryId ?? null,
    note: input.note
  }
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

/* -------------------------------- budgets -------------------------------- */

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

/* -------------------------------- derived -------------------------------- */

export function monthTotals(transactions: Transaction[], month: string): { income: number; expense: number } {
  let income = 0
  let expense = 0
  for (const tx of transactions) {
    if (monthKey(tx.date) !== month) continue
    if (tx.type === 'income') income += tx.amount
    if (tx.type === 'expense') expense += tx.amount
  }
  return { income, expense }
}

export function spendingByCategory(transactions: Transaction[], month: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.type !== 'expense' || monthKey(tx.date) !== month) continue
    const key = tx.categoryId ?? ''
    map.set(key, (map.get(key) ?? 0) + tx.amount)
  }
  return map
}
