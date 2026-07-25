/**
 * Shared client-side validation for hand-typed amounts and dates. Amount
 * fields are `numeric(14,2)` in Postgres — up to 12 integer digits — so
 * `MAX_AMOUNT` is a sane UX ceiling well inside that range, not the DB's
 * actual limit; catches a fat-fingered extra zero, not legitimate figures.
 */
export const MAX_AMOUNT = 999_999_999.99

const AMOUNT_PATTERN = /^-?\d+(\.\d{1,2})?$/

/**
 * Parses a decimal amount string: optional leading "-", at most 2 decimal
 * places. Returns `null` if malformed (empty, non-numeric, >2 decimals).
 * Deliberately doesn't check sign or magnitude — those vary per field
 * (an amount is usually `> 0`, but e.g. an account's initial balance can be
 * negative) — callers compare the result against `MAX_AMOUNT` and their own
 * sign rule.
 */
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (!AMOUNT_PATTERN.test(trimmed)) return null
  return Number(trimmed)
}

/**
 * Sanity bounds for hand-typed `YYYY-MM-DD` dates — catches a fat-fingered
 * year, not a legitimate far past/future date. Past due-dates are allowed by
 * design (see CLAUDE.md), so this is deliberately a wide, not a tight, bound.
 */
export const MIN_SANE_DATE = '1900-01-01'
export const MAX_SANE_DATE = '2100-12-31'

export function isSaneDate(iso: string): boolean {
  return iso >= MIN_SANE_DATE && iso <= MAX_SANE_DATE
}
