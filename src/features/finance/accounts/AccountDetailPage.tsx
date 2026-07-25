import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, CreditCard as CreditCardIcon, Landmark, Plus, Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ColorDot, DrillRow, List } from '@/components/ui/list'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLang, useT } from '@/i18n'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useProfile } from '@/state/profile'
import {
  accountBalance,
  cardOpenInvoice,
  installmentsPaidNow,
  useFinanceStore,
  type Consortium,
  type Loan
} from '../store'
import { ConsortiumForm, LoanForm } from './PlanForm'

/**
 * Level 2 of the drill-down: everything tied to ONE bank account, split into
 * Cartões / Empréstimos / Consórcios. Level 1 is the Contas bancárias list
 * (sections/Accounts), level 3 is AccountItemPage.
 */
export function AccountDetailPage() {
  const t = useT()
  const lang = useLang()
  const navigate = useNavigate()
  const { accountId = '' } = useParams()
  const { accounts, transactions, creditCards, loans, consortiums } = useFinanceStore()
  const currency = useProfile((s) => s.currency)
  const money = (v: number): string => formatCurrency(v, currency, lang)

  const [adding, setAdding] = useState<'loan' | 'consortium' | null>(null)

  const account = accounts.find((a) => a.id === accountId)
  // Deleted in another tab, or a stale bookmark — fall back to the list.
  if (!account) return <Navigate to="/finances" replace />

  const accountCards = creditCards.filter((c) => c.issuingAccountId === account.id)
  const accountLoans = loans.filter((l) => l.accountId === account.id)
  const accountConsortiums = consortiums.filter((c) => c.accountId === account.id)
  const balance = accountBalance(account, transactions)

  const openItem = (kind: string, id: string): void => {
    void navigate(`/finances/accounts/${account.id}/${kind}/${id}`)
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => void navigate('/finances')}>
        <ChevronLeft />
        {t('finance.backToAccounts')}
      </Button>

      <div className="mb-4 flex items-center gap-3">
        <ColorDot color={account.color} className="size-3" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{account.name}</h2>
          <p className={cn('tabular text-sm font-semibold', balance < 0 && 'text-destructive')}>{money(balance)}</p>
        </div>
        {account.archived && <Badge>{t('finance.archived')}</Badge>}
      </div>

      <Tabs defaultValue="cards">
        <TabsList>
          <TabsTrigger value="cards">{t('finance.accountTabCards')}</TabsTrigger>
          <TabsTrigger value="loans">{t('finance.accountTabLoans')}</TabsTrigger>
          <TabsTrigger value="consortiums">{t('finance.accountTabConsortiums')}</TabsTrigger>
        </TabsList>

        <TabsContent value="cards">
          {accountCards.length === 0 ? (
            <EmptyState
              icon={CreditCardIcon}
              title={t('finance.noAccountCardsTitle')}
              hint={t('finance.noAccountCardsHint')}
            />
          ) : (
            <List>
              {accountCards.map((card) => (
                <DrillRow
                  key={card.id}
                  color={card.color}
                  name={card.name}
                  archived={card.archived}
                  archivedLabel={t('finance.archived')}
                  primary={money(cardOpenInvoice(card, transactions))}
                  secondary={t('finance.openInvoice')}
                  onClick={() => openItem('cards', card.id)}
                />
              ))}
            </List>
          )}
        </TabsContent>

        <TabsContent value="loans">
          <PlanList
            plans={accountLoans}
            emptyIcon={Landmark}
            emptyTitle={t('finance.noLoansTitle')}
            emptyHint={t('finance.noLoansHint')}
            addLabel={t('finance.addLoan')}
            onAdd={() => setAdding('loan')}
            onOpen={(id) => openItem('loans', id)}
            money={money}
          />
        </TabsContent>

        <TabsContent value="consortiums">
          <PlanList
            plans={accountConsortiums}
            emptyIcon={Receipt}
            emptyTitle={t('finance.noConsortiumsTitle')}
            emptyHint={t('finance.noConsortiumsHint')}
            addLabel={t('finance.addConsortium')}
            onAdd={() => setAdding('consortium')}
            onOpen={(id) => openItem('consortiums', id)}
            money={money}
            badgeFor={(plan) =>
              (plan as Consortium).contemplated ? t('finance.contemplated') : t('finance.notContemplated')
            }
          />
        </TabsContent>
      </Tabs>

      {adding === 'loan' && <LoanForm accountId={account.id} loan={null} onClose={() => setAdding(null)} />}
      {adding === 'consortium' && (
        <ConsortiumForm accountId={account.id} consortium={null} onClose={() => setAdding(null)} />
      )}
    </div>
  )
}

/** Shared list for loans and consórcios — they render identically bar a badge. */
function PlanList<T extends Loan | Consortium>({
  plans,
  emptyIcon,
  emptyTitle,
  emptyHint,
  addLabel,
  onAdd,
  onOpen,
  money,
  badgeFor
}: {
  plans: T[]
  emptyIcon: React.ComponentProps<typeof EmptyState>['icon']
  emptyTitle: string
  emptyHint: string
  addLabel: string
  onAdd: () => void
  onOpen: (id: string) => void
  money: (v: number) => string
  badgeFor?: (plan: T) => string
}) {
  const t = useT()
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={onAdd}>
          <Plus />
          {addLabel}
        </Button>
      </div>
      {plans.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} hint={emptyHint} />
      ) : (
        <List>
          {plans.map((plan) => {
            const paid = installmentsPaidNow(plan)
            return (
              <DrillRow
                key={plan.id}
                name={plan.name}
                primary={money(plan.installmentAmount)}
                secondary={t('finance.installmentProgress', {
                  paid: String(paid),
                  total: String(plan.installmentsTotal)
                })}
                badge={badgeFor?.(plan)}
                progress={{ value: paid, max: plan.installmentsTotal }}
                onClick={() => onOpen(plan.id)}
              />
            )
          })}
        </List>
      )}
    </>
  )
}
