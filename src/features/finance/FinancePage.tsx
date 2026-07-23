import { useEffect, useState } from 'react'
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
  const [tab, setTab] = useState('dashboard')
  const pendingTxFilter = useFinanceStore((s) => s.pendingTxFilter)

  // A dashboard chart drill-down asks to jump to the Transactions tab.
  useEffect(() => {
    if (pendingTxFilter) setTab('transactions')
  }, [pendingTxFilter])

  return (
    <div>
      <Tabs value={tab} onValueChange={setTab}>
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
