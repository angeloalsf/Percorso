import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CreditCard as CreditCardIcon, Landmark, Plus, Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ColorDot, List, ListRow } from '@/components/ui/list'
import { ProgressBar } from '@/components/ui/progress-bar'
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

/** One tappable row that drills down a level. */
function DrillRow({
  color,
  name,
  primary,
  secondary,
  archived,
  archivedLabel,
  badge,
  progress,
  onClick
}: {
  color?: string
  name: string
  primary: string
  secondary: string
  archived?: boolean
  archivedLabel?: string
  badge?: string
  progress?: { value: number; max: number }
  onClick: () => void
}) {
  return (
    <ListRow className={cn('p-0', archived && 'opacity-55')}>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/60"
        onClick={onClick}
      >
        {color && <ColorDot color={color} />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium">{name}</span>
            {badge && <Badge>{badge}</Badge>}
            {archived && archivedLabel && <Badge>{archivedLabel}</Badge>}
          </span>
          <span className="tabular mt-0.5 block text-sm font-semibold">
            {primary} <span className="text-xs font-normal text-muted-foreground">{secondary}</span>
          </span>
          {progress && <ProgressBar className="mt-2 max-w-sm" value={progress.value} max={progress.max} />}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </ListRow>
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
