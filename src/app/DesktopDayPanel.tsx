import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, Target, X } from 'lucide-react'
import { toast } from 'sonner'
import { billAlerts, goalProgress, useFinanceStore } from '@/features/finance/store'
import { completionKey, scheduledHabits } from '@/features/routine/dates'
import { RoutineMiniCalendar } from '@/features/routine/RoutineMiniCalendar'
import { routineDate } from '@/features/routine/routineDate'
import { useRoutineStore } from '@/features/routine/store'
import { useLang, useT } from '@/i18n'
import { currentMonthKey, todayISO } from '@/lib/dates'
import { formatCurrency, formatDate } from '@/lib/format'
import { useProfile } from '@/state/profile'

/** Read-only desktop context pane. All figures come from the existing stores. */
export function DesktopDayPanel({
  userId,
  openGoals,
  onClose
}: {
  userId: string
  openGoals: () => void
  onClose: () => void
}) {
  const t = useT()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const lang = useLang()
  const currency = useProfile((s) => s.currency)
  const month = currentMonthKey()
  const today = todayISO()
  const selected = pathname === '/routine' ? routineDate(new URLSearchParams(search).get('date')) : today
  const { habits, changes, completions, loadedMonths, status: routineStatus, savingKey } = useRoutineStore()
  const goals = useFinanceStore((s) => s.goals)
  const accounts = useFinanceStore((s) => s.accounts)
  const transactions = useFinanceStore((s) => s.transactions)
  const bills = useFinanceStore((s) => s.bills)
  const financeReady = useFinanceStore((s) => s.status === 'ready')

  useEffect(() => {
    // Only load the context pane when it is visible, including after a window resize.
    const viewport = window.matchMedia('(min-width: 1280px)')
    const loadVisiblePane = () => {
      if (viewport.matches) {
        void useRoutineStore.getState().loadMonth(month, userId)
      }
    }
    loadVisiblePane()
    viewport.addEventListener('change', loadVisiblePane)
    return () => viewport.removeEventListener('change', loadVisiblePane)
  }, [month, userId])

  const todayHabits = useMemo(() => scheduledHabits(today, habits, changes), [today, habits, changes])
  const goal = goals[0]
  const progress = goal ? goalProgress(goal, accounts, transactions) : 0
  const goalPct = goal && goal.targetAmount > 0 ? Math.min(100, Math.max(0, (progress / goal.targetAmount) * 100)) : 0
  const alerts = useMemo(() => billAlerts(bills, today).slice(0, 2), [bills, today])
  const toggle = async (habitId: string): Promise<void> => {
    const ok = await useRoutineStore.getState().toggleCompletion(habitId, today, userId)
    if (!ok) toast.error(t('toasts.saveError'))
  }

  return (
    <aside
      className="hidden min-h-0 flex-col overflow-hidden rounded-lg border bg-card xl:flex"
      aria-label={t('workspace.dayView')}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b bg-card pr-2 pl-5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <span>{t('workspace.dayView')}</span>
        <button
          type="button"
          onClick={onClose}
          title={t('workspace.closeDayView')}
          aria-label={t('workspace.closeDayView')}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mx-1 mb-1 min-h-0 flex-1 space-y-6 overflow-y-auto rounded-b-md p-5">
        <div>
          <h2 className="text-base font-semibold capitalize">{formatDate(today, lang, 'weekday')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('workspace.daySubtitle')}</p>
        </div>

        <section aria-label={t('routine.yourHabits')}>
          <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase">{t('routine.today')}</h3>
          {routineStatus !== 'ready' || !loadedMonths[month] ? (
            <p className="text-xs text-muted-foreground">
              {t(routineStatus === 'error' ? 'errors.loadFailed' : 'common.loading')}
            </p>
          ) : todayHabits.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('routine.todayEmpty')}</p>
          ) : (
            <div className="space-y-2">
              {todayHabits.map((habit) => {
                const checked = Boolean(completions[completionKey(habit.id, today)])
                return (
                  <button
                    key={habit.id}
                    type="button"
                    aria-pressed={checked}
                    disabled={Boolean(savingKey)}
                    onClick={() => void toggle(habit.id)}
                    className="flex min-h-10 w-full items-center gap-2 rounded-md border px-3 text-left text-xs transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : ''}`}
                    >
                      {checked && <Check className="size-3" />}
                    </span>
                    <span className={checked ? 'text-muted-foreground line-through' : ''}>{habit.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {financeReady && (
          <section className="border-t pt-5">
            <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase">{t('finance.goalsTitle')}</h3>
            {goal ? (
              <button
                type="button"
                onClick={openGoals}
                className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Target className="size-4 text-primary" />
                  {goal.name}
                </span>
                <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${goalPct}%` }} />
                </span>
                <span className="mt-2 block text-xs text-muted-foreground">
                  {formatCurrency(progress, currency, lang)} / {formatCurrency(goal.targetAmount, currency, lang)}
                </span>
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">{t('finance.noGoalsTitle')}</p>
            )}
          </section>
        )}

        {financeReady && alerts.length > 0 && (
          <section className="border-t pt-5">
            <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase">{t('finance.billsTitle')}</h3>
            <ul className="space-y-3">
              {alerts.map(({ bill, state }) => (
                <li key={bill.id} className="flex items-start gap-2 text-xs">
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${state === 'overdue' ? 'bg-destructive' : 'bg-warning'}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{bill.name}</span>
                  <span className="shrink-0 tabular text-muted-foreground">
                    {formatDate(bill.dueDate, lang, 'short')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="border-t pt-5">
          <RoutineMiniCalendar
            userId={userId}
            selected={selected}
            onSelect={(date) => navigate(`/routine?date=${date}`)}
          />
        </div>
      </div>
    </aside>
  )
}
