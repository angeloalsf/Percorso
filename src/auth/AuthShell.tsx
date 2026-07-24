import { Waypoints } from 'lucide-react'
import { EnvBanner } from '@/app/EnvBanner'
import { supabaseConfigured } from '@/lib/supabase'

interface AuthShellProps {
  title: string
  subtitle: string
  children: React.ReactNode
}

/** Shared centered layout for the public auth screens. */
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <>
      <EnvBanner />
      <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Waypoints className="size-5" />
            </span>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {!supabaseConfigured && (
            <p className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code>, fill in VITE_SUPABASE_URL
              and VITE_SUPABASE_ANON_KEY, then restart the dev server.
            </p>
          )}
          {children}
        </div>
      </main>
    </>
  )
}

/** The multicolor Google "G", inline so no external asset is needed. */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.09A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.28 14.29a7.21 7.21 0 0 1 0-4.58V6.62H1.27a12 12 0 0 0 0 10.76l4.01-3.09Z" />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.98 11.98 0 0 0 1.27 6.62l4.01 3.09C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  )
}
