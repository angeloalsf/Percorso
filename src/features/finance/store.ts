import { create } from 'zustand'
import { addDays, addMonths, isoForDay, monthKey, parseISODate, shiftMonthKey, todayISO } from '@/lib/dates'
import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'

export type AccountType = 'checking' | 'savings' | 'cash' | 'investment' | 'consorcio'

export interface Account {
  id: string
  name: string
  type: AccountType
  initialBalance: number
  color: string
  archived: boolean
}

/**
 * A credit card — money OWED over a billing cycle, distinct from bank accounts.
 * `issuingAccountId` is display/grouping only and is NOT used for payment logic:
 * a card's invoice is paid from whichever account the user picks at pay time.
 */
export interface CreditCard {
  id: string
  name: string
  issuingAccountId?: string
  closingDay: number
  dueDay: number
  creditLimit?: number
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
  /** Bank account. Undefined for a card purchase (see `cardId`). Always set for income/transfer. */
  accountId?: string
  /** Credit card, for card purchases (expense only). Mutually exclusive with `accountId`. */
  cardId?: string
  /** Destination account for transfers. */
  toAccountId?: string
  categoryId?: string
  note: string
  /** User-set override for the dashboard's recurring-subscriptions detector. */
  isRecurring: boolean
}

export interface Budget {
  id: string
  categoryId: string
  monthlyLimit: number
}

export interface Goal {
  id: string
  name: string
  targetAmount: number
  /** Optional deadline (`YYYY-MM-DD`). */
  targetDate?: string
  /** When set, progress tracks this account's live balance instead of `savedAmount`. */
  accountId?: string
  savedAmount: number
}

export type BillStatus = 'pending' | 'paid'

export interface Bill {
  id: string
  name: string
  amount: number
  /** `YYYY-MM-DD`. */
  dueDate: string
  status: BillStatus
  /** Marks the bill as repeating monthly (reserved for next-occurrence flows). */
  recurring: boolean
  /** Set when this bill was generated from a credit card's closed billing cycle. */
  cardId?: string
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
    accountId: r.account_id ?? undefined,
    cardId: r.card_id ?? undefined,
    toAccountId: r.to_account_id ?? undefined,
    categoryId: r.category_id ?? undefined,
    note: r.note,
    isRecurring: r.is_recurring ?? false
  }
}

function rowToBudget(r: any): Budget {
  return { id: r.id, categoryId: r.category_id, monthlyLimit: Number(r.monthly_limit) }
}

function rowToGoal(r: any): Goal {
  return {
    id: r.id,
    name: r.name,
    targetAmount: Number(r.target_amount),
    targetDate: r.target_date ?? undefined,
    accountId: r.account_id ?? undefined,
    savedAmount: Number(r.saved_amount)
  }
}

function rowToBill(r: any): Bill {
  return {
    id: r.id,
    name: r.name,
    amount: Number(r.amount),
    dueDate: r.due_date,
    status: r.status,
    recurring: r.recurring ?? false,
    cardId: r.card_id ?? undefined
  }
}

function rowToCreditCard(r: any): CreditCard {
  return {
    id: r.id,
    name: r.name,
    issuingAccountId: r.issuing_account_id ?? undefined,
    closingDay: r.closing_day,
    dueDay: r.due_day,
    creditLimit: r.credit_limit != null ? Number(r.credit_limit) : undefined,
    color: r.color,
    archived: r.archived
  }
}

/* --------------------------------- store --------------------------------- */

/** A drill-down request handed from the dashboard to the Transactions tab. */
export interface PendingTxFilter {
  categoryId: string
  month: string
}

