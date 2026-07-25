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
 * Reconciles each active card's recently-closed cycles with the `bills` table.
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
 * A short look-back keeps a never-opened account from back-filling ancient
 * history all at once.
 */
export async function syncCardBills(cards: CreditCard[], transactions: Transaction[], bills: Bill[]): Promise<Bill[]> {
  const today = todayISO()
  let result = bills

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
      const due = dueForClosing(closing, card.dueDay)
      const existing = result.find((b) => b.cardId === card.id && b.dueDate === due)

      if (existing?.status === 'paid') continue

      if (!existing) {
        if (total <= 0) continue
        const input: BillInput = {
          name: card.name,
          amount: total,
          dueDate: due,
          status: 'pending',
          recurring: false,
          cardId: card.id
        }
        const id = newId()
        const { error } = await supabase.from('bills').insert(billRow(id, input))
        if (!error) result = [...result, { ...input, id }]
      } else if (total <= 0) {
        const { error } = await supabase.from('bills').delete().eq('id', existing.id)
        if (!error) result = result.filter((b) => b.id !== existing.id)
      } else if (existing.amount !== total) {
        const { error } = await supabase.from('bills').update({ amount: total }).eq('id', existing.id)
        if (!error) result = result.map((b) => (b.id === existing.id ? { ...b, amount: total } : b))
      }
    }
  }
  return result
}
