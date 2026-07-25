import type { PostgrestError } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { syncCardBills } from './cards'
import {
  rowToAccount,
  rowToBill,
  rowToBudget,
  rowToCategory,
  rowToConsortium,
  rowToCreditCard,
  rowToGoal,
  rowToLoan,
  rowToTransaction
} from './rows'
import type { FinanceState } from './types'

// PostgREST caps every response at `max_rows` (1000, see supabase/config.toml).
// Every derived financial figure (balances, net worth, cash flow, budgets,
// card invoices) sums over the full transaction history, so an unpaginated
// fetch silently drops older rows past that cap and every total goes wrong.
// `.order('id')` is a tiebreaker for rows sharing the same (date, created_at)
// — without a fully deterministic sort, Postgres doesn't guarantee stable
// ordering across separate `.range()` calls, which could skip or duplicate a
// row at a page boundary.
const TRANSACTIONS_PAGE_SIZE = 1000

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchAllTransactions(): Promise<{ data: any[]; error: null } | { data: null; error: PostgrestError }> {
  const rows: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date')
      .order('created_at')
      .order('id')
      .range(from, from + TRANSACTIONS_PAGE_SIZE - 1)
    if (error) return { data: null, error }
    rows.push(...data)
    if (data.length < TRANSACTIONS_PAGE_SIZE) break
    from += TRANSACTIONS_PAGE_SIZE
  }
  return { data: rows, error: null }
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  status: 'idle',
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  goals: [],
  bills: [],
  creditCards: [],
  loans: [],
  consortiums: [],
  pendingTxFilter: null,

  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return
    set({ status: 'loading' })
    const [accounts, categories, transactions, budgets, goals, bills, cards, loans, consortiums] = await Promise.all([
      supabase.from('accounts').select('*').order('created_at'),
      supabase.from('categories').select('*').order('created_at'),
      fetchAllTransactions(),
      supabase.from('budgets').select('*').order('created_at'),
      supabase.from('goals').select('*').order('created_at'),
      supabase.from('bills').select('*').order('due_date'),
      supabase.from('credit_cards').select('*').order('created_at'),
      supabase.from('loans').select('*').order('created_at'),
      supabase.from('consortiums').select('*').order('created_at')
    ])
    if (
      accounts.error ||
      categories.error ||
      transactions.error ||
      budgets.error ||
      goals.error ||
      bills.error ||
      cards.error ||
      loans.error ||
      consortiums.error
    ) {
      set({ status: 'error' })
      return
    }
    const creditCards = cards.data.map(rowToCreditCard)
    const txs = transactions.data.map(rowToTransaction)
    let billList = bills.data.map(rowToBill)
    // Re-derive card invoice bills from the cycle's transactions (no background
    // job infrastructure in this project, so it happens on load).
    try {
      billList = await syncCardBills(creditCards, txs, billList)
    } catch {
      /* best-effort; a bill-sync failure must not block the dashboard */
    }
    set({
      status: 'ready',
      accounts: accounts.data.map(rowToAccount),
      categories: categories.data.map(rowToCategory),
      transactions: txs,
      budgets: budgets.data.map(rowToBudget),
      goals: goals.data.map(rowToGoal),
      bills: billList,
      creditCards,
      loans: loans.data.map(rowToLoan),
      consortiums: consortiums.data.map(rowToConsortium)
    })
  },

  reset: () =>
    set({
      status: 'idle',
      accounts: [],
      categories: [],
      transactions: [],
      budgets: [],
      goals: [],
      bills: [],
      creditCards: [],
      loans: [],
      consortiums: [],
      pendingTxFilter: null
    }),

  setPendingTxFilter: (filter) => set({ pendingTxFilter: filter })
}))

/** Shared by every entity module's mutations to read/patch the store without each redeclaring it. */
export const state = (): FinanceState => useFinanceStore.getState()
export const patch = useFinanceStore.setState
