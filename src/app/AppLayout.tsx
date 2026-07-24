import { useEffect } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { CircleAlert, Settings, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { EnvBanner } from '@/app/EnvBanner'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { Splash } from '@/components/ui/splash'
import { useFinanceStore } from '@/features/finance/store'
import { useT, type TKey } from '@/i18n'
import { cn } from '@/lib/utils'
import { useProfile } from '@/state/profile'

const NAV: { to: string; icon: typeof Wallet; labelKey: TKey }[] = [
  { to: '/finances', icon: Wallet, labelKey: 'nav.finances' },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings' }
]

/** Protected shell: session gate → data gate → nav + page content. */
export function AppLayout() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return <Shell userId={session.user.id} />
}

function Shell({ userId }: { userId: string }) {
  const t = useT()
  const financeStatus = useFinanceStore((s) => s.status)
  const fullName = useProfile((s) => s.fullName)
  const firstName = fullName.trim().split(/\s+/)[0]

  useEffect(() => {
    void useFinanceStore.getState().load()
    useProfile
      .getState()
      .load(userId)
      .catch(() => {
        /* profile falls back to defaults; the finance store surfaces load errors */
      })
    return () => {
      useFinanceStore.getState().reset()
      useProfile.getState().reset()
    }
  }, [userId])

  const failed = financeStatus === 'error'
  const ready = financeStatus === 'ready'

  const retry = (): void => {
    useFinanceStore.getState().reset()
    void useFinanceStore.getState().load()
  }

  return (
    <div className="min-h-dvh">
      <EnvBanner />
      <main className="min-w-0">
        <div className="mx-auto w-full max-w-5xl px-4 pt-5 pb-24 md:px-8 md:pt-8">
          <header className="mb-5 flex items-center justify-between gap-3 md:mb-6">
            <span className="text-sm font-bold tracking-wide text-white">Percorso</span>
            {firstName ? <span className="text-sm font-light text-muted-foreground">{firstName}</span> : null}
          </header>
          {failed ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
              <CircleAlert className="size-7 text-destructive" />
              <p className="text-sm text-muted-foreground">{t('errors.loadFailed')}</p>
              <Button variant="secondary" onClick={retry}>
                {t('common.retry')}
              </Button>
            </div>
          ) : ready ? (
            <Outlet />
          ) : (
            <PageSkeleton />
          )}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
        <div className="mx-auto grid max-w-md grid-cols-2">
          {NAV.map(({ to, icon: Icon, labelKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2 pt-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )
              }
            >
              <Icon className="size-5" />
              {t(labelKey)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
