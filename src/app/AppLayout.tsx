import { useEffect } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { CircleAlert, Settings, Wallet, Waypoints } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
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
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Waypoints className="size-4" />
          </span>
          Percorso
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, icon: Icon, labelKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )
              }
            >
              <Icon className="size-4" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 pt-5 pb-24 md:px-8 md:pt-8 md:pb-12">
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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
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