interface FinanceState {
  status: LoadStatus
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  goals: Goal[]
  bills: Bill[]
  creditCards: CreditCard[]
  /** Transient (not persisted): set by a dashboard chart click, consumed by Transactions. */
  pendingTxFilter: PendingTxFilter | null
  load: () => Promise<void>
  reset: () => void
  setPendingTxFilter: (filter: PendingTxFilter | null) => void
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
  pendingTxFilter: null,

  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return
    set({ status: 'loading' })
    const [accounts, categories, transactions, budgets, goals, bills, cards] = await Promise.all([
      supabase.from('accounts').select('*').order('created_at'),
      supabase.from('categories').select('*').order('created_at'),
      supabase.from('transactions').select('*').order('date').order('created_at'),
      supabase.from('budgets').select('*').order('created_at'),
      supabase.from('goals').select('*').order('created_at'),
      supabase.from('bills').select('*').order('due_date'),
      supabase.from('credit_cards').select('*').order('created_at')
    ])
    if (
      accounts.error ||
      categories.error ||
      transactions.error ||
      budgets.error ||
      goals.error ||
      bills.error ||
      cards.error
    ) {
      set({ status: 'error' })
      return
    }
    const creditCards = cards.data.map(rowToCreditCard)
    const txs = transactions.data.map(rowToTransaction)
    let billList = bills.data.map(rowToBill)
    // Lazy bill generation: any card cycle that has closed without a bill yet
    // gets one created now (no background job infrastructure in this project).
    try {
      const generated = await ensureCardBills(creditCards, txs, billList)
      if (generated.length > 0) billList = [...billList, ...generated]
    } catch {
      /* best-effort; a bill-gen failure must not block the dashboard */
    }
    set({
      status: 'ready',
      accounts: accounts.data.map(rowToAccount),
      categories: categories.data.map(rowToCategory),
      transactions: txs,
      budgets: budgets.data.map(rowToBudget),
      goals: goals.data.map(rowToGoal),
      bills: billList,
      creditCards
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
      pendingTxFilter: null
    }),

