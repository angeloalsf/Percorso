import { Toaster as SonnerToaster } from 'sonner'
import { usePrefs } from '@/state/prefs'

/** App-wide toast host; every mutation reports through `sonner`'s toast(). */
export function Toaster() {
  const theme = usePrefs((s) => s.theme)
  return (
    <SonnerToaster
      theme={theme}
      position="top-center"
      duration={2200}
      toastOptions={{
        style: {
          background: 'var(--card)',
          color: 'var(--card-foreground)',
          border: '1px solid var(--border)'
        }
      }}
    />
  )
}
