import { LOCALE_TAGS, type LangCode } from '@/i18n/config'
import { parseISODate } from './dates'

export function formatDate(iso: string, lang: LangCode, style: 'short' | 'medium' | 'weekday' = 'medium'): string {
  const date = parseISODate(iso)
  const locale = LOCALE_TAGS[lang]
  switch (style) {
    case 'short':
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date)
    case 'weekday':
      return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
    default:
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
  }
}

/** `month` is `YYYY-MM`. */
export function formatMonthShort(month: string, lang: LangCode): string {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { month: 'short' }).format(new Date(y, (m ?? 1) - 1, 1))
}

export function formatMonthLong(month: string, lang: LangCode): string {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { month: 'long', year: 'numeric' }).format(
    new Date(y, (m ?? 1) - 1, 1)
  )
}

export function formatCurrency(value: number, currency: string, lang: LangCode): string {
  try {
    return new Intl.NumberFormat(LOCALE_TAGS[lang], { style: 'currency', currency }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}
