import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useT } from '@/i18n'
import { Accounts } from './sections/Accounts'
import { Bills } from './sections/Bills'
import { Budgets } from './sections/Budgets'
import { Cards } from './sections/Cards'
import { Categories } from './sections/Categories'
import { Dashboard } from './sections/Dashboard'
import { Goals } from './sections/Goals'
import { Transactions } from './sections/Transactions'
import { useFinanceStore } from './store'

export function FinancePage() {
  const t = useT()
  const { financeTab: tab, setFinanceTab: setTab } = useOutletContext<{
    financeTab: string
    setFinanceTab: (section: string) => void
  }>()
  const pendingTxFilter = useFinanceStore((s) => s.pendingTxFilter)

  // A dashboard chart drill-down asks to jump to the Transactions tab.
  useEffect(() => {
    if (pendingTxFilter) setTab('transactions')
  }, [pendingTxFilter, setTab])

  return (
    <div>
      {tab === 'dashboard' && (
        <div className="mb-5 hidden lg:block">
          <p className="mb-1 text-xs font-semibold tracking-wider text-primary uppercase">
            Percorso / {t('nav.finances')}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('workspace.dashboardTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('workspace.dashboardIntro')}</p>
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="lg:hidden">
          <TabsList>
            <TabsTrigger value="dashboard">{t('finance.tabDashboard')}</TabsTrigger>
            <TabsTrigger value="transactions">{t('finance.tabTransactions')}</TabsTrigger>
            <TabsTrigger value="accounts">{t('finance.tabAccounts')}</TabsTrigger>
            <TabsTrigger value="cards">{t('finance.tabCards')}</TabsTrigger>
            <TabsTrigger value="budgets">{t('finance.tabBudgets')}</TabsTrigger>
            <TabsTrigger value="goals">{t('finance.tabGoals')}</TabsTrigger>
            <TabsTrigger value="bills">{t('finance.tabBills')}</TabsTrigger>
            <TabsTrigger value="categories">{t('finance.tabCategories')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="dashboard">
          <Dashboard />
        </TabsContent>
        <TabsContent value="transactions">
          <Transactions />
        </TabsContent>
        <TabsContent value="accounts">
          <Accounts />
        </TabsContent>
        <TabsContent value="cards">
          <Cards />
        </TabsContent>
        <TabsContent value="budgets">
          <Budgets />
        </TabsContent>
        <TabsContent value="goals">
          <Goals />
        </TabsContent>
        <TabsContent value="bills">
          <Bills />
        </TabsContent>
        <TabsContent value="categories">
          <Categories />
        </TabsContent>
      </Tabs>
    </div>
  )
}
