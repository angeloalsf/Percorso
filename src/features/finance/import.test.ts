import { describe, expect, it } from 'vitest'
import { cashForecast, computeHealthScore, netWorthAsOf, type Account, type Bill, type Transaction } from './store'
import { parseStatement, statementDuplicate } from './store/import'

const account: Account = {
  id: 'a',
  name: 'Bank',
  type: 'checking',
  initialBalance: 1000,
  openingDate: '2026-06-01',
  color: '#123',
  archived: false
}
const salary: Transaction = {
  id: 's',
  date: '2026-08-05',
  type: 'income',
  amount: 5000,
  accountId: 'a',
  note: 'Salary',
  isRecurring: true
}
const oldSalary: Transaction = { ...salary, id: 's0', date: '2026-07-05' }
const bill: Bill = { id: 'b', name: 'Rent', amount: 1200, dueDate: '2026-09-30', status: 'pending', recurring: true }

describe('historical integrity', () => {
  it('does not backdate an account opening balance', () => {
    expect(netWorthAsOf([account], [], '2026-05')).toBe(0)
    expect(netWorthAsOf([account], [], '2026-06')).toBe(1000)
  })
  it('keeps an archived account in months before archival', () => {
    const archived = { ...account, archived: true, archivedAt: '2026-09-12' }
    expect(netWorthAsOf([archived], [], '2026-08')).toBe(1000)
    expect(netWorthAsOf([archived], [], '2026-09')).toBe(0)
  })
  it('requires historical income before scoring', () => {
    expect(computeHealthScore([account], [salary], [], '2026-08').band).toBe('insufficientData')
  })
})

describe('cash forecast', () => {
  it('counts a recurring salary only once each month and pending bills once', () => {
    const points = cashForecast(1000, [oldSalary, salary], [bill], '2026-09-26', 35)
    expect(points.at(-1)?.income).toBe(0)
    expect(points.reduce((sum, point) => sum + point.income, 0)).toBe(5000)
    expect(points.reduce((sum, point) => sum + point.expenses, 0)).toBe(2400)
    expect(points.at(-1)?.balance).toBe(3600)
  })
  it('places bills due today on the next forecast day', () => {
    const points = cashForecast(1000, [], [{ ...bill, dueDate: '2026-09-26', recurring: false }], '2026-09-26', 2)
    expect(points[0].expenses).toBe(1200)
    expect(points[1].expenses).toBe(0)
  })
  it('forecasts only the remaining loan installments', () => {
    const points = cashForecast(
      1000,
      [],
      [],
      '2026-09-26',
      50,
      [],
      [
        {
          id: 'loan-1',
          name: 'Car loan',
          totalAmount: 3000,
          installmentAmount: 500,
          installmentsTotal: 6,
          installmentsPaid: 4,
          paidAsOf: '2026-09-12',
          dueDay: 10
        }
      ]
    )
    expect(points.reduce((sum, point) => sum + point.expenses, 0)).toBe(1000)
    expect(points.at(-1)?.balance).toBe(0)
  })
})

describe('statement import', () => {
  it('reads quoted Brazilian CSV and spots an already recorded entry', () => {
    const entries = parseStatement('Data;Valor;Descrição\n26/09/2026;"-1.234,50";"Supermercado; bairro"')
    expect(entries).toEqual([
      { date: '2026-09-26', amount: 1234.5, type: 'expense', note: 'Supermercado; bairro', reference: undefined }
    ])
    expect(
      statementDuplicate(entries[0], 'a', [
        { ...salary, date: entries[0].date, type: 'expense', amount: entries[0].amount, note: entries[0].note }
      ])
    ).toBe(true)
  })
  it('reads OFX identifiers for repeat import protection', () => {
    const [entry] = parseStatement('<STMTTRN><DTPOSTED>20260925120000<TRNAMT>-45.90<FITID>bank-42<NAME>Taxi</STMTTRN>')
    expect(entry).toEqual({ date: '2026-09-25', type: 'expense', amount: 45.9, note: 'Taxi', reference: 'bank-42' })
    expect(statementDuplicate(entry, 'a', [{ ...salary, importReference: 'bank-42' }])).toBe(true)
    expect(
      statementDuplicate(entry, 'a', [
        {
          ...salary,
          date: entry.date,
          type: entry.type,
          amount: entry.amount,
          note: entry.note,
          importReference: 'bank-43'
        }
      ])
    ).toBe(false)
  })
  it('validates dates and Brazilian debit labels', () => {
    expect(
      parseStatement('Data;Valor;Descrição;Tipo\n31/02/2026;50;Inválida;Débito\n25/09/2026;50;Compras;Débito')
    ).toEqual([{ date: '2026-09-25', amount: 50, type: 'expense', note: 'Compras', reference: undefined }])
  })
  it('reads an unquoted decimal comma in semicolon CSV', () => {
    expect(parseStatement('Data;Valor;Descrição\n25/09/2026;-1.234,50;Mercado')[0]).toEqual({
      date: '2026-09-25',
      amount: 1234.5,
      type: 'expense',
      note: 'Mercado',
      reference: undefined
    })
  })
})
