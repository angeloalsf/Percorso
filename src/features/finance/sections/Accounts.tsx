import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ColorSwatches, PALETTE } from '@/components/ui/color-swatches'
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
import { Select } from '@/components/ui/select'
import { useLang, useT, type TKey } from '@/i18n'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useProfile } from '@/state/profile'
import {
  accountBalance,
  addAccount,
  deleteAccount,
  setAccountArchived,
  updateAccount,
  useFinanceStore,
  type Account,
  type AccountInput,
  type AccountType
} from '../store'

const TYPE_KEYS: Record<AccountType, TKey> = {
  checking: 'finance.accountChecking',
  savings: 'finance.accountSavings',
  cash: 'finance.accountCash',
  investment: 'finance.accountInvestment',
  consorcio: 'finance.accountConsorcio'
}

export function Accounts() {
  const t = useT()
  const lang = useLang()
  const { accounts, transactions } = useFinanceStore()
  const currency = useProfile((s) => s.currency)
  const money = (v: number): string => formatCurrency(v, currency, lang)

  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)

  const balances = useMemo(
    () => new Map(accounts.map((a) => [a.id, accountBalance(a, transactions)])),
    [accounts, transactions]
  )

  const confirmDelete = async (account: Account): Promise<void> => {
    const result = await deleteAccount(account.id)
    setDeleting(null)
    if (result === 'ok') toast.success(t('toasts.deleted'))
    else if (result === 'in-use') toast.error(t('finance.accountInUse'))
    else toast.error(t('toasts.saveError'))
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t('finance.tabAccounts')}</h3>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus />
          {t('finance.addAccount')}
        </Button>
      </div>
      {accounts.length === 0 ? (
        <EmptyState icon={Wallet} title={t('finance.needAccountTitle')} hint={t('finance.needAccountHint')} />
      ) : (
        <List>
          {accounts.map((account) => {
            const balance = balances.get(account.id) ?? 0
            return (
              <ListRow key={account.id} className={cn(account.archived && 'opacity-55')}>
                <ColorDot color={account.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{account.name}</span>
                    <Badge>{t(TYPE_KEYS[account.type])}</Badge>
                    {account.archived && <Badge>{t('finance.archived')}</Badge>}
                  </div>
                  <div className={cn('tabular mt-0.5 text-sm font-semibold', balance < 0 && 'text-destructive')}>
                    {money(balance)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={account.archived ? t('finance.unarchive') : t('finance.archive')}
                    onClick={() => void setAccountArchived(account.id, !account.archived)}
                  >
                    {account.archived ? <ArchiveRestore /> : <Archive />}
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={t('common.edit')} onClick={() => setEditing(account)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => setDeleting(account)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </ListRow>
            )
          })}
        </List>
      )}

      {editing && <AccountForm account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t('common.deleteTitle')}
          message={t('finance.deleteAccountConfirm', { name: deleting.name })}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </>
  )
}

function AccountForm({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const t = useT()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking')
  const [initialBalance, setInitialBalance] = useState(account ? String(account.initialBalance) : '0')
  const [color, setColor] = useState(account?.color ?? PALETTE[2])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      setError(t('errors.nameRequired'))
      return
    }
    const balance = Number(initialBalance)
    const input: AccountInput = {
      name: name.trim(),
      type,
      initialBalance: Number.isNaN(balance) ? 0 : balance,
      color
    }
    setSubmitting(true)
    const result = account ? await updateAccount(account.id, input) : await addAccount(input)
    setSubmitting(false)
    if (result === 'ok') {
      toast.success(t(account ? 'toasts.updated' : 'toasts.added'))
      onClose()
    } else {
      toast.error(t('toasts.saveError'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{account ? t('finance.editAccount') : t('finance.addAccount')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <FormGrid>
            <Field label={t('common.name')} error={error ?? undefined}>
              <Input
                value={name}
                placeholder={t('finance.accountNamePlaceholder')}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label={t('common.type')}>
              <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                {(Object.keys(TYPE_KEYS) as AccountType[]).map((at) => (
                  <option key={at} value={at}>
                    {t(TYPE_KEYS[at])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('finance.initialBalance')}>
              <Input
                type="number"
                inputMode="decimal"
                step={0.01}
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
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
