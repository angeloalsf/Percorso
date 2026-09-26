import { useEffect, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { CalendarDays, ChevronRight, Target, X } from 'lucide-react'
import { monthDays, monthSummary } from '@/features/calendar/dates'
import { useCalendarStore } from '@/features/calendar/store'
import { billAlerts, goalProgress, useFinanceStore } from '@/features/finance/store'
import { useLang, useT } from '@/i18n'
import { LOCALE_TAGS } from '@/i18n/config'
import { currentMonthKey, parseISODate, todayISO } from '@/lib/dates'
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
  const lang = useLang()
  const currency = useProfile((s) => s.currency)
  const month = currentMonthKey()
  const today = todayISO()
  const entries = useCalendarStore((s) => s.entries)
  const loaded = useCalendarStore((s) => s.loadedMonths[month])
  const error = useCalendarStore((s) => s.errorMonths[month])
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
        void useCalendarStore.getState().loadMonth(month, userId)
      }
    }
    loadVisiblePane()
    viewport.addEventListener('change', loadVisiblePane)
    return () => viewport.removeEventListener('change', loadVisiblePane)
  }, [month, userId])

  const days = useMemo(() => monthDays(month), [month])
  const summary = monthSummary(month, entries)
  const goal = goals[0]
  const progress = goal ? goalProgress(goal, accounts, transactions) : 0
  const goalPct = goal && goal.targetAmount > 0 ? Math.min(100, Math.max(0, (progress / goal.targetAmount) * 100)) : 0
  const alerts = useMemo(() => billAlerts(bills, today).slice(0, 2), [bills, today])
  const locale = LOCALE_TAGS[lang]
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    parseISODate(`${month}-01`)
  )

  return (
    <aside
      className="hidden min-h-0 overflow-y-auto rounded-lg border bg-card xl:block"
      aria-label={t('workspace.dayView')}
    >
      <div className="sticky top-0 z-10 flex h-11 items-center justify-between border-b bg-card pr-2 pl-5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
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
      <div className="space-y-6 p-5">
        <div>
          <h2 className="text-base font-semibold capitalize">{formatDate(today, lang, 'weekday')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('workspace.daySubtitle')}</p>
        </div>

        <NavLink
          to="/calendar"
          className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="rounded-full bg-accent p-2 text-primary">
            <CalendarDays className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t('calendar.title')}</span>
            <span className="block text-xs text-muted-foreground">
              {loaded ? t('calendar.monthSummary', summary) : error ? t('errors.loadFailed') : t('common.loading')}
            </span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </NavLink>

        <section aria-label={t('calendar.title')}>
          <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase capitalize">{monthLabel}</h3>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index} className="py-1 text-[10px] font-semibold text-muted-foreground">
                {new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + index))}
              </span>
            ))}
            {days.map((day, index) =>
              day ? (
                <span
                  key={day}
                  title={
                    entries[day] ? t(entries[day].status === 'done' ? 'calendar.done' : 'calendar.missed') : undefined
                  }
                  className={`flex aspect-square items-center justify-center rounded-full text-[11px] tabular ${entries[day]?.status === 'done' ? 'bg-blue-600 text-white' : entries[day]?.status === 'missed' ? 'bg-rose-600 text-white' : day === today ? 'border border-primary text-primary' : 'text-muted-foreground'}`}
                >
                  {Number(day.slice(-2))}
                </span>
              ) : (
                <span key={`blank-${index}`} />
              )
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 border-t pt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-blue-600" />
              {t('calendar.done')}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-rose-600" />
              {t('calendar.missed')}
            </span>
          </div>
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
      </div>
    </aside>
  )
}
