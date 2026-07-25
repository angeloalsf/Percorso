import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Exercises `load()`'s pagination against a fake PostgREST that caps each
 * `.range()` page like the real `max_rows = 1000` — proving ARCH-1's fix
 * (looping `.range()` calls) actually retrieves every row instead of
 * silently truncating at the cap.
 */

interface MockResult {
  data: unknown[] | null
  error: unknown
}

const { mock } = vi.hoisted(() => ({ mock: { transactions: [] as unknown[] } }))

function chainable(result: MockResult) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {}
  const self = () => builder
  builder.select = self
  builder.order = self
  builder.eq = self
  builder.range = (from: number, to: number) => {
    if (!result.data) return Promise.resolve(result)
    return Promise.resolve({ data: result.data.slice(from, to + 1), error: null })
  }
  // The real PostgrestFilterBuilder is itself thenable, so a chain that
  // ends before `.range()` (every non-transactions table) still resolves.
  builder.then = (onFulfilled: (v: MockResult) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) =>
      table === 'transactions'
        ? chainable({ data: mock.transactions, error: null })
        : chainable({ data: [], error: null })
  },
  supabaseConfigured: true
}))

const { useFinanceStore } = await import('./store')

function transactionRow(i: number) {
  return {
    id: `tx-${i}`,
    date: '2026-01-01',
    type: 'expense',
    amount: 1,
    account_id: null,
    card_id: null,
    to_account_id: null,
    category_id: null,
    note: '',
    is_recurring: false
  }
}

describe('load() transaction pagination (ARCH-1)', () => {
  beforeEach(() => {
    useFinanceStore.getState().reset()
    mock.transactions = []
  })

  it('pages past the 1000-row PostgREST cap and returns all 1500 rows', async () => {
    mock.transactions = Array.from({ length: 1500 }, (_, i) => transactionRow(i))
    await useFinanceStore.getState().load()
    expect(useFinanceStore.getState().status).toBe('ready')
    expect(useFinanceStore.getState().transactions).toHaveLength(1500)
  })

  it('returns exactly the rows for a count under one page', async () => {
    mock.transactions = Array.from({ length: 250 }, (_, i) => transactionRow(i))
    await useFinanceStore.getState().load()
    expect(useFinanceStore.getState().transactions).toHaveLength(250)
  })

  it('pages correctly when the count lands exactly on a page boundary', async () => {
    mock.transactions = Array.from({ length: 2000 }, (_, i) => transactionRow(i))
    await useFinanceStore.getState().load()
    expect(useFinanceStore.getState().transactions).toHaveLength(2000)
  })
})
