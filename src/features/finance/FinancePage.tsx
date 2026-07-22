import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useT } from '@/i18n'
import { Accounts } from './sections/Accounts'
import { Budgets } from './sections/Budgets'
import { Categories } from './sections/Categories'
import { Dashboard } from './sections/Dashboard'
import { Transactions } from './sections/Transactions'

export function FinancePage() {
  const t = useT()
  return (
    <div>
      <h2 className="mb-3 text-xl font-semibold">{t('nav.finances')}</h2>
      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">{t('finance.tabDashboard')}</TabsTrigger>
          <TabsTrigger value="transactions">{t('finance.tabTransactions')}</TabsTrigger>
          <TabsTrigger value="accounts">{t('finance.tabAccounts')}</TabsTrigger>
          <TabsTrigger value="budgets">{t('finance.tabBudgets')}</TabsTrigger>
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
        <TabsContent value="budgets">
          <Budgets />
        </TabsContent>
        <TabsContent value="categories">
          <Categories />
        </TabsContent>
      </Tabs>
    </div>
  )
}
