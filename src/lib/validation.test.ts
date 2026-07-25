import { describe, expect, it } from 'vitest'
import { isSaneDate, MAX_AMOUNT, MAX_SANE_DATE, MIN_SANE_DATE, parseAmount } from './validation'

describe('parseAmount', () => {
  it('parses a plain integer', () => {
    expect(parseAmount('100')).toBe(100)
  })

  it('parses up to 2 decimal places', () => {
    expect(parseAmount('12.5')).toBe(12.5)
    expect(parseAmount('12.34')).toBe(12.34)
  })

  it('parses a negative amount (sign is the caller’s concern, not this function’s)', () => {
    expect(parseAmount('-50.25')).toBe(-50.25)
  })

  it('trims surrounding whitespace', () => {
    expect(parseAmount('  42.10  ')).toBe(42.1)
  })

  it('rejects more than 2 decimal places', () => {
    expect(parseAmount('12.345')).toBeNull()
  })

  it('rejects empty input', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('   ')).toBeNull()
  })

  it('rejects non-numeric input', () => {
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('12,50')).toBeNull()
  })

  it('rejects scientific notation and other exotic numeric forms', () => {
    expect(parseAmount('1e10')).toBeNull()
    expect(parseAmount('Infinity')).toBeNull()
  })

  it('does not itself enforce MAX_AMOUNT — callers compare the result', () => {
    expect(parseAmount('9999999999999.99')).toBe(9999999999999.99)
  })
})

describe('isSaneDate', () => {
  it('accepts dates within the sane range, including the boundaries', () => {
    expect(isSaneDate('2026-07-25')).toBe(true)
    expect(isSaneDate(MIN_SANE_DATE)).toBe(true)
    expect(isSaneDate(MAX_SANE_DATE)).toBe(true)
  })

  it('accepts a far past date within range (past-due dates are allowed by design)', () => {
    expect(isSaneDate('1995-01-01')).toBe(true)
  })

  it('rejects a date before the sane range', () => {
    expect(isSaneDate('1899-12-31')).toBe(false)
  })

  it('rejects a date after the sane range', () => {
    expect(isSaneDate('2101-01-01')).toBe(false)
  })
})

describe('MAX_AMOUNT', () => {
  it('is comfortably inside the numeric(14,2) column range (< 10^12)', () => {
    expect(MAX_AMOUNT).toBeLessThan(10 ** 12)
  })
})
