import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ColorSwatches, PALETTE } from '@/components/ui/color-swatches'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, FormGrid } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { DrillRow, List } from '@/components/ui/list'
import { Select } from '@/components/ui/select'
import { useLang, useT, type TKey } from '@/i18n'
import { formatCurrency } from '@/lib/format'
import { MAX_AMOUNT, parseAmount } from '@/lib/validation'
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
  investment: 'finance.accountInvestment'
}

export function Accounts() {
  const t = useT()
  const lang = useLang()
  const navigate = useNavigate()
  const { accounts, transactions, creditCards, loans, consortiums } = useFinanceStore()
  const currency = useProfile((s) => s.currency)
  const money = (v: number): string => formatCurrency(v, currency, lang)

  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)

  const balances = useMemo(
    () => new Map(accounts.map((a) => [a.id, accountBalance(a, transactions)])),
    [accounts, transactions]
  )

  /** How many cards / loans / consórcios hang off each account, for the row hint. */
  const productCount = useMemo(() => {
    const counts = new Map<string, number>()
    const bump = (id?: string): void => {
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    creditCards.forEach((c) => bump(c.issuingAccountId))
    loans.forEach((l) => bump(l.accountId))
    consortiums.forEach((c) => bump(c.accountId))
    return counts
  }, [creditCards, loans, consortiums])

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
            const count = productCount.get(account.id) ?? 0
            return (
              <DrillRow
                key={account.id}
                color={account.color}
                name={account.name}
                badge={t(TYPE_KEYS[account.type])}
                archived={account.archived}
                archivedLabel={t('finance.archived')}
                primary={money(balance)}
                primaryClassName={balance < 0 ? 'text-destructive' : undefined}
                trailingBadge={count > 0 ? <Badge>{count}</Badge> : undefined}
                onClick={() => void navigate(`/finances/accounts/${account.id}`)}
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={account.archived ? t('finance.unarchive') : t('finance.archive')}
                      onClick={() => void setAccountArchived(account.id, !account.archived)}
                    >
                      {account.archived ? <ArchiveRestore /> : <Archive />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('common.edit')}
                      onClick={() => setEditing(account)}
                    >
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
                  </>
                }
              />
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
  const [nameError, setNameError] = useState<string | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (): Promise<void> => {
    setNameError(null)
    setBalanceError(null)

    if (!name.trim()) {
      setNameError(t('errors.nameRequired'))
      return
    }
    // Unlike most amount fields, a starting balance can legitimately be negative
    // (tracking began mid-overdraft), so only format/magnitude are checked here.
    const parsedBalance = parseAmount(initialBalance)
    if (parsedBalance === null) {
      setBalanceError(t('finance.amountInvalid'))
      return
    }
    if (Math.abs(parsedBalance) > MAX_AMOUNT) {
      setBalanceError(t('finance.amountTooLarge'))
      return
    }
    const input: AccountInput = {
      name: name.trim(),
      type,
      initialBalance: parsedBalance,
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
            <Field label={t('common.name')} error={nameError ?? undefined}>
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
            <Field label={t('finance.initialBalance')} error={balanceError ?? undefined}>
              <Input
                type="number"
                inputMode="decimal"
                min={-MAX_AMOUNT}
                max={MAX_AMOUNT}
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