  setPendingTxFilter: (filter) => set({ pendingTxFilter: filter })
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

/** `in-use` when transactions, goals, or cards still reference the account. */
export async function deleteAccount(id: string): Promise<DeleteResult> {
  if (state().transactions.some((tx) => tx.accountId === id || tx.toAccountId === id)) return 'in-use'
  if (state().goals.some((g) => g.accountId === id)) return 'in-use'
  if (state().creditCards.some((c) => c.issuingAccountId === id)) return 'in-use'
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
    account_id: input.accountId ?? null,
    card_id: input.cardId ?? null,
    to_account_id: input.toAccountId ?? null,
    category_id: input.categoryId ?? null,
    note: input.note,
    is_recurring: input.isRecurring
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

/* --------------------------------- goals --------------------------------- */

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

/* --------------------------------- bills --------------------------------- */

export type BillInput = Omit<Bill, 'id'>

function billRow(id: string, input: BillInput) {
  return {
    id,
    name: input.name,
    amount: input.amount,
    due_date: input.dueDate,
    status: input.status,
    recurring: input.recurring,
    card_id: input.cardId ?? null,
    paid_at: input.status === 'paid' ? new Date().toISOString() : null
  }
}

export async function addBill(input: BillInput): Promise<SaveResult> {
  const bill: Bill = { ...input, id: newId() }
  const { error } = await supabase.from('bills').insert(billRow(bill.id, input))
  if (error) return 'error'
  patch({ bills: [...state().bills, bill] })
  return 'ok'
}

export async function updateBill(id: string, input: BillInput): Promise<SaveResult> {
  const { id: _, ...row } = billRow(id, input)
  const { error } = await supabase.from('bills').update(row).eq('id', id)
  if (error) return 'error'
  patch({ bills: state().bills.map((b) => (b.id === id ? { ...input, id } : b)) })
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
  const { error } = await supabase
    .from('bills')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return 'error'
  patch({ bills: state().bills.map((b) => (b.id === id ? { ...b, status: 'paid' } : b)) })
  return 'ok'
}

export type BillAlertState = 'overdue' | 'dueSoon'

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

/** Pay a card-generated bill from a chosen bank account: books a real expense, then marks paid. */
export async function payCardBill(bill: Bill, accountId: string): Promise<SaveResult> {
  const txResult = await addTransaction({
    date: todayISO(),
    type: 'expense',
    amount: bill.amount,
    accountId,
    note: bill.name,
    isRecurring: false
  })
  if (txResult !== 'ok') return 'error'
  return markBillPaid(bill.id)
}

/* ----------------------------- credit cards ------------------------------ */

export type CardInput = Omit<CreditCard, 'id' | 'archived'>

function cardRow(id: string, input: CardInput) {
  return {
    id,
    name: input.name,
    issuing_account_id: input.issuingAccountId ?? null,
    closing_day: input.closingDay,
    due_day: input.dueDay,
    credit_limit: input.creditLimit ?? null,
    color: input.color
  }
}

export async function addCard(input: CardInput): Promise<SaveResult> {
  const card: CreditCard = { ...input, id: newId(), archived: false }
  const { error } = await supabase.from('credit_cards').insert(cardRow(card.id, input))
  if (error) return 'error'
  patch({ creditCards: [...state().creditCards, card] })
  return 'ok'
}

export async function updateCard(id: string, input: CardInput): Promise<SaveResult> {
  const { id: _, ...row } = cardRow(id, input)
  const { error } = await supabase.from('credit_cards').update(row).eq('id', id)
  if (error) return 'error'
  patch({ creditCards: state().creditCards.map((c) => (c.id === id ? { ...c, ...input } : c)) })
  return 'ok'
}

export async function setCardArchived(id: string, archived: boolean): Promise<SaveResult> {
  const { error } = await supabase.from('credit_cards').update({ archived }).eq('id', id)
  if (error) return 'error'
  patch({ creditCards: state().creditCards.map((c) => (c.id === id ? { ...c, archived } : c)) })
  return 'ok'
}

/** `in-use` when transactions or bills still reference the card. */
export async function deleteCard(id: string): Promise<DeleteResult> {
  if (state().transactions.some((tx) => tx.cardId === id)) return 'in-use'
  if (state().bills.some((b) => b.cardId === id)) return 'in-use'
  const { error } = await supabase.from('credit_cards').delete().eq('id', id)
  if (error) return error.code === '23503' ? 'in-use' : 'error'
  patch({ creditCards: state().creditCards.filter((c) => c.id !== id) })
  return 'ok'
}

/* -------------------------- card billing cycles -------------------------- */

/** The most recent closing date on-or-before `today` — the current cycle's start. */
function lastClosingDate(today: string, closingDay: number): string {
  const d = parseISODate(today)
  const thisClose = isoForDay(d.getFullYear(), d.getMonth(), closingDay)
  return today >= thisClose ? thisClose : isoForDay(d.getFullYear(), d.getMonth() - 1, closingDay)
}

/** The due date for a cycle that closed on `closingISO`: the first due-day strictly after it. */
function dueForClosing(closingISO: string, dueDay: number): string {
  const c = parseISODate(closingISO)
  const sameMonth = isoForDay(c.getFullYear(), c.getMonth(), dueDay)
  return sameMonth > closingISO ? sameMonth : isoForDay(c.getFullYear(), c.getMonth() + 1, dueDay)
}

/** Up to `count` closing dates strictly before `today`, most recent first. */
function recentClosings(today: string, closingDay: number, count: number): string[] {
  const d = parseISODate(today)
  const result: string[] = []
  for (let i = 0; result.length < count && i <= count; i++) {
    const iso = isoForDay(d.getFullYear(), d.getMonth() - i, closingDay)
    if (iso < today) result.push(iso)
  }
  return result
}

/** Current open (not-yet-closed) invoice: card expenses since the last closing day. */
export function cardOpenInvoice(card: CreditCard, transactions: Transaction[], today: string = todayISO()): number {
  const since = lastClosingDate(today, card.closingDay)
  let total = 0
  for (const tx of transactions) {
    if (tx.type === 'expense' && tx.cardId === card.id && tx.date > since && tx.date <= today) total += tx.amount
  }
  return total
}

/** Next due date for a card's open invoice: the next due-day on-or-after today. */
export function nextCardDue(card: CreditCard, today: string = todayISO()): string {
  const d = parseISODate(today)
  const thisDue = isoForDay(d.getFullYear(), d.getMonth(), card.dueDay)
  return thisDue >= today ? thisDue : isoForDay(d.getFullYear(), d.getMonth() + 1, card.dueDay)
}

/**
 * Lazy bill generation. For each active card, any recently-closed cycle that
 * has no bill yet (deduped by card + due date) gets a `bills` row created with
 * the cycle's total and due date. A short look-back keeps a never-checked
 * account from back-filling ancient history all at once.
 */
async function ensureCardBills(
  cards: CreditCard[],
  transactions: Transaction[],
  existingBills: Bill[]
): Promise<Bill[]> {
  const today = todayISO()
  const created: Bill[] = []
  const alreadyBilled = (cardId: string, due: string): boolean =>
    existingBills.some((b) => b.cardId === cardId && b.dueDate === due) ||
    created.some((b) => b.cardId === cardId && b.dueDate === due)

  for (const card of cards) {
    if (card.archived) continue
    for (const closing of recentClosings(today, card.closingDay, 2)) {
      const c = parseISODate(closing)
      const cycleStart = isoForDay(c.getFullYear(), c.getMonth() - 1, card.closingDay)
      let total = 0
      for (const tx of transactions) {
        if (tx.type === 'expense' && tx.cardId === card.id && tx.date > cycleStart && tx.date <= closing) {
          total += tx.amount
        }
      }
      if (total <= 0) continue
      const due = dueForClosing(closing, card.dueDay)
      if (alreadyBilled(card.id, due)) continue
      const input: BillInput = { name: card.name, amount: total, dueDate: due, status: 'pending', recurring: false, cardId: card.id }
      const id = newId()
      const { error } = await supabase.from('bills').insert(billRow(id, input))
      if (!error) created.push({ ...input, id })
    }
  }
  return created
}

/* -------------------------------- derived -------------------------------- */

/**
 * CASH-FLOW totals: only bank-account transactions count (a card purchase has
 * no `accountId`). Card spending reaches cash flow once, when its invoice is
 * paid — a real expense on the paying account — so it is never double-counted
 * against the individual card purchases. Used by the Income/Expenses cards, the
 * cash-flow chart, the month-end projection, and the health savings-rate.
 */
export function monthTotals(transactions: Transaction[], month: string): { income: number; expense: number } {
  let income = 0
  let expense = 0
  for (const tx of transactions) {
    if (monthKey(tx.date) !== month || !tx.accountId) continue
    if (tx.type === 'income') income += tx.amount
    if (tx.type === 'expense') expense += tx.amount
  }
  return { income, expense }
}

/**
 * CATEGORY spending: categorised expenses regardless of account vs. card, so
 * card purchases show up in the donut / budgets / insights. Uncategorised
 * expenses are excluded — which also keeps card-invoice PAYMENTS (recorded
 * uncategorised) out of the per-category view, again avoiding a double-count.
 */
export function spendingByCategory(transactions: Transaction[], month: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.type !== 'expense' || monthKey(tx.date) !== month || !tx.categoryId) continue
    map.set(tx.categoryId, (map.get(tx.categoryId) ?? 0) + tx.amount)
  }
  return map
}

