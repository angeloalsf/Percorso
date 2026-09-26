import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CircleAlert } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { WorkspaceLayout } from '@/app/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { Splash } from '@/components/ui/splash'
import { useCalendarStore } from '@/features/calendar/store'
import { useFinanceStore } from '@/features/finance/store'
import { useT } from '@/i18n'
import { useProfile } from '@/state/profile'

/** Protected shell: session gate → data gate → nav + page content. */
export function AppLayout() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return <Shell userId={session.user.id} />
}

function Shell({ userId }: { userId: string }) {
  const t = useT()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [financeTab, setFinanceTab] = useState('dashboard')
  const inFinances = pathname.startsWith('/finances')
  const financeStatus = useFinanceStore((s) => s.status)
  const fullName = useProfile((s) => s.fullName)
  const firstName = fullName.trim().split(/\s+/)[0]

  useEffect(() => {
    useProfile
      .getState()
      .load(userId)
      .catch(() => {
        /* profile falls back to defaults; the finance store surfaces load errors */
      })
    return () => {
      useFinanceStore.getState().reset()
      useCalendarStore.getState().reset()
      useProfile.getState().reset()
    }
  }, [userId])

  useEffect(() => {
    if (inFinances) void useFinanceStore.getState().load()
  }, [inFinances, userId])

  const failed = inFinances && financeStatus === 'error'
  const ready = !inFinances || financeStatus === 'ready'

  const retry = (): void => {
    useFinanceStore.getState().reset()
    void useFinanceStore.getState().load()
  }

  const openFinance = (section: string): void => {
    setFinanceTab(section)
    navigate('/finances')
  }

  return (
    <WorkspaceLayout userId={userId} firstName={firstName} financeTab={financeTab} openFinance={openFinance}>
      {failed ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
          <CircleAlert className="size-7 text-destructive" />
          <p className="text-sm text-muted-foreground">{t('errors.loadFailed')}</p>
          <Button variant="secondary" onClick={retry}>
            {t('common.retry')}
          </Button>
        </div>
      ) : ready ? (
        <Outlet context={{ financeTab, setFinanceTab }} />
      ) : (
        <PageSkeleton />
      )}
    </WorkspaceLayout>
  )
}
