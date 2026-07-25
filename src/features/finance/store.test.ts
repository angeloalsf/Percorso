import { describe, expect, it } from 'vitest'
import type { Account, Bill, Budget, Category, CreditCard, Loan, Transaction } from './store'
import {
  accountBalance,
  billAlerts,
  cardOpenInvoice,
  computeHealthScore,
  detectRecurring,
  installmentsPaidNow,
  monthTotals,
  netWorthAsOf,
  netWorthSeries,
  nextCardDue,
  pctChange,
  planNextDue,
  planRemaining,
  spendingByCategory
} from './store'

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    name: 'Checking',
    type: 'checking',
    initialBalance: 1000,
    color: '#000',
    archived: false,
    ...overrides
  }
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${Math.random()}`,
    date: '2026-07-10',
    type: 'expense',
    amount: 100,
    note: '',
    isRecurring: false,
    ...overrides
  }
}

function card(overrides: Partial<CreditCard> = {}): CreditCard {
  return { id: 'card-1', name: 'Card', closingDay: 20, dueDay: 27, color: '#000', archived: false, ...overrides }
}

function plan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'plan-1',
    name: 'Loan',
    totalAmount: 12000,
    installmentAmount: 1000,
    installmentsTotal: 12,
    installmentsPaid: 0,
    paidAsOf: '2026-01-10',
    dueDay: 10,
    ...overrides
  }
}

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: `bill-${Math.random()}`,
    name: 'Bill',
    amount: 100,
    dueDate: '2026-07-25',
    status: 'pending',
    recurring: false,
    ...overrides
  }
}

/* ------------------------------ accountBalance ----------------------------- */

describe('accountBalance', () => {
  it('starts from initialBalance with no transactions', () => {
    expect(accountBalance(account({ initialBalance: 500 }), [])).toBe(500)
  })

  it('adds income and subtracts expenses on the account', () => {
    const a = account({ initialBalance: 0 })
    const txs = [
      tx({ type: 'income', accountId: a.id, amount: 300 }),
      tx({ type: 'expense', accountId: a.id, amount: 120 })
    ]
    expect(accountBalance(a, txs)).toBe(180)
  })

  it('ignores transactions on other accounts', () => {
    const a = account({ initialBalance: 100 })
    const txs = [tx({ type: 'income', accountId: 'other', amount: 999 })]
    expect(accountBalance(a, txs)).toBe(100)
  })

  it('a transfer debits the source and credits the destination', () => {
    const a = account({ id: 'a', initialBalance: 500 })
    const b = account({ id: 'b', initialBalance: 500 })
    const txs = [tx({ type: 'transfer', accountId: 'a', toAccountId: 'b', amount: 200 })]
    expect(accountBalance(a, txs)).toBe(300)
    expect(accountBalance(b, txs)).toBe(700)
  })

  it('ignores card purchases (no accountId) entirely', () => {
    const a = account({ initialBalance: 100 })
    const txs = [tx({ type: 'expense', cardId: 'card-1', accountId: undefined, amount: 50 })]
    expect(accountBalance(a, txs)).toBe(100)
  })
})

/* -------------------------------- netWorthAsOf ------------------------------ */

describe('netWorthAsOf / netWorthSeries', () => {
  it('sums active accounts and excludes archived ones', () => {
    const a = account({ id: 'a', initialBalance: 100, archived: false })
    const b = account({ id: 'b', initialBalance: 900, archived: true })
    expect(netWorthAsOf([a, b], [], '2026-07')).toBe(100)
  })

  it('only counts transactions dated on or before the given month', () => {
    const a = account({ id: 'a', initialBalance: 0 })
    const txs = [
      tx({ type: 'income', accountId: 'a', amount: 100, date: '2026-06-15' }),
      tx({ type: 'income', accountId: 'a', amount: 500, date: '2026-08-01' })
    ]
    expect(netWorthAsOf([a], txs, '2026-07')).toBe(100)
  })

  it('netWorthSeries maps netWorthAsOf over each month in order', () => {
    const a = account({ id: 'a', initialBalance: 0 })
    const txs = [tx({ type: 'income', accountId: 'a', amount: 50, date: '2026-06-01' })]
    expect(netWorthSeries([a], txs, ['2026-05', '2026-06', '2026-07'])).toEqual([0, 50, 50])
  })
})

/* --------------------------------- pctChange -------------------------------- */

describe('pctChange', () => {
  it('computes a positive percentage increase', () => {
    expect(pctChange(150, 100)).toBe(50)
  })

  it('computes a negative percentage decrease', () => {
    expect(pctChange(50, 100)).toBe(-50)
  })

  it('uses the absolute previous value as the denominator (negative baseline)', () => {
    expect(pctChange(-50, -100)).toBe(50)
  })

  it('returns 0 when both current and previous are 0', () => {
    expect(pctChange(0, 0)).toBe(0)
  })

  it('returns null when there is no baseline to compare against', () => {
    expect(pctChange(100, 0)).toBeNull()
  })
})

/* -------------------------------- monthTotals ------------------------------- */

describe('monthTotals', () => {
  it('sums bank-account income and expense for the given month only', () => {
    const txs = [
      tx({ type: 'income', accountId: 'a', amount: 1000, date: '2026-07-01' }),
      tx({ type: 'expense', accountId: 'a', amount: 300, date: '2026-07-15' }),
      tx({ type: 'expense', accountId: 'a', amount: 999, date: '2026-06-30' })
    ]
    expect(monthTotals(txs, '2026-07')).toEqual({ income: 1000, expense: 300 })
  })

  it('excludes card purchases (no accountId) to avoid double-counting the eventual bill payment', () => {
    const txs = [tx({ type: 'expense', cardId: 'card-1', accountId: undefined, amount: 500, date: '2026-07-05' })]
    expect(monthTotals(txs, '2026-07')).toEqual({ income: 0, expense: 0 })
  })

  it('excludes transfers', () => {
    const txs = [tx({ type: 'transfer', accountId: 'a', toAccountId: 'b', amount: 500, date: '2026-07-05' })]
    expect(monthTotals(txs, '2026-07')).toEqual({ income: 0, expense: 0 })
  })
})

/* ---------------------------- spendingByCategory ----------------------------- */

describe('spendingByCategory', () => {
  it('sums categorized expenses regardless of bank vs. card', () => {
    const txs = [
      tx({ type: 'expense', accountId: 'a', categoryId: 'food', amount: 40, date: '2026-07-01' }),
      tx({ type: 'expense', cardId: 'card-1', categoryId: 'food', amount: 60, date: '2026-07-02' })
    ]
    expect(spendingByCategory(txs, '2026-07').get('food')).toBe(100)
  })

  it('excludes uncategorized expenses, which keeps a card-invoice payment out of the view', () => {
    const txs = [tx({ type: 'expense', accountId: 'a', categoryId: undefined, amount: 500, date: '2026-07-25' })]
    expect(spendingByCategory(txs, '2026-07').size).toBe(0)
  })

  it('excludes income and transactions outside the month', () => {
    const txs = [
      tx({ type: 'income', accountId: 'a', categoryId: 'salary', amount: 3000, date: '2026-07-01' }),
      tx({ type: 'expense', accountId: 'a', categoryId: 'food', amount: 10, date: '2026-06-30' })
    ]
    expect(spendingByCategory(txs, '2026-07').size).toBe(0)
  })
})

/* -------------------------------- billAlerts -------------------------------- */

describe('billAlerts', () => {
  const today = '2026-07-25'

  it('flags a pending bill past its due date as overdue', () => {
    const b = bill({ dueDate: '2026-07-20', status: 'pending' })
    expect(billAlerts([b], today)).toEqual([{ bill: b, state: 'overdue' }])
  })

  it('flags a pending bill due within the window as dueSoon', () => {
    const b = bill({ dueDate: '2026-07-30', status: 'pending' })
    expect(billAlerts([b], today, 7)).toEqual([{ bill: b, state: 'dueSoon' }])
  })

  it('ignores a bill due beyond the window', () => {
    const b = bill({ dueDate: '2026-08-15', status: 'pending' })
    expect(billAlerts([b], today, 7)).toEqual([])
  })

  it('never alerts on a paid bill, even if its due date is past', () => {
    const b = bill({ dueDate: '2026-07-01', status: 'paid' })
    expect(billAlerts([b], today)).toEqual([])
  })

  it('sorts overdue bills before dueSoon bills, each ascending by date', () => {
    const soonLater = bill({ id: 'soon-later', dueDate: '2026-07-29', status: 'pending' })
    const soonSooner = bill({ id: 'soon-sooner', dueDate: '2026-07-27', status: 'pending' })
    const overdueOlder = bill({ id: 'overdue-older', dueDate: '2026-07-10', status: 'pending' })
    const overdueNewer = bill({ id: 'overdue-newer', dueDate: '2026-07-20', status: 'pending' })
    const result = billAlerts([soonLater, soonSooner, overdueOlder, overdueNewer], today)
    expect(result.map((a) => a.bill.id)).toEqual(['overdue-older', 'overdue-newer', 'soon-sooner', 'soon-later'])
  })
})

/* ----------------------------- installment plans ----------------------------- */

describe('installmentsPaidNow', () => {
  it('returns the baseline unchanged when today is on-or-before paidAsOf', () => {
    expect(installmentsPaidNow(plan({ installmentsPaid: 3, paidAsOf: '2026-01-10' }), '2026-01-10')).toBe(3)
  })

  it('advances one installment per elapsed due day', () => {
    const p = plan({ installmentsPaid: 0, paidAsOf: '2026-01-10', dueDay: 10 })
    expect(installmentsPaidNow(p, '2026-04-10')).toBe(3)
  })

  it('does not count a due day that has not arrived yet this month', () => {
    const p = plan({ installmentsPaid: 0, paidAsOf: '2026-01-10', dueDay: 10 })
    expect(installmentsPaidNow(p, '2026-02-09')).toBe(0)
    expect(installmentsPaidNow(p, '2026-02-10')).toBe(1)
  })

  it('caps at installmentsTotal even if more due dates have elapsed', () => {
    const p = plan({ installmentsPaid: 0, paidAsOf: '2020-01-10', dueDay: 10, installmentsTotal: 12 })
    expect(installmentsPaidNow(p, '2026-07-25')).toBe(12)
  })
})

describe('planRemaining', () => {
  it('is unpaid installments times the installment amount', () => {
    const p = plan({ installmentsPaid: 4, paidAsOf: '2026-07-25', installmentsTotal: 12, installmentAmount: 1000 })
    expect(planRemaining(p, '2026-07-25')).toBe(8000)
  })

  it('never goes negative once fully paid', () => {
    const p = plan({ installmentsPaid: 12, paidAsOf: '2026-07-25', installmentsTotal: 12, installmentAmount: 1000 })
    expect(planRemaining(p, '2026-07-25')).toBe(0)
  })
})

describe('planNextDue', () => {
  it('returns the next due day on-or-after today, this month', () => {
    const p = plan({ dueDay: 28, installmentsPaid: 0, paidAsOf: '2026-06-01', installmentsTotal: 12 })
    expect(planNextDue(p, '2026-07-25')).toBe('2026-07-28')
  })

  it('rolls to next month when this month due day has passed', () => {
    const p = plan({ dueDay: 10, installmentsPaid: 0, paidAsOf: '2026-06-01', installmentsTotal: 12 })
    expect(planNextDue(p, '2026-07-25')).toBe('2026-08-10')
  })

  it('returns null once the plan is fully paid', () => {
    const p = plan({ dueDay: 10, installmentsPaid: 12, paidAsOf: '2026-07-25', installmentsTotal: 12 })
    expect(planNextDue(p, '2026-07-25')).toBeNull()
  })
})

/* ------------------------------- credit cards -------------------------------- */

describe('cardOpenInvoice', () => {
  it('sums card expenses since the last closing day, up to today', () => {
    const c = card({ closingDay: 20 })
    const txs = [
      tx({ type: 'expense', cardId: c.id, amount: 50, date: '2026-07-21' }),
      tx({ type: 'expense', cardId: c.id, amount: 30, date: '2026-07-25' }),
      tx({ type: 'expense', cardId: c.id, amount: 999, date: '2026-07-19' }) // in the prior (already-closed) cycle
    ]
    expect(cardOpenInvoice(c, txs, '2026-07-25')).toBe(80)
  })

  it('ignores expenses on other cards and non-expense transactions', () => {
    const c = card({ closingDay: 20 })
    const txs = [
      tx({ type: 'expense', cardId: 'other-card', amount: 50, date: '2026-07-21' }),
      tx({ type: 'income', cardId: c.id, amount: 999, date: '2026-07-21' })
    ]
    expect(cardOpenInvoice(c, txs, '2026-07-25')).toBe(0)
  })

  it('rolls the cycle start into the previous month when today is before this month closing day', () => {
    const c = card({ closingDay: 20 })
    // today=2026-07-10 → since = 2026-06-20; a purchase on 2026-07-01 is in-cycle.
    const txs = [tx({ type: 'expense', cardId: c.id, amount: 40, date: '2026-07-01' })]
    expect(cardOpenInvoice(c, txs, '2026-07-10')).toBe(40)
  })
})

describe('nextCardDue', () => {
  it('returns this month due day when it is on-or-after today', () => {
    expect(nextCardDue(card({ dueDay: 27 }), '2026-07-25')).toBe('2026-07-27')
  })

  it('rolls to next month once the due day has passed', () => {
    expect(nextCardDue(card({ dueDay: 27 }), '2026-07-28')).toBe('2026-08-27')
  })
})

/* ------------------------------- detectRecurring ------------------------------ */

describe('detectRecurring', () => {
  const categories: Category[] = [{ id: 'sub', name: 'Subscriptions', type: 'expense', color: '#000' }]

  it('flags a transaction the user explicitly marked recurring, even as a single occurrence', () => {
    const txs = [tx({ note: 'Gym', categoryId: 'sub', amount: 80, isRecurring: true, date: '2026-07-01' })]
    const result = detectRecurring(txs, categories)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Gym')
    expect(result[0].nextCharge).toBe('2026-08-01')
  })

  it('detects an unflagged group repeating across 3+ months with similar amounts', () => {
    const txs = [
      tx({ note: 'Streaming', categoryId: 'sub', amount: 40, date: '2026-05-01' }),
      tx({ note: 'Streaming', categoryId: 'sub', amount: 41, date: '2026-06-01' }),
      tx({ note: 'Streaming', categoryId: 'sub', amount: 42, date: '2026-07-01' })
    ]
    expect(detectRecurring(txs, categories).map((r) => r.name)).toEqual(['Streaming'])
  })

  it('does not flag a group spanning fewer than 3 months when unflagged', () => {
    const txs = [
      tx({ note: 'Streaming', categoryId: 'sub', amount: 40, date: '2026-06-01' }),
      tx({ note: 'Streaming', categoryId: 'sub', amount: 40, date: '2026-07-01' })
    ]
    expect(detectRecurring(txs, categories)).toEqual([])
  })

  it('does not flag a 3+ month group whose amounts vary too much', () => {
    const txs = [
      tx({ note: 'Groceries', categoryId: 'sub', amount: 40, date: '2026-05-01' }),
      tx({ note: 'Groceries', categoryId: 'sub', amount: 120, date: '2026-06-01' }),
      tx({ note: 'Groceries', categoryId: 'sub', amount: 60, date: '2026-07-01' })
    ]
    expect(detectRecurring(txs, categories)).toEqual([])
  })

  it('ignores income transactions', () => {
    const txs = [tx({ type: 'income', note: 'Salary', amount: 3000, isRecurring: true, date: '2026-07-01' })]
    expect(detectRecurring(txs, categories)).toEqual([])
  })
})

/* ------------------------------ computeHealthScore ----------------------------- */

describe('computeHealthScore', () => {
  it('scores a high savings rate with no budgets and a growing net worth as healthy', () => {
    const a = account({ id: 'a', initialBalance: 1000 })
    const txs = [
      tx({ type: 'income', accountId: 'a', amount: 1000, date: '2026-07-01' }),
      tx({ type: 'expense', accountId: 'a', amount: 500, date: '2026-07-02' })
    ]
    const result = computeHealthScore([a], txs, [], '2026-07')
    // savingsScore=1 (50% saved, capped at the 20% full-marks threshold), adherence=0.7 (no budgets),
    // trend=1 (now=1500 vs. past=1000, the initial balance with no tx 3 months prior)
    expect(result.score).toBe(Math.round(100 * (0.4 * 1 + 0.3 * 0.7 + 0.3 * 1)))
    expect(result.band).toBe('healthy')
  })

  it('penalizes a category over its budget and a shrinking net worth', () => {
    const a = account({ id: 'a', initialBalance: 0 })
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'food', monthlyLimit: 100 }]
    const txs = [tx({ type: 'expense', accountId: 'a', categoryId: 'food', amount: 150, date: '2026-07-01' })]
    const result = computeHealthScore([a], txs, budgets, '2026-07')
    // savingsScore=0 (no income), adherence=0 (over budget), trend=0 (now=-150 vs. past=0)
    expect(result.score).toBe(0)
    expect(result.band).toBe('critical')
  })

  it('rewards net worth growth vs. 3 months prior', () => {
    const a = account({ id: 'a', initialBalance: 1000 })
    const txs = [tx({ type: 'income', accountId: 'a', amount: 5000, date: '2026-07-01' })]
    const result = computeHealthScore([a], txs, [], '2026-07')
    // now (6000) > past*1.01 (1010) → trend=1
    expect(result.score).toBeGreaterThan(computeHealthScore([a], [], [], '2026-07').score)
  })
})
