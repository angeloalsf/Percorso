import { describe, expect, it } from 'vitest'
import { en } from './locales/en'
import { it as itLocale } from './locales/it'
import { ptBR } from './locales/pt-br'

/**
 * `${locale}:${key path}` pairs allowed to stay identical to English —
 * naturalized loanwords with no distinct local word (verified: every other
 * key in the same namespace *is* translated, so these are deliberate, not
 * missed). Anything else flagged here is a real untranslated string.
 */
const ALLOW_IDENTICAL: ReadonlySet<string> = new Set([
  'it:auth.email', // "Email" is the standard Italian tech-UI term
  'it:auth.password', // "Password" likewise
  'it:settings.account', // the login/profile sense; finance.account is correctly "Conto"
  'it:finance.seedShopping', // "Shopping" is a fully naturalized Italian loanword
  'pt-BR:finance.seedFreelance', // "Freelance" is the standard Brazilian-Portuguese term
  // en's own tab label keeps the Portuguese product name (see noConsortiumsTitle/Hint,
  // which do the same) — there's no faithful English word for this Brazilian product.
  'pt-BR:finance.accountTabConsortiums'
])

function leaves(dict: object, prefix = ''): [string, string][] {
  return Object.entries(dict).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [[path, value]] : leaves(value as object, path)
  })
}

const EN_LEAVES = leaves(en)

describe.each([
  ['pt-BR', ptBR],
  ['it', itLocale]
])('%s translation completeness', (lang, dict) => {
  const localeLeaves = new Map(leaves(dict))

  it('has no untranslated values (identical to English) outside the allowlist', () => {
    const untranslated = EN_LEAVES.filter(
      ([path, enValue]) => !ALLOW_IDENTICAL.has(`${lang}:${path}`) && localeLeaves.get(path) === enValue
    ).map(([path]) => path)

    expect(
      untranslated,
      `${lang} values identical to en — translate or add "${lang}:<path>" to ALLOW_IDENTICAL`
    ).toEqual([])
  })
})
