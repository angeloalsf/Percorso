export type AccountType = 'checking' | 'savings' | 'cash' | 'investment'

export interface Account {
  id: string
  name: string
  type: AccountType
  initialBalance: number
  /** Date on which the opening balance became effective. */
  openingDate?: string
  color: string
  archived: boolean
  archivedAt?: string
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
  importReference?: string
}

export interface Budget {
  id: string
  categoryId: string
  monthlyLimit: number
  effectiveFrom?: string
}

export interface BudgetLimitHistory {
  categoryId: string
  monthlyLimit: number
  validFrom: string
  validUntil: string
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
 * Progress is confirmed manually through `installmentsPaid`; elapsed due dates
 * never imply that a payment happened.
 */
export interface InstallmentPlan {
  id: string
  /** Display/grouping only — does NOT dictate which account installments are paid from. */
  accountId?: string
  name: string
  totalAmount: number
  installmentAmount: number
  installmentsTotal: number
  /** Number of installments the user has actually confirmed paid. */
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
  /** A paid manual recurring bill generates the next monthly occurrence. */
  recurring: boolean
  /** Set when this bill was generated from a credit card's closed billing cycle. */
  cardId?: string
  cycleClose?: string
  recurrenceId?: string
  paymentTransactionId?: string
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
  budgetHistory: BudgetLimitHistory[]
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
