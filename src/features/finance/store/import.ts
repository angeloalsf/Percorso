import { supabase } from '@/lib/supabase'
import { rowToTransaction } from './rows'
import { patch, state } from './store'
import type { SaveResult, Transaction, TransactionType } from './types'

export interface StatementEntry {
  date: string
  type: Extract<TransactionType, 'income' | 'expense'>
  amount: number
  note: string
  reference?: string
}

function dateISO(raw: string): string | null {
  const value = raw.trim().slice(0, 10)
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : value
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day ? iso : null
}

function amountNumber(raw: string): number {
  const v = raw.replace(/[^\d,.-]/g, '')
  return Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v)
}

function csvLines(text: string): string[][] {
  const rows: string[][] = []
  const header = text.split(/\r?\n/, 1)[0]
  const delimiter = (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ';' : ','
  let row: string[] = [],
    cell = '',
    quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"' && text[i + 1] === '"' && quoted) {
      cell += '"'
      i++
      continue
    }
    if (c === '"') {
      quoted = !quoted
      continue
    }
    if (!quoted && c === delimiter) {
      row.push(cell.trim())
      cell = ''
      continue
    }
    if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += c
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

/** CSV (Data/Valor/Descrição) or OFX statement entries. Invalid rows are skipped. */
export function parseStatement(text: string): StatementEntry[] {
  const entries: StatementEntry[] = []
  if (/<STMTTRN>/i.test(text)) {
    for (const block of text.split(/<STMTTRN>/i).slice(1)) {
      const field = (name: string) => new RegExp(`<${name}>([^<\\r\\n]+)`, 'i').exec(block)?.[1]?.trim() ?? ''
      const date = dateISO(
        field('DTPOSTED').slice(0, 4) + '-' + field('DTPOSTED').slice(4, 6) + '-' + field('DTPOSTED').slice(6, 8)
      )
      const signed = amountNumber(field('TRNAMT'))
      if (date && Number.isFinite(signed) && signed !== 0)
        entries.push({
          date,
          type: signed > 0 ? 'income' : 'expense',
          amount: Math.abs(signed),
          note: field('MEMO') || field('NAME'),
          reference: field('FITID') || undefined
        })
    }
  } else {
    const [headers, ...rows] = csvLines(text.replace(/^\uFEFF/, ''))
    if (!headers) return []
    const normalized = headers.map((h) =>
      h
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
    )
    const col = (...names: string[]) => normalized.findIndex((h) => names.includes(h))
    const dateCol = col('data', 'date'),
      amountCol = col('valor', 'amount', 'value'),
      noteCol = col('descricao', 'description', 'historico', 'memo', 'note'),
      typeCol = col('tipo', 'type'),
      refCol = col('id', 'fitid', 'referencia', 'reference')
    if (dateCol < 0 || amountCol < 0) return []
    for (const row of rows) {
      const date = dateISO(row[dateCol] ?? '')
      const signed = amountNumber(row[amountCol] ?? '')
      if (!date || !Number.isFinite(signed) || signed === 0) continue
      const typeRaw = (row[typeCol] ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      const type = ['desp', 'debit', 'saida'].some((word) => typeRaw.includes(word))
        ? 'expense'
        : ['rece', 'credit', 'entrada'].some((word) => typeRaw.includes(word))
          ? 'income'
          : signed > 0
            ? 'income'
            : 'expense'
      entries.push({
        date,
        type,
        amount: Math.abs(signed),
        note: (row[noteCol] ?? '').slice(0, 500),
        reference: (row[refCol] ?? '') || undefined
      })
    }
  }
  return entries
}

export function statementDuplicate(entry: StatementEntry, accountId: string, existing: Transaction[]): boolean {
  return existing.some(
    (tx) =>
      tx.accountId === accountId &&
      (entry.reference
        ? tx.importReference === entry.reference
        : tx.date === entry.date &&
          tx.type === entry.type &&
          tx.amount === entry.amount &&
          tx.note.trim().toLowerCase() === entry.note.trim().toLowerCase())
  )
}

export async function importTransactions(
  accountId: string,
  entries: StatementEntry[],
  categoryId?: string
): Promise<SaveResult> {
  if (!entries.length || !state().accounts.some((a) => a.id === accountId && !a.archived)) return 'error'
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return 'error'
  const rows = entries.map((entry) => ({
    user_id: user.id,
    date: entry.date,
    type: entry.type,
    amount: entry.amount,
    account_id: accountId,
    category_id: entry.type === 'expense' ? (categoryId ?? null) : null,
    note: entry.note,
    import_reference: entry.reference ?? null
  }))
  const { data, error } = await supabase.from('transactions').insert(rows).select('*')
  if (error || !data) return 'error'
  patch({
    transactions: [...state().transactions, ...data.map(rowToTransaction)].sort((a, b) => a.date.localeCompare(b.date))
  })
  return 'ok'
}
