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
let loadGeneration = 0

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchAllTransactions(
  userId: string
): Promise<{ data: any[]; error: null } | { data: null; error: PostgrestError }> {
  const rows: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
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
  budgetHistory: [],
  goals: [],
  bills: [],
  creditCards: [],
  loans: [],
  consortiums: [],
  pendingTxFilter: null,

  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return
    const generation = ++loadGeneration
    set({ status: 'loading' })
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()
    if (generation !== loadGeneration) return
    if (authError || !user) {
      set({ status: 'error' })
      return
    }
    const userId = user.id
    const [accounts, categories, transactions, budgets, history, goals, bills, cards, loans, consortiums] =
      await Promise.all([
        supabase.from('accounts').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('categories').select('*').eq('user_id', userId).order('created_at'),
        fetchAllTransactions(userId),
        supabase.from('budgets').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('budget_limit_history').select('*').eq('user_id', userId),
        supabase.from('goals').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('bills').select('*').eq('user_id', userId).order('due_date'),
        supabase.from('credit_cards').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('loans').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('consortiums').select('*').eq('user_id', userId).order('created_at')
      ])
    if (generation !== loadGeneration) return
    if (
      accounts.error ||
      categories.error ||
      transactions.error ||
      budgets.error ||
      history.error ||
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
    // Reconcile past card cycles on load; mutations reconcile immediately too.
    try {
      billList = await syncCardBills(creditCards, txs, billList)
    } catch {
      /* best-effort; a bill-sync failure must not block the dashboard */
    }
    if (generation !== loadGeneration) return // logout/reset while queries were in flight
    set({
      status: 'ready',
      accounts: accounts.data.map(rowToAccount),
      categories: categories.data.map(rowToCategory),
      transactions: txs,
      budgets: budgets.data.map(rowToBudget),
      budgetHistory: history.data.map((r) => ({
        categoryId: r.category_id,
        monthlyLimit: Number(r.monthly_limit),
        validFrom: r.valid_from,
        validUntil: r.valid_until
      })),
      goals: goals.data.map(rowToGoal),
      bills: billList,
      creditCards,
      loans: loans.data.map(rowToLoan),
      consortiums: consortiums.data.map(rowToConsortium)
    })
  },

  reset: () => {
    loadGeneration++
    set({
      status: 'idle',
      accounts: [],
      categories: [],
      transactions: [],
      budgets: [],
      budgetHistory: [],
      goals: [],
      bills: [],
      creditCards: [],
      loans: [],
      consortiums: [],
      pendingTxFilter: null
    })
  },

  setPendingTxFilter: (filter) => set({ pendingTxFilter: filter })
}))

/** Shared by every entity module's mutations to read/patch the store without each redeclaring it. */
export const state = (): FinanceState => useFinanceStore.getState()
export const patch = useFinanceStore.setState
