import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { useLang, useT } from '@/i18n'
import { formatCurrency } from '@/lib/format'
import { useProfile } from '@/state/profile'
import { payCardBill, useFinanceStore, type Bill } from '../store'

export type BillDisplayState = 'paid' | 'overdue' | 'dueSoon' | 'upcoming'

/** Pay a card-linked bill: pick the bank account it comes from, book the expense, mark paid. */
export function PayBillDialog({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const t = useT()
  const lang = useLang()
  const accounts = useFinanceStore((s) => s.accounts)
  const currency = useProfile((s) => s.currency)
  const activeAccounts = accounts.filter((a) => !a.archived)

  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)

  const confirm = async (): Promise<void> => {
    if (!accountId) return
    setSubmitting(true)
    const result = await payCardBill(bill, accountId)
    setSubmitting(false)
    if (result === 'ok') {
      toast.success(t('toasts.updated'))
      onClose()
    } else {
      toast.error(t('toasts.saveError'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('finance.payBillTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="mb-3 text-sm text-muted-foreground">
            {bill.name} ·{' '}
            <span className="tabular font-medium text-foreground">{formatCurrency(bill.amount, currency, lang)}</span>
          </p>
          <Field label={t('finance.payFromAccount')}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void confirm()} disabled={submitting || !accountId}>
            {t('finance.markPaid')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Small badge reflecting a bill's alert/lifecycle state. */
export function BillBadge({ state }: { state: BillDisplayState }) {
  const t = useT()
  if (state === 'overdue') return <Badge variant="danger">{t('finance.billOverdue')}</Badge>
  if (state === 'dueSoon') return <Badge variant="warning">{t('finance.billDueSoon')}</Badge>
  if (state === 'paid') return <Badge variant="success">{t('finance.billPaid')}</Badge>
  return null
}
