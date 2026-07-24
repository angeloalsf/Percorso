import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ColorDot } from '@/components/ui/list'
import { ProgressBar } from '@/components/ui/progress-bar'
import { useLang, useT } from '@/i18n'
import { formatCurrency, formatDate } from '@/lib/format'
import { useProfile } from '@/state/profile'
import {
  cardOpenInvoice,
  deleteConsortium,
  deleteLoan,
  installmentsPaidNow,
  nextCardDue,
  planNextDue,
  planRemaining,
  useFinanceStore,
  type Consortium,
  type Loan
} from '../store'
import { ConsortiumForm, LoanForm } from './PlanForm'

/**
 * Level 3 of the drill-down: one card, loan or consórcio. `kind` comes from the
 * route (/finances/accounts/:accountId/:kind/:itemId) so each item is
 * deep-linkable and the browser back button returns to the account's tabs.
 */
export function AccountItemPage() {
  const t = useT()
  const lang = useLang()
  const navigate = useNavigate()
  const { accountId = '', kind = '', itemId = '' } = useParams()
  const { accounts, transactions, creditCards, loans, consortiums } = useFinanceStore()
  const currency = useProfile((s) => s.currency)
  const money = (v: number): string => formatCurrency(v, currency, lang)

  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const account = accounts.find((a) => a.id === accountId)
  const card = kind === 'cards' ? creditCards.find((c) => c.id === itemId) : undefined
  const loan = kind === 'loans' ? loans.find((l) => l.id === itemId) : undefined
  const consortium = kind === 'consortiums' ? consortiums.find((c) => c.id === itemId) : undefined

  // Unknown kind, deleted item, or a stale link — go back up a level.
  if (!account) return <Navigate to="/finances" replace />
  if (!card && !loan && !consortium) return <Navigate to={`/finances/accounts/${accountId}`} replace />

  const back = (): void => void navigate(`/finances/accounts/${account.id}`)

  const confirmDelete = async (): Promise<void> => {
    const result = loan ? await deleteLoan(loan.id) : consortium ? await deleteConsortium(consortium.id) : 'error'
    setDeleting(false)
    if (result === 'ok') {
      toast.success(t('toasts.deleted'))
      back()
    } else {
      toast.error(t('toasts.saveError'))
    }
  }

  const plan: Loan | Consortium | undefined = loan ?? consortium

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={back}>
        <ChevronLeft />
        {t('finance.backToAccount', { name: account.name })}
      </Button>

      <div className="mb-4 flex items-start gap-3">
        {card && <ColorDot color={card.color} className="mt-2 size-3" />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{card?.name ?? plan?.name}</h2>
          {consortium && (
            <Badge className="mt-1">
              {consortium.contemplated ? t('finance.contemplated') : t('finance.notContemplated')}
            </Badge>
          )}
        </div>
        {plan && (
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" size="icon" aria-label={t('common.edit')} onClick={() => setEditing(true)}>
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              aria-label={t('common.delete')}
              onClick={() => setDeleting(true)}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      {card && (
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t('finance.openInvoice')}</p>
          <p className="tabular mt-1 text-2xl font-semibold">{money(cardOpenInvoice(card, transactions))}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('finance.cardNextDue', { date: formatDate(nextCardDue(card), lang, 'medium') })}
          </p>
          {card.creditLimit != null && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('finance.creditLimitOptional')}: {money(card.creditLimit)}
            </p>
          )}
        </Card>
      )}

      {plan && <PlanDetail plan={plan} money={money} />}

      {editing && loan && <LoanForm accountId={account.id} loan={loan} onClose={() => setEditing(false)} />}
      {editing && consortium && (
        <ConsortiumForm accountId={account.id} consortium={consortium} onClose={() => setEditing(false)} />
      )}
      {deleting && plan && (
        <ConfirmDialog
          title={t('common.deleteTitle')}
          message={t(loan ? 'finance.deleteLoanConfirm' : 'finance.deleteConsortiumConfirm', { name: plan.name })}
          onCancel={() => setDeleting(false)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  )
}

function PlanDetail({ plan, money }: { plan: Loan | Consortium; money: (v: number) => string }) {
  const t = useT()
  const lang = useLang()
  const paid = installmentsPaidNow(plan)
  const nextDue = planNextDue(plan)

  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{t('finance.installmentAmount')}</p>
      <p className="tabular mt-1 text-2xl font-semibold">{money(plan.installmentAmount)}</p>

      <p className="mt-4 text-sm font-medium">
        {t('finance.installmentProgress', { paid: String(paid), total: String(plan.installmentsTotal) })}
      </p>
      <ProgressBar className="mt-2" value={paid} max={plan.installmentsTotal} />

      <p className="mt-3 text-sm text-muted-foreground">{t('finance.remainingAmount', { amount: money(planRemaining(plan)) })}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {nextDue
          ? t('finance.nextInstallment', { date: formatDate(nextDue, lang, 'medium') })
          : t('finance.fullyPaid')}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        {t('finance.totalAmount')}: {money(plan.totalAmount)}
      </p>
    </Card>
  )
}
