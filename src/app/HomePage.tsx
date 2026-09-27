import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, ChartPie, Check, ChevronRight, HeartPulse } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { Card } from '@/components/ui/card'
import { useCalendarStore } from '@/features/calendar/store'
import { completionKey, routineMonthSummary, scheduledHabits } from '@/features/routine/dates'
import { useRoutineStore } from '@/features/routine/store'
import {
  accountBalance,
  computeHealthScore,
  monthTotals,
  spendingByCategory,
  useFinanceStore
} from '@/features/finance/store'
import { useLang, useT } from '@/i18n'
import { currentMonthKey, todayISO } from '@/lib/dates'
import { formatCurrency, formatMonthLong } from '@/lib/format'
import { useProfile } from '@/state/profile'

/** Read-only summary of the existing finance and calendar data. */
export function HomePage() {
  const t = useT()
  const lang = useLang()
  const { session } = useAuth()
  const userId = session?.user.id
  const firstName = useProfile((s) => s.fullName.trim().split(/\s+/)[0])
  const currency = useProfile((s) => s.currency)
  const { accounts, transactions, categories, budgets } = useFinanceStore()
  const entries = useCalendarStore((s) => s.entries)
  const {
    habits,
    changes,
    completions,
    status: routineStatus,
    loadedMonths: routineMonths,
    savingKey
  } = useRoutineStore()
  const month = currentMonthKey()
  const today = todayISO()
  const calendarLoaded = useCalendarStore((s) => Boolean(s.loadedMonths[month]))
  const calendarError = useCalendarStore((s) => Boolean(s.errorMonths[month]))
  const money = (value: number) => formatCurrency(value, currency, lang)

  useEffect(() => {
    if (userId) {
      void useCalendarStore.getState().loadMonth(month, userId)
      void useRoutineStore.getState().loadMonth(month, userId)
    }
  }, [month, userId])

  const totals = useMemo(() => monthTotals(transactions, month), [transactions, month])
  const netWorth = useMemo(
    () =>
      accounts
        .filter((account) => !account.archived)
        .reduce((sum, account) => sum + accountBalance(account, transactions), 0),
    [accounts, transactions]
  )
  const health = useMemo(
    () => computeHealthScore(accounts, transactions, budgets, month),
    [accounts, transactions, budgets, month]
  )
  const categorySpending = useMemo(() => {
    const spending = [...spendingByCategory(transactions, month)].sort((a, b) => b[1] - a[1])
    const top = spending[0]
    return {
      total: spending.reduce((sum, [, amount]) => sum + amount, 0),
      top: top
        ? {
            name: categories.find((category) => category.id === top[0])?.name ?? t('finance.uncategorized'),
            amount: top[1]
          }
        : null
    }
  }, [transactions, categories, month, t])
  const summary = useMemo(
    () => routineMonthSummary(month, habits, changes, completions, entries, today),
    [month, habits, changes, completions, entries, today]
  )
  const todayHabits = useMemo(() => scheduledHabits(today, habits, changes), [today, habits, changes])
  const toggleHabit = async (habitId: string): Promise<void> => {
    if (!userId) return
    const ok = await useRoutineStore.getState().toggleCompletion(habitId, today, userId)
    if (!ok) toast.error(t('toasts.saveError'))
  }
  const hasFinanceData = accounts.length > 0 || transactions.length > 0 || budgets.length > 0
  const bandKey = {
    insufficientData: 'finance.healthInsufficient',
    healthy: 'finance.healthHealthy',
    good: 'finance.healthGood',
    attention: 'finance.healthAttention',
    critical: 'finance.healthCritical'
  } as const

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {firstName ? t('home.greetingName', { name: firstName }) : t('home.greeting')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('home.intro')}</p>
      </header>

      <section id="home-month" aria-labelledby="home-month-title" className="scroll-mt-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="home-month-title" className="text-base font-semibold">
            {t('home.monthSummary')}
          </h2>
          <span className="text-xs text-muted-foreground capitalize">{formatMonthLong(month, lang)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {(
            [
              ['finance.netWorth', netWorth, 'finance.acrossAccounts'],
              ['finance.incomeMonth', totals.income, 'common.thisMonth'],
              ['finance.expensesMonth', totals.expense, 'common.thisMonth'],
              ['finance.netMonth', totals.income - totals.expense, 'home.incomeLessExpenses']
            ] as const
          ).map(([label, amount, hint]) => (
            <Card key={label} className="min-w-0 p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">{t(label)}</p>
              <p className="mt-3 truncate text-lg font-semibold tabular-nums sm:text-xl" title={money(amount)}>
                {money(amount)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{t(hint)}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="home-focus" aria-labelledby="home-focus-title" className="scroll-mt-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="home-focus-title" className="text-base font-semibold">
            {t('home.inFocus')}
          </h2>
          <span className="text-xs text-muted-foreground">{t('home.monthSignals')}</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Card className="min-h-44 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <HeartPulse className="size-4 text-primary" />
              {t('finance.healthTitle')}
            </h3>
            {hasFinanceData && health.band !== 'insufficientData' ? (
              <>
                <div className="mt-5 flex items-baseline gap-2">
                  <strong className="text-3xl tabular-nums">{health.score}</strong>
                  <span className="text-xs text-muted-foreground">/100 · {t(bandKey[health.band])}</span>
                </div>
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={health.score}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t('finance.healthTitle')}
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${health.score}%` }} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{t('home.healthHint')}</p>
              </>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">{t('home.emptyFinance')}</p>
            )}
          </Card>
          <Card className="min-h-44 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ChartPie className="size-4 text-primary" />
              {t('finance.spendingByCategory')}
            </h3>
            <p className="mt-5 text-2xl font-semibold tabular-nums">{money(categorySpending.total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('home.categorizedSpending')}</p>
            {categorySpending.top ? (
              <div className="mt-4 flex justify-between gap-3 border-t pt-3 text-xs">
                <span className="text-muted-foreground">{categorySpending.top.name}</span>
                <strong className="tabular-nums">{money(categorySpending.top.amount)}</strong>
              </div>
            ) : (
              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">{t('finance.noExpensesMonth')}</p>
            )}
          </Card>
        </div>
      </section>

      <section id="home-calendar" aria-labelledby="home-calendar-title" className="scroll-mt-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="home-calendar-title" className="text-base font-semibold">
            {t('home.calendarGoals')}
          </h2>
          <span className="text-xs text-muted-foreground capitalize">{formatMonthLong(month, lang)}</span>
        </div>
        <Card className="p-4">
          <Link
            to="/calendar"
            className="flex items-center gap-3 rounded-lg transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <CalendarCheck className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm">
                {calendarLoaded && routineMonths[month] && routineStatus === 'ready'
                  ? t('calendar.monthSummary', summary)
                  : calendarError || routineStatus === 'error'
                    ? t('errors.loadFailed')
                    : t('common.loading')}
              </strong>
              <small className="text-xs text-muted-foreground">{t('home.calendarHint')}</small>
            </span>
            <span className="hidden text-xs font-medium text-primary sm:inline">{t('home.viewCalendar')}</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
          {routineStatus === 'ready' && routineMonths[month] && (
            <div className="mt-4 border-t pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t('routine.today')}</p>
              {todayHabits.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {todayHabits.map((habit) => {
                    const checked = Boolean(completions[completionKey(habit.id, today)])
                    return (
                      <button
                        key={habit.id}
                        type="button"
                        aria-pressed={checked}
                        disabled={Boolean(savingKey)}
                        onClick={() => void toggleHabit(habit.id)}
                        className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60"
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
              ) : (
                <p className="text-xs text-muted-foreground">{t('routine.todayEmpty')}</p>
              )}
            </div>
          )}
        </Card>
      </section>
    </div>
  )
}
