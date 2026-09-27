import { isoForDay, parseISODate, todayISO } from '@/lib/dates'
import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { billRow, type BillInput } from './bills'
import { patch, state } from './store'
import type { Bill, CreditCard, DeleteResult, SaveResult, Transaction } from './types'

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
  try {
    await reconcileCardBills()
  } catch (error) {
    console.error('Could not reconcile card invoices; they will retry on the next load.', error)
  }
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

/** All closings from the earliest purchase through today, including long absences. */
function closedCycles(today: string, closingDay: number, earliest: string): string[] {
  const start = parseISODate(earliest)
  const end = parseISODate(today)
  const result: string[] = []
  for (
    let year = start.getFullYear(), month = start.getMonth();
    year < end.getFullYear() || (year === end.getFullYear() && month <= end.getMonth());
  ) {
    const close = isoForDay(year, month, closingDay)
    if (close < today && close >= earliest) result.push(close)
    month++
    if (month === 12) {
      month = 0
      year++
    }
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

/** The open cycle is paid after its next closing date, possibly two months away. */
export function nextCardDue(card: CreditCard, today: string = todayISO()): string {
  const last = parseISODate(lastClosingDate(today, card.closingDay))
  const nextClosing = isoForDay(last.getFullYear(), last.getMonth() + 1, card.closingDay)
  return dueForClosing(nextClosing, card.dueDay)
}

/**
 * Reconciles every closed cycle since the first purchase with the `bills` table.
 *
 * A card invoice is the ONLY derived total this app persists, because a bill
 * has to exist as a row to be paid, alerted on and marked off. That makes it
 * the one place a stored number could drift from the transactions behind it,
 * so this runs on every load and re-derives rather than only filling gaps
 * (see CLAUDE.md → "Derived values"):
 *
 *   • no bill for a closed cycle yet  → insert it;
 *   • bill exists and the cycle total has changed (a purchase in it was
 *     edited, added or deleted) → update the amount to match;
 *   • bill exists but the cycle is now empty → delete the phantom bill;
 *   • bill is already PAID → left untouched. That records what was actually
 *     paid, which is history, not a derived value.
 *
 * Paid invoices remain immutable history. Pending cycles follow edits immediately.
 */
export async function syncCardBills(cards: CreditCard[], transactions: Transaction[], bills: Bill[]): Promise<Bill[]> {
  const today = todayISO()
  let result = [...bills]

  for (const card of cards) {
    const purchases = transactions.filter((tx) => tx.type === 'expense' && tx.cardId === card.id)
    const earliest = purchases.map((tx) => tx.date).sort()[0]
    const closings = earliest ? closedCycles(today, card.closingDay, earliest) : []
    const valid = new Set(closings)
    const validDues = new Set(closings.map((closing) => dueForClosing(closing, card.dueDay)))

    for (const closing of closings) {
      const c = parseISODate(closing)
      const start = isoForDay(c.getFullYear(), c.getMonth() - 1, card.closingDay)
      const total = purchases
        .filter((tx) => tx.date > start && tx.date <= closing)
        .reduce((sum, tx) => sum + tx.amount, 0)
      const due = dueForClosing(closing, card.dueDay)
      const existing = result.find(
        (b) => b.cardId === card.id && (b.cycleClose === closing || (!b.cycleClose && b.dueDate === due))
      )
      if (existing?.status === 'paid') continue
      if (total <= 0) {
        if (existing) {
          const { error } = await supabase.from('bills').delete().eq('id', existing.id)
          if (error) throw error
          result = result.filter((b) => b.id !== existing.id)
        }
      } else if (!existing) {
        const input: BillInput = {
          name: card.name,
          amount: total,
          dueDate: due,
          status: 'pending',
          recurring: false,
          cardId: card.id,
          cycleClose: closing
        }
        const id = newId()
        const { error } = await supabase.from('bills').insert(billRow(id, input))
        if (error) throw error
        result.push({ ...input, id })
      } else if (existing.amount !== total || existing.dueDate !== due || existing.cycleClose !== closing) {
        const { error } = await supabase
          .from('bills')
          .update({ amount: total, due_date: due, cycle_close: closing, name: card.name })
          .eq('id', existing.id)
        if (error) throw error
        result = result.map((b) =>
          b.id === existing.id ? { ...b, amount: total, dueDate: due, cycleClose: closing, name: card.name } : b
        )
      }
    }
    // A changed closing day can make an old pending cycle obsolete.
    for (const stale of result.filter(
      (b) =>
        b.cardId === card.id &&
        b.status === 'pending' &&
        (b.cycleClose ? !valid.has(b.cycleClose) : !validDues.has(b.dueDate))
    )) {
      const { error } = await supabase.from('bills').delete().eq('id', stale.id)
      if (error) throw error
      result = result.filter((b) => b.id !== stale.id)
    }
  }
  return result
}

/** Reconcile after purchases and card configuration changes, without waiting for a reload. */
export async function reconcileCardBills(): Promise<void> {
  const { creditCards, transactions, bills } = state()
  const next = await syncCardBills(creditCards, transactions, bills)
  patch({ bills: next })
}
