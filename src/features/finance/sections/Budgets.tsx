import { useMemo, useState } from 'react'
import { Pencil, Plus, Target, Trash2 } from 'lucide-react'
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
import { ColorDot, List, ListRow } from '@/components/ui/list'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Select } from '@/components/ui/select'
import { useLang, useT } from '@/i18n'
import { currentMonthKey } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { useProfile } from '@/state/profile'
import { deleteBudget, spendingByCategory, upsertBudget, useFinanceStore, type Budget } from '../store'

export function Budgets() {
  const t = useT()
  const lang = useLang()
  const { budgets, categories, transactions } = useFinanceStore()
  const currency = useProfile((s) => s.currency)
  const money = (v: number): string => formatCurrency(v, currency, lang)

  const [editing, setEditing] = useState<Budget | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Budget | null>(null)

  const spent = useMemo(() => spendingByCategory(transactions, currentMonthKey()), [transactions])
  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const available = expenseCategories.filter((c) => !budgets.some((b) => b.categoryId === c.id))

  const rows = useMemo(
    () =>
      budgets
        .map((budget) => ({
          budget,
          category: categories.find((c) => c.id === budget.categoryId),
          spentAmount: spent.get(budget.categoryId) ?? 0
        }))
        .sort((a, b) => b.spentAmount / b.budget.monthlyLimit - a.spentAmount / a.budget.monthlyLimit),
    [budgets, categories, spent]
  )

  const confirmDelete = async (budget: Budget): Promise<void> => {
    const result = await deleteBudget(budget.id)
    setDeleting(null)
    if (result === 'ok') toast.success(t('toasts.deleted'))
    else toast.error(t('toasts.saveError'))
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t('finance.tabBudgets')}</h3>
        <Button size="sm" onClick={() => setEditing('new')} disabled={available.length === 0 && budgets.length === 0}>
          <Plus />
          {t('finance.addBudget')}
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={Target}
          title={t('finance.noBudgetsTitle')}
          hint={expenseCategories.length === 0 ? t('finance.noBudgetsNeedCategories') : t('finance.noBudgetsHint')}
        />
      ) : (
        <List>
          {rows.map(({ budget, category, spentAmount }) => {
            const over = spentAmount > budget.monthlyLimit
            return (
              <ListRow key={budget.id} className="items-start">
                <ColorDot color={category?.color ?? 'var(--primary)'} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{category?.name ?? '—'}</span>
                    {over && <Badge variant="danger">{t('finance.overBudget')}</Badge>}
                  </div>
                  <div className="tabular mt-0.5 text-xs text-muted-foreground">
                    {money(spentAmount)} / {money(budget.monthlyLimit)} · {t('common.thisMonth')}
                  </div>
                  <ProgressBar
                    className="mt-2 max-w-sm"
                    value={spentAmount}
                    max={budget.monthlyLimit}
                    color={category?.color}
                    warnOverflow
                  />
                </div>
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon" aria-label={t('common.edit')} onClick={() => setEditing(budget)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => setDeleting(budget)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </ListRow>
            )
          })}
        </List>
      )}

      {editing && <BudgetForm budget={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t('common.deleteTitle')}
          message={t('finance.deleteBudgetConfirm')}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </>
  )
}

function BudgetForm({ budget, onClose }: { budget: Budget | null; onClose: () => void }) {
  const t = useT()
  const { budgets, categories } = useFinanceStore()
  const selectable = categories.filter(
    (c) => c.type === 'expense' && (budget?.categoryId === c.id || !budgets.some((b) => b.categoryId === c.id))
  )

  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? selectable[0]?.id ?? '')
  const [limit, setLimit] = useState(budget ? String(budget.monthlyLimit) : '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (): Promise<void> => {
    const parsedLimit = Number(limit)
    if (!categoryId) {
      setError(t('finance.categoryRequired'))
      return
    }
    if (!limit || Number.isNaN(parsedLimit) || parsedLimit <= 0) {
      setError(t('finance.amountInvalid'))
      return
    }
    setSubmitting(true)
    const result = await upsertBudget(categoryId, parsedLimit)
    setSubmitting(false)
    if (result === 'ok') {
      toast.success(t(budget ? 'toasts.updated' : 'toasts.added'))
      onClose()
    } else {
      toast.error(t('toasts.saveError'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{budget ? t('finance.editBudget') : t('finance.addBudget')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <FormGrid>
            <Field label={t('finance.category')}>
              <Select value={categoryId} disabled={budget !== null} onChange={(e) => setCategoryId(e.target.value)}>
                {selectable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('finance.monthlyLimit')}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                autoFocus
              />
            </Field>
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
