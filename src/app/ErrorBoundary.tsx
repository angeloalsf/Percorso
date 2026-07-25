import { Component, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n'
import { Sentry } from '@/lib/sentry'
import { usePrefs } from '@/state/prefs'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Top-level render-error catch-all. Class component because React has no
 * hook-based API for `getDerivedStateFromError`/`componentDidCatch`. Reads
 * the language directly from the prefs store (not `useT()`, unavailable in a
 * class component) — fine for a last-resort screen that doesn't need to be
 * reactive to a language switch mid-crash.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
    // No-op when VITE_SENTRY_DSN is unset — Sentry.init() was never called.
    Sentry.captureException(error)
  }

  render() {
    if (this.state.hasError) {
      const lang = usePrefs.getState().language
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
          <CircleAlert className="size-7 text-destructive" />
          <h1 className="text-lg font-semibold">{translate(lang, 'errors.crashTitle')}</h1>
          <p className="text-sm text-muted-foreground">{translate(lang, 'errors.crashBody')}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            {translate(lang, 'common.retry')}
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
