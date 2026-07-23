import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Check,
  HeartPulse,
  PiggyBank,
  Receipt,
  Repeat,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { ChartLegend } from '@/components/charts/ChartLegend'
import { DonutChart } from '@/components/charts/DonutChart'
import { LineChart } from '@/components/charts/LineChart'
import { Button } from '@/components/ui/button'
import { Card, CardTitle, CardTitleSub } from '@/components/ui/card'
import { ColorDot } from '@/components/ui/list'
import { EmptyState } from '@/components/ui/empty-state'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Select } from '@/components/ui/select'
import { useLang, useT, type Translator } from '@/i18n'
import { currentMonthKey, lastNMonthKeys, monthPacing, shiftMonthKey } from '@/lib/dates'
import { formatCurrency, formatDate, formatMonthShort } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CURRENCIES, useProfile } from '@/state/profile'
import {
  accountBalance,
  billAlerts,
  computeHealthScore,
  computeInsights,
  detectRecurring,
  goalProgress,
  markBillPaid,
  monthTotals,
  netWorthAsOf,
  netWorthSeries,
  pctChange,
  spendingByCategory,
  useFinanceStore,
  type Bill,
  type HealthBand,
  type Insight
} from '../store'
import { BillBadge, PayBillDialog } from './Bills'

/** Band → CSS color. Amber has no token, so it is inlined. */
const BAND_COLOR: Record<HealthBand, string> = {
  healthy: 'var(--success)',
  good: 'var(--primary)',
  attention: '#f59e0b',
  critical: 'var(--destructive)'
}
const BAND_KEY = {
  healthy: 'finance.healthHealthy',
  good: 'finance.healthGood',
  attention: 'finance.healthAttention',
  critical: 'finance.healthCritical'
} as const

