import { useMemo, useState } from 'react'
import { Check, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, FormGrid } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { List, ListRow } from '@/components/ui/list'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { useLang, useT } from '@/i18n'
import { addDays, todayISO } from '@/lib/dates'
import { formatCurrency, formatDate } from '@/lib/format'
import { useProfile } from '@/state/profile'
import {
  addBill,
  deleteBill,
  markBillPaid,
  payCardBill,
  updateBill,
  useFinanceStore,
  type Bill,
  type BillInput,
  type BillStatus
} from '../store'

type BillDisplayState = 'paid' | 'overdue' | 'dueSoon' | 'upcoming'

function displayState(bill: Bill, today: string, horizon: string): BillDisplayState {
  if (bill.status === 'paid') return 'paid'
  if (bill.dueDate < today) return 'overdue'
  if (bill.dueDate <= horizon) return 'dueSoon'
  return 'upcoming'
}

export function Bills() {
  const t = useT()
  const lang = useLang()
  const bills = useFinanceStore((s) => s.bills)
  const currency = useProfile((s) => s.currency)
  const money = (v: number): string => formatCurrency(v, currency, lang)

  const [editing, setEditing] = useState<Bill | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Bill | null>(null)
  const [paying, setPaying] = useState<Bill | null>(null)

  const today = todayISO()
  const horizon = addDays(today, 7)

  // Pending first (soonest due first), then paid (most recent due first).
  const rows = useMemo(
    () =>
      [...bills].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
        return a.status === 'paid' ? b.dueDate.localeCompare(a.dueDate) : a.dueDate.localeCompare(b.dueDate)
      }),
    [bills]
  )

  const confirmDelete = async (bill: Bill): Promise<void> => {
    const result = await deleteBill(bill.id)
    setDeleting(null)
    if (result === 'ok') toast.success(t('toasts.deleted'))
    else toast.error(t('toasts.saveError'))
  }

  // Card bills require choosing a source account (creates a real expense); manual bills just flip to paid.
  const pay = async (bill: Bill): Promise<void> => {
    if (bill.cardId) {
      setPaying(bill)
      return
    }
    const result = await markBillPaid(bill.id)
    if (result === 'ok') toast.success(t('toasts.updated'))
    else toast.error(t('toasts.saveError'))
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t('finance.tabBills')}</h3>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus />
          {t('finance.addBill')}
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Receipt} title={t('finance.noBillsTitle')} hint={t('finance.noBillsHint')} />
      ) : (
        <List>
          {rows.map((bill) => {
            const dstate = displayState(bill, today, horizon)
            return (
              <ListRow key={bill.id}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`truncate text-sm font-medium ${dstate === 'paid' ? 'text-muted-foreground line-through' : ''}`}>
                      {bill.name}
                    </span>
                    <BillBadge state={dstate} />
                  </div>
                  <div className="tabular mt-0.5 text-xs text-muted-foreground">
                    {money(bill.amount)} · {t('finance.billDueOn', { date: formatDate(bill.dueDate, lang, 'short') })}
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  {bill.status === 'pending' && (
                    <Button variant="ghost" size="icon" aria-label={t('finance.markPaid')} title={t('finance.markPaid')} onClick={() => void pay(bill)}>
                      <Check />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" aria-label={t('common.edit')} onClick={() => setEditing(bill)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => setDeleting(bill)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </ListRow>
            )
          })}
        </List>
      )}

      {editing && <BillForm bill={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {paying && <PayBillDialog bill={paying} onClose={() => setPaying(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t('common.deleteTitle')}
          message={t('finance.deleteBillConfirm')}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </>
  )
}

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
            {bill.name} · <span className="tabular font-medium text-foreground">{formatCurrency(bill.amount, currency, lang)}</span>
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

function BillForm({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  const t = useT()
  const [name, setName] = useState(bill?.name ?? '')
  const [amount, setAmount] = useState(bill ? String(bill.amount) : '')
  const [dueDate, setDueDate] = useState(bill?.dueDate ?? todayISO())
  const [status, setStatus] = useState<BillStatus>(bill?.status ?? 'pending')
  const [recurring, setRecurring] = useState(bill?.recurring ?? false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      setError(t('errors.nameRequired'))
      return
    }
    const parsedAmount = Number(amount)
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(t('finance.amountInvalid'))
      return
    }
    const input: BillInput = { name: name.trim(), amount: parsedAmount, dueDate, status, recurring }
    setSubmitting(true)
    const result = bill ? await updateBill(bill.id, input) : await addBill(input)
    setSubmitting(false)
    if (result === 'ok') {
      toast.success(t(bill ? 'toasts.updated' : 'toasts.added'))
      onClose()
    } else {
      toast.error(t('toasts.saveError'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{bill ? t('finance.editBill') : t('finance.addBill')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <FormGrid>
            <Field label={t('finance.billName')} span2>
              <Input value={name} placeholder={t('finance.billNamePlaceholder')} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label={t('finance.amount')}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={amount}
                placeholder="0.00"
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label={t('finance.dueDate')}>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label={t('finance.billStatus')} span2>
              <Segmented<BillStatus>
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'pending', label: t('finance.billPending') },
                  { value: 'paid', label: t('finance.billPaid') }
                ]}
              />
            </Field>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              <span className="text-sm">{t('finance.billRecurring')}</span>
            </label>
          </FormGrid>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
