import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FormGrid } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n'
import { todayISO } from '@/lib/dates'
import {
  addConsortium,
  addLoan,
  updateConsortium,
  updateLoan,
  type Consortium,
  type ConsortiumInput,
  type Loan,
  type LoanInput
} from '../store'

/**
 * Loans and consórcios share every field but `contemplated`, so they share one
 * form. Minimal v1: no bill generation, no payment linking — `installmentsPaid`
 * is a baseline the user types, dated by `paidAsOf`, which the app then rolls
 * forward automatically (store.installmentsPaidNow).
 */
interface PlanFields {
  name: string
  totalAmount: string
  installmentAmount: string
  installmentsTotal: string
  installmentsPaid: string
  paidAsOf: string
  dueDay: string
}

function initialFields(plan: Loan | Consortium | null): PlanFields {
  return {
    name: plan?.name ?? '',
    totalAmount: plan ? String(plan.totalAmount) : '',
    installmentAmount: plan ? String(plan.installmentAmount) : '',
    installmentsTotal: plan ? String(plan.installmentsTotal) : '',
    installmentsPaid: plan ? String(plan.installmentsPaid) : '0',
    paidAsOf: plan?.paidAsOf ?? todayISO(),
    dueDay: plan ? String(plan.dueDay) : '10'
  }
}

/** Returns the parsed values, or a translation key describing what's wrong. */
function validate(f: PlanFields): { error: 'name' | 'amount' | 'day' | 'installments' } | { values: LoanInput } {
  if (!f.name.trim()) return { error: 'name' }
  const totalAmount = Number(f.totalAmount)
  const installmentAmount = Number(f.installmentAmount)
  if (!(totalAmount > 0) || !(installmentAmount > 0)) return { error: 'amount' }
  const dueDay = Number(f.dueDay)
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return { error: 'day' }
  const installmentsTotal = Number(f.installmentsTotal)
  const installmentsPaid = Number(f.installmentsPaid)
  if (
    !Number.isInteger(installmentsTotal) ||
    installmentsTotal < 1 ||
    installmentsTotal > 600 ||
    !Number.isInteger(installmentsPaid) ||
    installmentsPaid < 0 ||
    installmentsPaid > installmentsTotal
  ) {
    return { error: 'installments' }
  }
  return {
    values: {
      name: f.name.trim(),
      totalAmount,
      installmentAmount,
      installmentsTotal,
      installmentsPaid,
      paidAsOf: f.paidAsOf,
      dueDay
    }
  }
}

interface PlanDialogProps {
  title: string
  namePlaceholder: string
  fields: PlanFields
  setFields: (f: PlanFields) => void
  extra?: React.ReactNode
  submitting: boolean
  error: string | null
  onSubmit: () => void
  onClose: () => void
}