/* --------------------------- dashboard analytics -------------------------- */

/** Net worth (active accounts) as of the END of `month` — only counts transactions dated on/before it. */
export function netWorthAsOf(accounts: Account[], transactions: Transaction[], month: string): number {
  const upTo = transactions.filter((tx) => monthKey(tx.date) <= month)
  return accounts.filter((a) => !a.archived).reduce((sum, a) => sum + accountBalance(a, upTo), 0)
}

/** Net worth at the end of each of the given months (same order). */
export function netWorthSeries(accounts: Account[], transactions: Transaction[], months: string[]): number[] {
  return months.map((m) => netWorthAsOf(accounts, transactions, m))
}

/** Percentage change from `previous` to `current`; `null` when there is no baseline to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / Math.abs(previous)) * 100
}

export type InsightKind = 'increase' | 'decrease' | 'budgetNear'

export interface Insight {
  kind: InsightKind
  category: string
  /** Magnitude in percent — increase/decrease amount, or budget usage for `budgetNear`. */
  pct: number
}

/**
 * Rule-based (no LLM) observations, ranked by magnitude. Rules:
 *  • `increase`   — expense category most above its trailing 3-month average.
 *  • `decrease`   — expense category most below its trailing 3-month average.
 *  • `budgetNear` — budget category at/above 90% of its limit this month.
 * A signal must clear a threshold to count, so quiet months surface nothing.
 */
export function computeInsights(
  transactions: Transaction[],
  categories: Category[],
  budgets: Budget[],
  month: string
): Insight[] {
  const MIN_SWING_PCT = 15 // ignore trailing-average swings smaller than this
  const MIN_AMOUNT = 20 // and categories the user barely spends in
  const BUDGET_NEAR = 0.9 // 90%+ of a limit is "near"

  const current = spendingByCategory(transactions, month)
  const trailing = [1, 2, 3].map((d) => spendingByCategory(transactions, shiftMonthKey(month, -d)))
  const nameOf = (id: string): string | null => categories.find((c) => c.id === id)?.name ?? null

  const insights: Insight[] = []

  for (const [categoryId, now] of current) {
    const name = nameOf(categoryId)
    if (!name || now < MIN_AMOUNT) continue
    // Trailing average only over months that actually had a prior baseline.
    const priors = trailing.map((m) => m.get(categoryId) ?? 0)
    const avg = priors.reduce((s, v) => s + v, 0) / priors.length
    if (avg < MIN_AMOUNT) continue
    const swing = ((now - avg) / avg) * 100
    if (swing >= MIN_SWING_PCT) insights.push({ kind: 'increase', category: name, pct: swing })
    else if (swing <= -MIN_SWING_PCT) insights.push({ kind: 'decrease', category: name, pct: -swing })
  }

  for (const budget of budgets) {
    const name = nameOf(budget.categoryId)
    if (!name || budget.monthlyLimit <= 0) continue
    const usage = (current.get(budget.categoryId) ?? 0) / budget.monthlyLimit
    if (usage >= BUDGET_NEAR) insights.push({ kind: 'budgetNear', category: name, pct: usage * 100 })
  }

  return insights.sort((a, b) => b.pct - a.pct).slice(0, 3)
}

