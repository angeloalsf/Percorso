import { addMonths, monthKey, shiftMonthKey } from '@/lib/dates'
import { accountBalance } from './accounts'
import type { Account, Budget, Category, Transaction } from './types'

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

type InsightKind = 'increase' | 'decrease' | 'budgetNear'

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
