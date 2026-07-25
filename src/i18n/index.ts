import { useMemo } from 'react'
import { usePrefs } from '@/state/prefs'
import { type LangCode } from './config'
import { en } from './locales/en'
import { it } from './locales/it'
import { ptBR } from './locales/pt-br'

/**
 * The English dictionary is the source of truth: its shape is the `Dict`
 * type, every other language must satisfy it (missing or extra keys are
 * compile errors) and `t()` only accepts key paths that exist in it.
 * `npm run typecheck` is the i18n test suite.
 */
type Dict = typeof en

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`
}[keyof T & string]

export type TKey = Paths<Dict>

const dicts: Record<LangCode, Dict> = { en, 'pt-BR': ptBR, it }

function lookup(dict: object, key: string): string | undefined {
  let node: unknown = dict
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

export function translate(lang: LangCode, key: TKey, params?: Record<string, string | number>): string {
  let text = lookup(dicts[lang] ?? en, key) ?? lookup(en, key) ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

export type Translator = (key: TKey, params?: Record<string, string | number>) => string

/** Returns a translator bound to the active language; re-renders on switch. */
export function useT(): Translator {
  const lang = usePrefs((s) => s.language)
  return useMemo(() => (key, params) => translate(lang, key, params), [lang])
}

export function useLang(): LangCode {
  return usePrefs((s) => s.language)
}