export function Dashboard() {
  const t = useT()
  const lang = useLang()
  const { accounts, categories, transactions, budgets, goals, bills, setPendingTxFilter } = useFinanceStore()
  const currency = useProfile((s) => s.currency)
  const money = (v: number): string => formatCurrency(v, currency, lang)
  const [payingBill, setPayingBill] = useState<Bill | null>(null)

  const month = currentMonthKey()
  const prevMonth = shiftMonthKey(month, -1)

  const totals = useMemo(() => monthTotals(transactions, month), [transactions, month])
  const prevTotals = useMemo(() => monthTotals(transactions, prevMonth), [transactions, prevMonth])

  const netWorth = useMemo(
    () => accounts.filter((a) => !a.archived).reduce((sum, a) => sum + accountBalance(a, transactions), 0),
    [accounts, transactions]
  )
  const prevNetWorth = useMemo(
    () => netWorthAsOf(accounts, transactions, prevMonth),
    [accounts, transactions, prevMonth]
  )

  const net = totals.income - totals.expense
  const prevNet = prevTotals.income - prevTotals.expense

  // Month-end projection: current balance + avg daily net so far × remaining days.
  const projection = useMemo(() => {
    const { day, remaining } = monthPacing()
    const avgDaily = day > 0 ? net / day : 0
    return netWorth + avgDaily * remaining
  }, [netWorth, net])

  const insights = useMemo(
    () => computeInsights(transactions, categories, budgets, month),
    [transactions, categories, budgets, month]
  )
  const health = useMemo(
    () => computeHealthScore(accounts, transactions, budgets, month),
    [accounts, transactions, budgets, month]
  )
  const recurring = useMemo(() => detectRecurring(transactions, categories).slice(0, 5), [transactions, categories])
  const alerts = useMemo(() => billAlerts(bills), [bills])

  const donut = useMemo(() => {
    const byCategory = spendingByCategory(transactions, month)
    const segments = [...byCategory.entries()]
      .map(([categoryId, value]) => {
        const category = categories.find((c) => c.id === categoryId)
        return {
          id: categoryId as string | null,
          label: category?.name ?? t('finance.uncategorized'),
          color: category?.color ?? 'var(--border)',
          value
        }
      })
      .sort((a, b) => b.value - a.value)
    if (segments.length > 6) {
      const rest = segments.splice(5)
      segments.push({
        id: null,
        label: t('finance.otherCategories'),
        color: 'var(--muted-foreground)',
        value: rest.reduce((s, x) => s + x.value, 0)
      })
    }
    return segments
  }, [transactions, categories, month, t])

  const netWorthTrend = useMemo(() => {
    const months = lastNMonthKeys(6)
    return { labels: months.map((m) => formatMonthShort(m, lang)), values: netWorthSeries(accounts, transactions, months) }
  }, [accounts, transactions, lang])

  const cashflow = useMemo(() => {
    const months = lastNMonthKeys(6)
    return {
      labels: months.map((m) => formatMonthShort(m, lang)),
      income: months.map((m) => monthTotals(transactions, m).income),
      expense: months.map((m) => monthTotals(transactions, m).expense)
    }
  }, [transactions, lang])

  const goalRows = useMemo(
    () =>
      goals
        .map((goal) => ({ goal, progress: goalProgress(goal, accounts, transactions) }))
        .sort((a, b) => b.progress / b.goal.targetAmount - a.progress / a.goal.targetAmount)
        .slice(0, 4),
    [goals, accounts, transactions]
  )

  const budgetRows = useMemo(() => {
    const spent = spendingByCategory(transactions, month)
    return budgets
      .map((budget) => {
        const category = categories.find((c) => c.id === budget.categoryId)
        return {
          budget,
          name: category?.name ?? '—',
          color: category?.color ?? 'var(--primary)',
          spent: spent.get(budget.categoryId) ?? 0
        }
      })
      .sort((a, b) => b.spent / b.budget.monthlyLimit - a.spent / a.budget.monthlyLimit)
      .slice(0, 4)
  }, [budgets, categories, transactions, month])

  const changeCurrency = async (next: string): Promise<void> => {
    const ok = await useProfile.getState().saveCurrency(next)
    if (!ok) toast.error(t('toasts.saveError'))
  }

  const drillTo = (index: number): void => {
    const id = donut[index]?.id
    if (id === null || id === undefined) return
    setPendingTxFilter({ categoryId: id, month })
  }

  const payBill = async (bill: Bill): Promise<void> => {
    if (bill.cardId) {
      setPayingBill(bill)
      return
    }
    const result = await markBillPaid(bill.id)
    if (result === 'ok') toast.success(t('toasts.updated'))
    else toast.error(t('toasts.saveError'))
  }

  if (accounts.length === 0 && transactions.length === 0) {
    return <EmptyState icon={Wallet} title={t('finance.emptyTitle')} hint={t('finance.emptyHint')} />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t('finance.currencyHint')}</span>
        <Select className="w-28" value={currency} onChange={(e) => void changeCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      {alerts.length > 0 && (
        <Card>
          <CardTitle>
            <Receipt />
            {t('finance.billsTitle')}
            <CardTitleSub>{t('finance.billsAlertSub')}</CardTitleSub>
          </CardTitle>
          <div className="flex flex-col gap-2.5">
            {alerts.map(({ bill, state }) => (
              <div key={bill.id} className="flex items-center gap-2.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: state === 'overdue' ? 'var(--destructive)' : '#f59e0b' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{bill.name}</span>
                    <BillBadge state={state} />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('finance.billDueOn', { date: formatDate(bill.dueDate, lang, 'short') })}
                  </div>
                </div>
                <span className="tabular shrink-0 text-sm font-semibold">{money(bill.amount)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('finance.markPaid')}
                  title={t('finance.markPaid')}
                  onClick={() => void payBill(bill)}
                >
                  <Check />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,320px)_1fr]">
        <HealthCard score={health.score} band={health.band} t={t} />
        <InsightsCard insights={insights} t={t} />
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <MetricCard
          icon={Wallet}
          label={t('finance.netWorth')}
          value={money(netWorth)}
          sub={t('finance.acrossAccounts')}
          delta={pctChange(netWorth, prevNetWorth)}
          increaseGood
        />
        <MetricCard
          icon={TrendingUp}
          label={t('finance.incomeMonth')}
          value={money(totals.income)}
          sub={t('common.thisMonth')}
          delta={pctChange(totals.income, prevTotals.income)}
          increaseGood
        />
        <MetricCard
          icon={Activity}
          label={t('finance.expensesMonth')}
          value={money(totals.expense)}
          sub={t('common.thisMonth')}
          delta={pctChange(totals.expense, prevTotals.expense)}
          increaseGood={false}
        />
        <MetricCard
          icon={Target}
          label={t('finance.netMonth')}
          value={money(net)}
          sub={t('finance.projectionEom', { value: money(projection) })}
          delta={pctChange(net, prevNet)}
          increaseGood
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle>
            <Wallet />
            {t('finance.netWorthTrend')}
            <CardTitleSub>{t('finance.last6months')}</CardTitleSub>
          </CardTitle>
          <LineChart
            labels={netWorthTrend.labels}
            series={[{ name: t('finance.netWorth'), color: 'var(--primary)', values: netWorthTrend.values }]}
            area
            height={150}
            formatValue={money}
          />
        </Card>

        <Card>
          <CardTitle>
            <TrendingUp />
            {t('finance.cashflow')}
            <CardTitleSub>{t('finance.last6months')}</CardTitleSub>
          </CardTitle>
          <LineChart
            labels={cashflow.labels}
            series={[
              { name: t('finance.income'), color: 'var(--success)', values: cashflow.income },
              { name: t('finance.expense'), color: 'var(--destructive)', values: cashflow.expense }
            ]}
            yMin={0}
            height={150}
            formatValue={money}
          />
          <div className="mt-2">
            <ChartLegend
              items={[
                { label: t('finance.income'), color: 'var(--success)' },
                { label: t('finance.expense'), color: 'var(--destructive)' }
              ]}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>
          <Activity />
          {t('finance.spendingByCategory')}
          <CardTitleSub>{t('common.thisMonth')}</CardTitleSub>
        </CardTitle>
        {donut.length > 0 ? (
          <DonutChart
            segments={donut}
            centerLabel={money(donut.reduce((sum, s) => sum + s.value, 0))}
            formatValue={money}
            onSegmentClick={drillTo}
          />
        ) : (
          <p className="text-xs text-muted-foreground">{t('finance.noExpensesMonth')}</p>
        )}
      </Card>

      {(goalRows.length > 0 || recurring.length > 0) && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {goalRows.length > 0 && (
            <Card>
              <CardTitle>
                <PiggyBank />
                {t('finance.goalsTitle')}
              </CardTitle>
              <div className="flex flex-col gap-3">
                {goalRows.map(({ goal, progress }) => {
                  const reached = progress >= goal.targetAmount
                  return (
                    <div key={goal.id}>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">{goal.name}</span>
                        <span className="tabular shrink-0 text-xs text-muted-foreground">
                          {money(progress)} / {money(goal.targetAmount)}
                        </span>
                      </div>
                      <ProgressBar value={progress} max={goal.targetAmount} color="var(--primary)" />
                      {(goal.targetDate || reached) && (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {reached
                            ? t('finance.goalReached')
                            : t('finance.goalTargetBy', { date: formatDate(goal.targetDate!, lang, 'short') })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {recurring.length > 0 && (
            <Card>
              <CardTitle>
                <Repeat />
                {t('finance.recurringTitle')}
                <CardTitleSub>{t('finance.recurringSub')}</CardTitleSub>
              </CardTitle>
              <div className="flex flex-col gap-2.5">
                {recurring.map((r) => (
                  <div key={r.key} className="flex items-center gap-2">
                    <ColorDot color={r.color} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {t('finance.recurringNext', { date: formatDate(r.nextCharge, lang, 'short') })}
                      </div>
                    </div>
                    <span className="tabular shrink-0 text-sm font-semibold">{money(r.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {budgetRows.length > 0 && (
        <Card>
          <CardTitle>
            <Target />
            {t('finance.budgetProgress')}
            <CardTitleSub>{t('common.thisMonth')}</CardTitleSub>
          </CardTitle>
          <div className="flex flex-col gap-3">
            {budgetRows.map(({ budget, name, color, spent }) => (
              <div key={budget.id}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <ColorDot color={color} />
                    <span className="truncate">{name}</span>
                  </span>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">
                    {money(spent)} / {money(budget.monthlyLimit)}
                  </span>
                </div>
                <ProgressBar value={spent} max={budget.monthlyLimit} color={color} warnOverflow />
              </div>
            ))}
          </div>
        </Card>
      )}

      {payingBill && <PayBillDialog bill={payingBill} onClose={() => setPayingBill(null)} />}
    </div>
  )
}

/* -------------------------------- pieces --------------------------------- */

function DeltaChip({ pct, increaseGood }: { pct: number | null; increaseGood: boolean }) {
  const t = useT()
  if (pct === null || !Number.isFinite(pct)) return null
  const up = pct >= 0
  const good = up === increaseGood
  const Arrow = up ? ArrowUp : ArrowDown
  return (
    <span
      title={t('finance.vsLastMonth')}
      className={cn('inline-flex items-center gap-0.5 text-[11px] font-medium', good ? 'text-success' : 'text-destructive')}
    >
      <Arrow className="size-3" />
      {Math.round(Math.abs(pct))}%
    </span>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  delta,
  increaseGood
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  delta?: number | null
  increaseGood: boolean
}) {
  return (
    <div className="rounded-lg border bg-card p-3.5 shadow-xs">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="tabular truncate text-lg font-semibold">{value}</span>
        {delta !== undefined && <DeltaChip pct={delta} increaseGood={increaseGood} />}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function HealthCard({ score, band, t }: { score: number; band: HealthBand; t: Translator }) {
  const color = BAND_COLOR[band]
  return (
    <Card>
      <CardTitle>
        <HeartPulse />
        {t('finance.healthTitle')}
        <CardTitleSub>{t('finance.healthSub')}</CardTitleSub>
      </CardTitle>
      <div className="flex items-center gap-4">
        <div className="tabular text-3xl leading-none font-bold" style={{ color }}>
          {score}
          <span className="text-base text-muted-foreground">/100</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold" style={{ color }}>
            {t(BAND_KEY[band])}
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
          </div>
        </div>
      </div>
    </Card>
  )
}

const INSIGHT_ICON: Record<Insight['kind'], LucideIcon> = {
  increase: TrendingUp,
  decrease: TrendingDown,
  budgetNear: Target
}
const INSIGHT_COLOR: Record<Insight['kind'], string> = {
  increase: 'var(--destructive)',
  decrease: 'var(--success)',
  budgetNear: '#f59e0b'
}
const INSIGHT_TKEY = {
  increase: 'finance.insightIncrease',
  decrease: 'finance.insightDecrease',
  budgetNear: 'finance.insightBudgetNear'
} as const

function InsightsCard({ insights, t }: { insights: Insight[]; t: Translator }) {
  if (insights.length === 0) return null
  return (
    <Card>
      <CardTitle>
        <Sparkles />
        {t('finance.insightsTitle')}
      </CardTitle>
      <ul className="flex flex-col gap-2">
        {insights.map((insight, i) => {
          const Icon = INSIGHT_ICON[insight.kind]
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Icon className="mt-0.5 size-4 shrink-0" style={{ color: INSIGHT_COLOR[insight.kind] }} />
              <span className="text-muted-foreground">
                {t(INSIGHT_TKEY[insight.kind], { pct: Math.round(insight.pct), category: insight.category })}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
