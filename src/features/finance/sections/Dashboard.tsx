import { useMemo } from 'react'
import { Activity, Target, TrendingUp, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { ChartLegend } from '@/components/charts/ChartLegend'
import { DonutChart } from '@/components/charts/DonutChart'
import { LineChart } from '@/components/charts/LineChart'
import { Card, CardTitle, CardTitleSub } from '@/components/ui/card'
import { ColorDot } from '@/components/ui/list'
import { EmptyState } from '@/components/ui/empty-state'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Select } from '@/components/ui/select'
import { StatCard } from '@/components/ui/stat-card'
import { useLang, useT } from '@/i18n'
import { currentMonthKey, lastNMonthKeys } from '@/lib/dates'
import { formatCurrency, formatMonthShort } from '@/lib/format'
import { CURRENCIES, useProfile } from '@/state/profile'
import { accountBalance, monthTotals, spendingByCategory, useFinanceStore } from '../store'

export function Dashboard() {
  const t = useT()
  const lang = useLang()
  const { accounts, categories, transactions, budgets } = useFinanceStore()
  const currency = useProfile((s) => s.currency)
  const money = (v: number): string => formatCurrency(v, currency, lang)

  const month = currentMonthKey()
  const totals = useMemo(() => monthTotals(transactions, month), [transactions, month])
  const netWorth = useMemo(
    () => accounts.filter((a) => !a.archived).reduce((sum, a) => sum + accountBalance(a, transactions), 0),
    [accounts, transactions]
  )

  const donut = useMemo(() => {
    const byCategory = spendingByCategory(transactions, month)
    const segments = [...byCategory.entries()]
      .map(([categoryId, value]) => {
        const category = categories.find((c) => c.id === categoryId)
        return {
          label: category?.name ?? t('finance.uncategorized'),
          color: category?.color ?? 'var(--border)',
          value
        }
      })
      .sort((a, b) => b.value - a.value)
    if (segments.length > 6) {
      const rest = segments.splice(5)
      segments.push({
        label: t('finance.otherCategories'),
        color: 'var(--muted-foreground)',
        value: rest.reduce((s, x) => s + x.value, 0)
      })
    }
    return segments
  }, [transactions, categories, month, t])

  const cashflow = useMemo(() => {
    const months = lastNMonthKeys(6)
    return {
      labels: months.map((m) => formatMonthShort(m, lang)),
      income: months.map((m) => monthTotals(transactions, m).income),
      expense: months.map((m) => monthTotals(transactions, m).expense)
    }
  }, [transactions, lang])

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

  if (accounts.length === 0 && transactions.length === 0) {
    return <EmptyState icon={Wallet} title={t('finance.emptyTitle')} hint={t('finance.emptyHint')} />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t('finance.currencyHint')}</span>
        <Select
          className="w-28"
          value={currency}
          onChange={(e) => void changeCurrency(e.target.value)}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard icon={Wallet} label={t('finance.netWorth')} value={money(netWorth)} sub={t('finance.acrossAccounts')} />
        <StatCard icon={TrendingUp} label={t('finance.incomeMonth')} value={money(totals.income)} sub={t('common.thisMonth')} />
        <StatCard icon={Activity} label={t('finance.expensesMonth')} value={money(totals.expense)} sub={t('common.thisMonth')} />
        <StatCard
          icon={Target}
          label={t('finance.netMonth')}
          value={money(totals.income - totals.expense)}
          sub={t('common.thisMonth')}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle>
            <Activity />
            {t('finance.spendingByCategory')}
            <CardTitleSub>{t('common.thisMonth')}</CardTitleSub>
          </CardTitle>
          {donut.length > 0 ? (
            <DonutChart segments={donut} centerLabel={money(totals.expense)} formatValue={money} />
          ) : (
            <p className="text-xs text-muted-foreground">{t('finance.noExpensesMonth')}</p>
          )}
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
    </div>
  )
}
