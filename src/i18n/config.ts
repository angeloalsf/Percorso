/**
 * Language configuration. Kept dependency-free so both the i18n engine and
 * the prefs store can import it without cycles.
 */
export const LANGUAGES = ['en', 'pt-BR', 'it'] as const

export type LangCode = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: LangCode = 'en'

/** Native display name of each language (never translated). */
export const LANGUAGE_NAMES: Record<LangCode, string> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
  it: 'Italiano'
}

/** BCP 47 tag used for Intl date/number formatting. */
export const LOCALE_TAGS: Record<LangCode, string> = {
  en: 'en-US',
  'pt-BR': 'pt-BR',
  it: 'it-IT'
}

export function isLangCode(value: unknown): value is LangCode {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}
