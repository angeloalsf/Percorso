import { addMonths, isoForDay, monthKey, shiftMonthKey } from '@/lib/dates'
import { accountBalance } from './accounts'
import { cardOpenInvoice, nextCardDue } from './cards'
import { planNextDue } from './plans'
import type { Account, Bill, Budget, Category, CreditCard, InstallmentPlan, Transaction } from './types'

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

/** Cash held at month end. Archived accounts remain in historical months. */
export function netWorthAsOf(accounts: Account[], transactions: Transaction[], month: string): number {
  const cutoff = `${month}-31`
  const upTo = transactions.filter((tx) => tx.date <= cutoff)
  return accounts
    .filter(
      (a) =>
        (a.openingDate ?? '0000-01-01') <= cutoff &&
        (!a.archived || (a.archivedAt !== undefined && a.archivedAt > cutoff))
    )
    .reduce(
      (sum, a) =>
        sum +
        accountBalance(
          a,
          upTo.filter((tx) => tx.date >= (a.openingDate ?? '0000-01-01'))
        ),
      0
    )
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
    if (!note && !tx.isRecurring) continue
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

export type HealthBand = 'healthy' | 'good' | 'attention' | 'critical' | 'insufficientData'

export interface HealthScore {
  score: number
  band: HealthBand
  factors?: { savings: number; budgets: number; trend: number }
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
  const history = new Set(
    transactions.filter((tx) => tx.type === 'income' && tx.date <= `${month}-31`).map((tx) => monthKey(tx.date))
  )
  if (income <= 0 || history.size < 2) return { score: 0, band: 'insufficientData' }
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
  return {
    score,
    band,
    factors: {
      savings: Math.round(savingsScore * 100),
      budgets: Math.round(adherence * 100),
      trend: Math.round(trend * 100)
    }
  }
}

/** Sum of all actual consumption, whether charged to an account or a card. */
export function consumptionTotal(transactions: Transaction[], month: string): number {
  return transactions
    .filter((tx) => tx.type === 'expense' && tx.categoryId && monthKey(tx.date) === month)
    .reduce((sum, tx) => sum + tx.amount, 0)
}

export interface ForecastPoint {
  date: string
  balance: number
  income: number
  expenses: number
}

/** Explicit pending bills plus recurring income estimates; excludes paid and past obligations. */
export function cashForecast(
  openingBalance: number,
  transactions: Transaction[],
  bills: Bill[],
  today: string,
  days = 90,
  cards: CreditCard[] = [],
  plans: InstallmentPlan[] = []
): ForecastPoint[] {
  const points: ForecastPoint[] = []
  const date = new Date(`${today}T12:00:00`)
  let balance = openingBalance
  const recurringIncome = new Map<string, Transaction>()
  for (const tx of transactions.filter((t) => t.type === 'income' && t.isRecurring && t.date <= today)) {
    const key = `${tx.accountId}|${tx.categoryId}|${tx.note.trim().toLowerCase()}`
    if (!recurringIncome.has(key) || recurringIncome.get(key)!.date < tx.date) recurringIncome.set(key, tx)
  }
  const expectedBills = [...bills.filter((bill) => bill.status === 'pending')]
  for (const card of cards.filter((c) => !c.archived)) {
    const amount = cardOpenInvoice(card, transactions, today)
    const dueDate = nextCardDue(card, today)
    if (amount > 0 && !expectedBills.some((b) => b.cardId === card.id && b.dueDate === dueDate))
      expectedBills.push({
        id: `open-${card.id}`,
        name: card.name,
        amount,
        dueDate,
        status: 'pending',
        recurring: false,
        cardId: card.id
      })
  }
  for (const plan of plans) {
    const firstDue = planNextDue(plan, today)
    if (!firstDue) continue
    const first = new Date(`${firstDue}T12:00:00`)
    for (let i = 0; i < plan.installmentsTotal - plan.installmentsPaid; i++) {
      expectedBills.push({
        id: `installment-${plan.id}-${i}`,
        name: plan.name,
        amount: plan.installmentAmount,
        dueDate: isoForDay(first.getFullYear(), first.getMonth() + i, plan.dueDay),
        status: 'pending',
        recurring: false
      })
    }
  }
  for (const bill of bills.filter((b) => b.status === 'pending' && b.recurring && !b.cardId)) {
    const due = new Date(`${bill.dueDate}T12:00:00`)
    const horizon = new Date(`${today}T12:00:00`)
    horizon.setDate(horizon.getDate() + days)
    for (let step = 1; step <= 4; step++) {
      const future = isoForDay(due.getFullYear(), due.getMonth() + step, due.getDate())
      if (future > horizon.toISOString().slice(0, 10)) break
      if (!expectedBills.some((b) => b.dueDate === future && b.name === bill.name))
        expectedBills.push({ ...bill, dueDate: future })
    }
  }
  for (let offset = 1; offset <= days; offset++) {
    date.setDate(date.getDate() + 1)
    const day = date.toISOString().slice(0, 10)
    const income = [...recurringIncome.values()]
      .filter((tx) => isoForDay(date.getFullYear(), date.getMonth(), Number(tx.date.slice(8, 10))) === day)
      .reduce((sum, tx) => sum + tx.amount, 0)
    const expenses = expectedBills
      .filter((bill) => bill.dueDate === day || (offset === 1 && bill.dueDate <= today))
      .reduce((sum, bill) => sum + bill.amount, 0)
    balance += income - expenses
    points.push({ date: day, balance, income, expenses })
  }
  return points
}
