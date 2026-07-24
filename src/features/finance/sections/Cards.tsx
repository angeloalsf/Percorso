import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, CreditCard as CreditCardIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ColorSwatches, PALETTE } from '@/components/ui/color-swatches'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, FormGrid } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ColorDot, List, ListRow } from '@/components/ui/list'
import { Select } from '@/components/ui/select'
import { useLang, useT } from '@/i18n'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useProfile } from '@/state/profile'
import {
  addCard,
  cardOpenInvoice,
  deleteCard,
  nextCardDue,
  setCardArchived,
  updateCard,
  useFinanceStore,
  type CardInput,
  type CreditCard
} from '../store'

export function Cards() {
  const t = useT()
  const lang = useLang()
  const { creditCards, accounts, transactions } = useFinanceStore()
  const currency = useProfile((s) => s.currency)
  const money = (v: number): string => formatCurrency(v, currency, lang)

  const [editing, setEditing] = useState<CreditCard | 'new' | null>(null)
  const [deleting, setDeleting] = useState<CreditCard | null>(null)

  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts])

  const confirmDelete = async (card: CreditCard): Promise<void> => {
    const result = await deleteCard(card.id)
    setDeleting(null)
    if (result === 'ok') toast.success(t('toasts.deleted'))
    else if (result === 'in-use') toast.error(t('finance.cardInUse'))
    else toast.error(t('toasts.saveError'))
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t('finance.tabCards')}</h3>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus />
          {t('finance.addCard')}
        </Button>
      </div>
      {creditCards.length === 0 ? (
        <EmptyState icon={CreditCardIcon} title={t('finance.noCardsTitle')} hint={t('finance.noCardsHint')} />
      ) : (
        <List>
          {creditCards.map((card) => {
            const invoice = cardOpenInvoice(card, transactions)
            const issuer = card.issuingAccountId ? accountName.get(card.issuingAccountId) : undefined
            return (
              <ListRow key={card.id} className={cn('items-start', card.archived && 'opacity-55')}>
                <ColorDot color={card.color} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{card.name}</span>
                    {issuer && <Badge>{issuer}</Badge>}
                    {card.archived && <Badge>{t('finance.archived')}</Badge>}
                  </div>
                  <div className="tabular mt-0.5 text-sm font-semibold">
                    {money(invoice)}{' '}
                    <span className="text-xs font-normal text-muted-foreground">{t('finance.openInvoice')}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t('finance.cardNextDue', { date: formatDate(nextCardDue(card), lang, 'short') })}
                    {card.creditLimit != null ? ` · ${money(card.creditLimit)}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={card.archived ? t('finance.unarchive') : t('finance.archive')}
                    onClick={() => void setCardArchived(card.id, !card.archived)}
                  >
                    {card.archived ? <ArchiveRestore /> : <Archive />}
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={t('common.edit')} onClick={() => setEditing(card)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => setDeleting(card)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </ListRow>
            )
          })}
        </List>
      )}

      {editing && <CardForm card={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t('common.deleteTitle')}
          message={t('finance.deleteCardConfirm', { name: deleting.name })}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </>
  )
}

function CardForm({ card, onClose }: { card: CreditCard | null; onClose: () => void }) {
  const t = useT()
  const accounts = useFinanceStore((s) => s.accounts)
  const activeAccounts = accounts.filter((a) => !a.archived || a.id === card?.issuingAccountId)

  const [name, setName] = useState(card?.name ?? '')
  const [issuingAccountId, setIssuingAccountId] = useState(card?.issuingAccountId ?? '')
  const [closingDay, setClosingDay] = useState(card ? String(card.closingDay) : '1')
  const [dueDay, setDueDay] = useState(card ? String(card.dueDay) : '10')
  const [creditLimit, setCreditLimit] = useState(card?.creditLimit != null ? String(card.creditLimit) : '')
  const [color, setColor] = useState(card?.color ?? PALETTE[5] ?? PALETTE[0])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const validDay = (v: string): boolean => {
    const n = Number(v)
    return Number.isInteger(n) && n >= 1 && n <= 31
  }

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      setError(t('errors.nameRequired'))
      return
    }
    if (!validDay(closingDay) || !validDay(dueDay)) {
      setError(t('finance.dayInvalid'))
      return
    }
    const limit = creditLimit.trim() === '' ? undefined : Number(creditLimit)
    const input: CardInput = {
      name: name.trim(),
      ...(issuingAccountId ? { issuingAccountId } : {}),
      closingDay: Number(closingDay),
      dueDay: Number(dueDay),
      ...(limit != null && !Number.isNaN(limit) && limit >= 0 ? { creditLimit: limit } : {}),
      color
    }
    setSubmitting(true)
    const result = card ? await updateCard(card.id, input) : await addCard(input)
    setSubmitting(false)
    if (result === 'ok') {
      toast.success(t(card ? 'toasts.updated' : 'toasts.added'))
      onClose()
    } else {
      toast.error(t('toasts.saveError'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{card ? t('finance.editCard') : t('finance.addCard')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <FormGrid>
            <Field label={t('finance.cardName')} span2 error={error ?? undefined}>
              <Input
                value={name}
                placeholder={t('finance.cardNamePlaceholder')}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label={t('finance.issuingAccount')} span2>
              <Select value={issuingAccountId} onChange={(e) => setIssuingAccountId(e.target.value)}>
                <option value="">{t('finance.issuingAccountNone')}</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('finance.closingDay')}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={closingDay}
                onChange={(e) => setClosingDay(e.target.value)}
              />
            </Field>
            <Field label={t('finance.dueDay')}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </Field>
            <Field label={t('finance.creditLimitOptional')}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={creditLimit}
                placeholder="—"
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </Field>
            <Field label={t('common.color')}>
              <ColorSwatches value={color} onChange={setColor} />
            </Field>
          </FormGrid>
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