export interface Recurring {
  key: string
  name: string
  amount: number
  nextCharge: string
  color: string
}

/**
 * Recurring/subscription-like expenses. A group of same-category expenses that
 * share a note counts when the user flagged any of them (`is_recurring`) OR they
 * repeat across ≥3 distinct months with amounts within ~35% of each other. The
 * next charge is estimated as the last occurrence + 1 month.
 */
export function detectRecurring(transactions: Transaction[], categories: Category[]): Recurring[] {
  const AMOUNT_TOLERANCE = 1.35 // max/min amount ratio within a group
  const MIN_MONTHS = 3 // distinct months before a group is "recurring" on its own

  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    const note = tx.note.trim().toLowerCase()
    const key = `${tx.categoryId ?? ''}|${note}`
    const list = groups.get(key) ?? []
    list.push(tx)
    groups.set(key, list)
  }

  const results: Recurring[] = []
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
    const flagged = sorted.some((tx) => tx.isRecurring)
    const months = new Set(sorted.map((tx) => monthKey(tx.date)))
    const amounts = sorted.map((tx) => tx.amount)
    const similar = Math.max(...amounts) / Math.min(...amounts) <= AMOUNT_TOLERANCE
    if (!flagged && !(months.size >= MIN_MONTHS && similar)) continue

    const last = sorted[sorted.length - 1]
    const category = categories.find((c) => c.id === last.categoryId)
    results.push({
      key,
      name: last.note.trim() || category?.name || '—',
      amount: last.amount,
      nextCharge: addMonths(last.date, 1),
      color: category?.color ?? 'var(--muted-foreground)'
    })
  }

  return results.sort((a, b) => b.amount - a.amount)
}

export type HealthBand = 'healthy' | 'good' | 'attention' | 'critical'

export interface HealthScore {
  score: number
  band: HealthBand
}

/**
 * Composite 0–100 financial-health score. Three weighted factors (tune here):
 *   • savingsRate  (40%) — (income − expense) / income this month, where a 20%+
 *                          savings rate earns full marks.
 *   • budgetAdherence (30%) — share of budget categories at/under their limit
 *                          (neutral 0.7 when no budgets exist).
 *   • netWorthTrend (30%) — net worth now vs. 3 months ago: improving=1,
 *                          flat=0.5, declining=0.
 * Bands: ≥75 healthy · ≥50 good · ≥25 attention · else critical.
 */
export function computeHealthScore(
  accounts: Account[],
  transactions: Transaction[],
  budgets: Budget[],
  month: string
): HealthScore {
  const { income, expense } = monthTotals(transactions, month)
  const savingsRate = income > 0 ? (income - expense) / income : 0
  const savingsScore = Math.max(0, Math.min(1, savingsRate / 0.2))

  const spent = spendingByCategory(transactions, month)
  const under = budgets.filter((b) => (spent.get(b.categoryId) ?? 0) <= b.monthlyLimit).length
  const adherence = budgets.length > 0 ? under / budgets.length : 0.7

  const now = netWorthAsOf(accounts, transactions, month)
  const past = netWorthAsOf(accounts, transactions, shiftMonthKey(month, -3))
  const trend = now > past * 1.01 ? 1 : now < past * 0.99 ? 0 : 0.5

  const score = Math.round(100 * (0.4 * savingsScore + 0.3 * adherence + 0.3 * trend))
  const band: HealthBand = score >= 75 ? 'healthy' : score >= 50 ? 'good' : score >= 25 ? 'attention' : 'critical'
  return { score, band }
}