function PlanDialog({
  title,
  namePlaceholder,
  fields,
  setFields,
  extra,
  submitting,
  error,
  onSubmit,
  onClose
}: PlanDialogProps) {
  const t = useT()
  const set = (patch: Partial<PlanFields>): void => setFields({ ...fields, ...patch })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <FormGrid>
            <Field label={t('finance.loanName')} span2 error={error ?? undefined}>
              <Input
                value={fields.name}
                placeholder={namePlaceholder}
                onChange={(e) => set({ name: e.target.value })}
                autoFocus
              />
            </Field>
            <Field label={t('finance.totalAmount')}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={fields.totalAmount}
                onChange={(e) => set({ totalAmount: e.target.value })}
              />
            </Field>
            <Field label={t('finance.installmentAmount')}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={fields.installmentAmount}
                onChange={(e) => set({ installmentAmount: e.target.value })}
              />
            </Field>
            <Field label={t('finance.installmentsTotal')}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={fields.installmentsTotal}
                onChange={(e) => set({ installmentsTotal: e.target.value })}
              />
            </Field>
            <Field label={t('finance.installmentsPaid')}>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={fields.installmentsPaid}
                onChange={(e) => set({ installmentsPaid: e.target.value })}
              />
            </Field>
            <Field label={t('finance.paidAsOf')}>
              <Input type="date" value={fields.paidAsOf} onChange={(e) => set({ paidAsOf: e.target.value })} />
            </Field>
            <Field label={t('finance.dueDay')}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={fields.dueDay}
                onChange={(e) => set({ dueDay: e.target.value })}
              />
            </Field>
            {extra}
          </FormGrid>
          <p className="mt-3 text-xs text-muted-foreground">{t('finance.paidAsOfHint')}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function useSubmitState() {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const messageFor = (kind: 'name' | 'amount' | 'day' | 'installments'): string => {
    if (kind === 'name') return t('errors.nameRequired')
    if (kind === 'amount') return t('finance.amountInvalid')
    if (kind === 'day') return t('finance.dayInvalid')
    return t('finance.installmentsInvalid')
  }
  return { error, setError, submitting, setSubmitting, messageFor }
}

export function LoanForm({
  accountId,
  loan,
  onClose
}: {
  accountId: string
  loan: Loan | null
  onClose: () => void
}) {
  const t = useT()
  const [fields, setFields] = useState<PlanFields>(initialFields(loan))
  const { error, setError, submitting, setSubmitting, messageFor } = useSubmitState()

  const submit = async (): Promise<void> => {
    const result = validate(fields)
    if ('error' in result) {
      setError(messageFor(result.error))
      return
    }
    const input: LoanInput = { ...result.values, accountId }
    setSubmitting(true)
    const saved = loan ? await updateLoan(loan.id, input) : await addLoan(input)
    setSubmitting(false)
    if (saved === 'ok') {
      toast.success(t(loan ? 'toasts.updated' : 'toasts.added'))
      onClose()
    } else {
      toast.error(t('toasts.saveError'))
    }
  }

  return (
    <PlanDialog
      title={loan ? t('finance.editLoan') : t('finance.addLoan')}
      namePlaceholder={t('finance.loanNamePlaceholder')}
      fields={fields}
      setFields={setFields}
      submitting={submitting}
      error={error}
      onSubmit={() => void submit()}
      onClose={onClose}
    />
  )
}

export function ConsortiumForm({
  accountId,
  consortium,
  onClose
}: {
  accountId: string
  consortium: Consortium | null
  onClose: () => void
}) {
  const t = useT()
  const [fields, setFields] = useState<PlanFields>(initialFields(consortium))
  const [contemplated, setContemplated] = useState(consortium?.contemplated ?? false)
  const { error, setError, submitting, setSubmitting, messageFor } = useSubmitState()

  const submit = async (): Promise<void> => {
    const result = validate(fields)
    if ('error' in result) {
      setError(messageFor(result.error))
      return
    }
    const input: ConsortiumInput = { ...result.values, accountId, contemplated }
    setSubmitting(true)
    const saved = consortium ? await updateConsortium(consortium.id, input) : await addConsortium(input)
    setSubmitting(false)
    if (saved === 'ok') {
      toast.success(t(consortium ? 'toasts.updated' : 'toasts.added'))
      onClose()
    } else {
      toast.error(t('toasts.saveError'))
    }
  }

  return (
    <PlanDialog
      title={consortium ? t('finance.editConsortium') : t('finance.addConsortium')}
      namePlaceholder={t('finance.consortiumNamePlaceholder')}
      fields={fields}
      setFields={setFields}
      extra={
        <Field label={t('finance.contemplated')} span2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={contemplated}
              onChange={(e) => setContemplated(e.target.checked)}
            />
            <span className="text-muted-foreground">{t('finance.contemplatedHint')}</span>
          </label>
        </Field>
      }
      submitting={submitting}
      error={error}
      onSubmit={() => void submit()}
      onClose={onClose}
    />
  )
}
