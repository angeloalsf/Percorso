import type {
  Account,
  Bill,
  Budget,
  Category,
  Consortium,
  CreditCard,
  Goal,
  InstallmentPlan,
  Loan,
  Transaction
} from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToAccount(r: any): Account {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    initialBalance: Number(r.initial_balance),
    color: r.color,
    archived: r.archived
  }
}

export function rowToCategory(r: any): Category {
  return { id: r.id, name: r.name, type: r.type, color: r.color }
}

export function rowToTransaction(r: any): Transaction {
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

export function rowToBudget(r: any): Budget {
  return { id: r.id, categoryId: r.category_id, monthlyLimit: Number(r.monthly_limit) }
}

export function rowToGoal(r: any): Goal {
  return {
    id: r.id,
    name: r.name,
    targetAmount: Number(r.target_amount),
    targetDate: r.target_date ?? undefined,
    accountId: r.account_id ?? undefined,
    savedAmount: Number(r.saved_amount)
  }
}

export function rowToBill(r: any): Bill {
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

export function rowToInstallmentPlan(r: any): InstallmentPlan {
  return {
    id: r.id,
    accountId: r.account_id ?? undefined,
    name: r.name,
    totalAmount: Number(r.total_amount),
    installmentAmount: Number(r.installment_amount),
    installmentsTotal: r.installments_total,
    installmentsPaid: r.installments_paid,
    paidAsOf: r.paid_as_of,
    dueDay: r.due_day
  }
}

export function rowToLoan(r: any): Loan {
  return rowToInstallmentPlan(r)
}

export function rowToConsortium(r: any): Consortium {
  return { ...rowToInstallmentPlan(r), contemplated: r.contemplated }
}

export function rowToCreditCard(r: any): CreditCard {
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
