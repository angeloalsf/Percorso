import { useState } from 'react'
import { Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, FormGrid } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { List, ListRow } from '@/components/ui/list'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { useLang, useT } from '@/i18n'
import { formatCurrency, formatDate } from '@/lib/format'
import { useProfile } from '@/state/profile'
import { addGoal, deleteGoal, goalProgress, updateGoal, useFinanceStore, type Goal, type GoalInput } from '../store'

export function Goals() {
  const t = useT()
  const lang = useLang()
  const { goals, accounts, transactions } = useFinanceStore()
  const currency = useProfile((s) => s.currency)
  const money = (v: number): string => formatCurrency(v, currency, lang)

  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Goal | null>(null)

  const confirmDelete = async (goal: Goal): Promise<void> => {
    const result = await deleteGoal(goal.id)
    setDeleting(null)
    if (result === 'ok') toast.success(t('toasts.deleted'))
    else toast.error(t('toasts.saveError'))
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t('finance.tabGoals')}</h3>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus />
          {t('finance.addGoal')}
        </Button>
      </div>
      {goals.length === 0 ? (
        <EmptyState icon={PiggyBank} title={t('finance.noGoalsTitle')} hint={t('finance.noGoalsHint')} />
      ) : (
        <List>
          {goals.map((goal) => {
            const progress = goalProgress(goal, accounts, transactions)
            const reached = progress >= goal.targetAmount
            const account = goal.accountId ? accounts.find((a) => a.id === goal.accountId) : undefined
            return (
              <ListRow key={goal.id} className="items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{goal.name}</span>
                    {reached && <Badge variant="success">{t('finance.goalReached')}</Badge>}
                    {account && <Badge>{account.name}</Badge>}
                  </div>
                  <div className="tabular mt-0.5 text-xs text-muted-foreground">
                    {money(progress)} / {money(goal.targetAmount)}
                    {goal.targetDate
                      ? ` · ${t('finance.goalTargetBy', { date: formatDate(goal.targetDate, lang, 'short') })}`
                      : ''}
                  </div>
                  <ProgressBar
                    className="mt-2 max-w-sm"
                    value={progress}
                    max={goal.targetAmount}
                    color="var(--primary)"
                  />
                </div>
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon" aria-label={t('common.edit')} onClick={() => setEditing(goal)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => setDeleting(goal)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </ListRow>
            )
          })}
        </List>
      )}

      {editing && <GoalForm goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t('common.deleteTitle')}
          message={t('finance.deleteGoalConfirm')}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </>
  )
}

type TrackMode = 'account' | 'manual'

function GoalForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const t = useT()
  const { accounts } = useFinanceStore()
  const activeAccounts = accounts.filter((a) => !a.archived || a.id === goal?.accountId)

  const [name, setName] = useState(goal?.name ?? '')
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.targetAmount) : '')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [mode, setMode] = useState<TrackMode>(goal?.accountId ? 'account' : 'manual')
  const [accountId, setAccountId] = useState(goal?.accountId ?? activeAccounts[0]?.id ?? '')
  const [savedAmount, setSavedAmount] = useState(goal ? String(goal.savedAmount) : '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canTrackAccount = activeAccounts.length > 0
  const effectiveMode: TrackMode = canTrackAccount ? mode : 'manual'

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      setError(t('errors.nameRequired'))
      return
    }
    const parsedTarget = Number(targetAmount)
    if (!targetAmount || Number.isNaN(parsedTarget) || parsedTarget <= 0) {
      setError(t('finance.amountInvalid'))
      return
    }
    const useAccount = effectiveMode === 'account'
    if (useAccount && !accountId) {
      setError(t('finance.accountRequired'))
      return
    }
    const input: GoalInput = {
      name: name.trim(),
      targetAmount: parsedTarget,
      ...(targetDate ? { targetDate } : {}),
      ...(useAccount ? { accountId } : {}),
      savedAmount: useAccount ? 0 : Math.max(0, Number(savedAmount) || 0)
    }
    setSubmitting(true)
    const result = goal ? await updateGoal(goal.id, input) : await addGoal(input)
    setSubmitting(false)
    if (result === 'ok') {
      toast.success(t(goal ? 'toasts.updated' : 'toasts.added'))
      onClose()
    } else {
      toast.error(t('toasts.saveError'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{goal ? t('finance.editGoal') : t('finance.addGoal')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <FormGrid>
            <Field label={t('finance.goalName')} span2>
              <Input
                value={name}
                placeholder={t('finance.goalNamePlaceholder')}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label={t('finance.targetAmount')}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </Field>
            <Field label={t('finance.targetDateOptional')}>
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </Field>
            {canTrackAccount && (
              <Field label={t('finance.goalTracking')} span2>
                <Segmented<TrackMode>
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'account', label: t('finance.account') },
                    { value: 'manual', label: t('finance.goalTrackManual') }
                  ]}
                />
              </Field>
            )}
            {effectiveMode === 'account' ? (
              <Field label={t('finance.account')} span2>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">{t('finance.goalAccountHint')}</p>
              </Field>
            ) : (
              <Field label={t('finance.savedAmount')} span2>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  value={savedAmount}
                  placeholder="0.00"
                  onChange={(e) => setSavedAmount(e.target.value)}
                />
              </Field>
            )}
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
