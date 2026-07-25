import { create } from 'zustand'
import { DEFAULT_LANGUAGE, isLangCode, LOCALE_TAGS, type LangCode } from '@/i18n/config'

/**
 * Device-local preferences (language + theme). These deliberately stay in
 * localStorage rather than Supabase: they must apply before auth resolves
 * (login screen included) and are a per-device choice.
 */
export type Theme = 'dark' | 'light'

const LANG_KEY = 'percorso.language'
const THEME_KEY = 'percorso.theme'

/** Keep the mobile browser chrome color in sync with the page background. */
const THEME_COLORS: Record<Theme, string> = { dark: '#16181d', light: '#fbfbf9' }

function initialLanguage(): LangCode {
  const saved = localStorage.getItem(LANG_KEY)
  if (isLangCode(saved)) return saved
  const nav = navigator.language.toLowerCase()
  if (nav.startsWith('pt')) return 'pt-BR'
  if (nav.startsWith('it')) return 'it'
  return DEFAULT_LANGUAGE
}

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}

/** Keep <html lang> in sync so assistive tech and browser features (spellcheck, translate) use the right language. */
function applyLang(language: LangCode): void {
  document.documentElement.lang = LOCALE_TAGS[language]
}

interface PrefsState {
  language: LangCode
  theme: Theme
  setLanguage: (language: LangCode) => void
  setTheme: (theme: Theme) => void
}

export const usePrefs = create<PrefsState>((set) => ({
  language: initialLanguage(),
  theme: initialTheme(),
  setLanguage: (language) => {
    localStorage.setItem(LANG_KEY, language)
    applyLang(language)
    set({ language })
  },
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
    set({ theme })
  }
}))

/** Called once from main.tsx before the first render. */
export function initTheme(): void {
  applyTheme(usePrefs.getState().theme)
}

/** Called once from main.tsx before the first render — sets the initial <html lang>. */
export function initLang(): void {
  applyLang(usePrefs.getState().language)
}
