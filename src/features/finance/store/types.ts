export type AccountType = 'checking' | 'savings' | 'cash' | 'investment'

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

/**
 * A loan or a consórcio: a product tied to a bank account, not an account.
 *
 * INTENTIONALLY MINIMAL v1 — list/CRUD only. Unlike credit cards these do NOT
 * generate bills and are NOT linked to payment transactions. Progress is the
 * (`installmentsPaid`, `paidAsOf`) pair: `installmentsPaid` was true ON
 * `paidAsOf`, and `installmentsPaidNow()` rolls it forward one per `dueDay`
 * elapsed since. Replace that derivation first if real payment tracking lands.
 */
export interface InstallmentPlan {
  id: string
  /** Display/grouping only — does NOT dictate which account installments are paid from. */
  accountId?: string
  name: string
  totalAmount: number
  installmentAmount: number
  installmentsTotal: number
  /** Baseline count, true as of `paidAsOf`. Read `installmentsPaidNow()` for today's. */
  installmentsPaid: number
  /** `YYYY-MM-DD`. */
  paidAsOf: string
  dueDay: number
}

export type Loan = InstallmentPlan

export interface Consortium extends InstallmentPlan {
  /** "Contemplado": the quota has been drawn and the asset released. */
  contemplated: boolean
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

/** A drill-down request handed from the dashboard to the Transactions tab. */
export interface PendingTxFilter {
  categoryId: string
  month: string
}

export interface FinanceState {
  status: LoadStatus
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  goals: Goal[]
  bills: Bill[]
  creditCards: CreditCard[]
  loans: Loan[]
  consortiums: Consortium[]
  /** Transient (not persisted): set by a dashboard chart click, consumed by Transactions. */
  pendingTxFilter: PendingTxFilter | null
  load: () => Promise<void>
  reset: () => void
  setPendingTxFilter: (filter: PendingTxFilter | null) => void
}
