import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, CreditCard as CreditCardIcon, Pencil, Plus, SearchX, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, FormGrid } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ColorDot, List, ListRow } from '@/components/ui/list'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { useLang, useT } from '@/i18n'
import { monthKey, todayISO } from '@/lib/dates'
import { formatCurrency, formatDate, formatMonthLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useProfile } from '@/state/profile'
import {
  addTransaction,
  deleteTransaction,
  updateTransaction,
  useFinanceStore,
  type Transaction,
  type TransactionInput,
  type TransactionType
} from '../store'

export function Transactions() {
  const t = useT()
  const lang = useLang()
  const { accounts, categories, transactions, creditCards, pendingTxFilter, setPendingTxFilter } = useFinanceStore()
  const currency = useProfile((s) => s.currency)
  const money = (v: number): string => formatCurrency(v, currency, lang)

  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const [filterMonth, setFilterMonth] = useState<string>('all')
  const [filterAccount, setFilterAccount] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Apply a drill-down handed over from a dashboard chart click, then clear it.
  // TODO: derive these filters from `pendingTxFilter` during render instead
  // of syncing via effect (react-hooks/set-state-in-effect) — deferred, needs
  // its own reviewed change since it touches the drill-down flow's behavior.
  useEffect(() => {
    if (!pendingTxFilter) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilterMonth(pendingTxFilter.month)
    setFilterCategory(pendingTxFilter.categoryId === '' ? 'uncategorized' : pendingTxFilter.categoryId)
    setFilterAccount('all')
    setFilterType('all')
    setSearch('')
    setPendingTxFilter(null)
  }, [pendingTxFilter, setPendingTxFilter])

  const months = useMemo(() => {
    const set = new Set(transactions.map((tx) => monthKey(tx.date)))
    return [...set].sort().reverse()
  }, [transactions])

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const cardById = useMemo(() => new Map(creditCards.map((c) => [c.id, c])), [creditCards])
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...transactions]
      .reverse()
      .filter((tx) => filterMonth === 'all' || monthKey(tx.date) === filterMonth)
      .filter((tx) => filterAccount === 'all' || tx.accountId === filterAccount || tx.toAccountId === filterAccount)
      .filter((tx) => filterType === 'all' || tx.type === filterType)
      .filter((tx) => {
        if (filterCategory === 'all') return true
        if (filterCategory === 'uncategorized') return !tx.categoryId
        return tx.categoryId === filterCategory
      })
      .filter((tx) => {
        if (!query) return true
        const category = tx.categoryId ? (categoryById.get(tx.categoryId)?.name ?? '') : ''
        return tx.note.toLowerCase().includes(query) || category.toLowerCase().includes(query)
      })
  }, [transactions, filterMonth, filterAccount, filterType, filterCategory, search, categoryById])

  const groups = useMemo(() => {
    const byDate = new Map<string, Transaction[]>()
    for (const tx of filtered) {
      const list = byDate.get(tx.date) ?? []
      list.push(tx)
      byDate.set(tx.date, list)
    }
    return [...byDate.entries()]
  }, [filtered])

  const confirmDelete = async (tx: Transaction): Promise<void> => {
    const result = await deleteTransaction(tx.id)
    setDeleting(null)
    if (result === 'ok') toast.success(t('toasts.deleted'))
    else toast.error(t('toasts.saveError'))
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t('finance.tabTransactions')}</h3>
        <Button
          size="sm"
          onClick={() => setEditing('new')}
          disabled={accounts.length === 0 && creditCards.length === 0}
        >
          <Plus />
          {t('finance.addTransaction')}
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
          <option value="all">{t('finance.allMonths')}</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonthLong(m, lang)}
            </option>
          ))}
        </Select>
        <Select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
          <option value="all">{t('finance.allAccounts')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">{t('finance.allTypes')}</option>
          <option value="expense">{t('finance.expense')}</option>
          <option value="income">{t('finance.income')}</option>
          <option value="transfer">{t('finance.transfer')}</option>
        </Select>
        <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="all">{t('finance.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="uncategorized">{t('finance.uncategorized')}</option>
        </Select>
        <Input value={search} placeholder={t('common.search')} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {accounts.length === 0 && creditCards.length === 0 ? (
        <EmptyState icon={Wallet} title={t('finance.needAccountTitle')} hint={t('finance.needAccountHint')} />
      ) : groups.length === 0 ? (
        <EmptyState icon={SearchX} title={t('finance.noTransactionsTitle')} hint={t('finance.noTransactionsHint')} />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([date, dayTxs]) => (
            <div key={date}>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground first-letter:uppercase">
                {formatDate(date, lang, 'weekday')}
              </div>
              <List>
                {dayTxs.map((tx) => {
                  const category = tx.categoryId ? categoryById.get(tx.categoryId) : undefined
                  const account = tx.accountId ? accountById.get(tx.accountId) : undefined
                  const card = tx.cardId ? cardById.get(tx.cardId) : undefined
                  const toAccount = tx.toAccountId ? accountById.get(tx.toAccountId) : undefined
                  const sourceName = account?.name ?? card?.name ?? '—'
                  return (
                    <ListRow key={tx.id}>
                      <ColorDot
                        color={
                          tx.type === 'transfer' ? 'var(--muted-foreground)' : (category?.color ?? 'var(--border)')
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium">
                            {tx.type === 'transfer'
                              ? `${account?.name ?? '—'} → ${toAccount?.name ?? '—'}`
                              : tx.note || category?.name || t('finance.uncategorized')}
                          </span>
                          {tx.type !== 'transfer' && category && <Badge>{category.name}</Badge>}
                          {tx.type === 'transfer' && (
                            <Badge>
                              <ArrowLeftRight />
                              {t('finance.transfer')}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
                            {card && <CreditCardIcon className="size-3 shrink-0" />}
                            {sourceName}
                            {tx.note && tx.type !== 'transfer' && category ? ` · ${tx.note}` : ''}
                          </span>
                          <span
                            className={cn(
                              'tabular ml-auto shrink-0 text-sm font-semibold',
                              tx.type === 'income' && 'text-success',
                              tx.type === 'expense' && 'text-destructive',
                              tx.type === 'transfer' && 'text-muted-foreground'
                            )}
                          >
                            {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
                            {money(tx.amount)}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('common.edit')}
                          onClick={() => setEditing(tx)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          aria-label={t('common.delete')}
                          onClick={() => setDeleting(tx)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </ListRow>
                  )
                })}
              </List>
            </div>
          ))}
        </div>
      )}

      {editing && <TransactionForm transaction={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t('common.deleteTitle')}
          message={t('finance.deleteTransactionConfirm')}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </>
  )
}

function TransactionForm({ transaction, onClose }: { transaction: Transaction | null; onClose: () => void }) {
  const t = useT()
  const { accounts, categories, creditCards } = useFinanceStore()
  const activeAccounts = accounts.filter((a) => !a.archived || a.id === transaction?.accountId)
  const activeCards = creditCards.filter((c) => !c.archived || c.id === transaction?.cardId)

  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense')
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '')
  const [date, setDate] = useState(transaction?.date ?? todayISO())
  const [accountId, setAccountId] = useState(transaction?.accountId ?? activeAccounts[0]?.id ?? '')
  // Expense source, "acc:<id>" or "card:<id>" — expenses can be paid from an account OR a card.
  const [paidWith, setPaidWith] = useState<string>(
    transaction?.cardId
      ? `card:${transaction.cardId}`
      : transaction?.accountId
        ? `acc:${transaction.accountId}`
        : activeAccounts[0]
          ? `acc:${activeAccounts[0].id}`
          : activeCards[0]
            ? `card:${activeCards[0].id}`
            : ''
  )
  const [toAccountId, setToAccountId] = useState(transaction?.toAccountId ?? '')
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')
  const [isRecurring, setIsRecurring] = useState(transaction?.isRecurring ?? false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const typeCategories = categories.filter((c) => c.type === type)

  const submit = async (): Promise<void> => {
    const parsedAmount = Number(amount)
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(t('finance.amountInvalid'))
      return
    }
    // Resolve the source: expenses use paidWith (account or card); income/transfer use accountId.
    let srcAccountId: string | undefined
    let srcCardId: string | undefined
    if (type === 'expense') {
      if (paidWith.startsWith('card:')) srcCardId = paidWith.slice(5)
      else if (paidWith.startsWith('acc:')) srcAccountId = paidWith.slice(4)
    } else {
      srcAccountId = accountId
    }
    if (!srcAccountId && !srcCardId) {
      setError(t('finance.accountRequired'))
      return
    }
    if (type === 'transfer' && (!toAccountId || toAccountId === srcAccountId)) {
      setError(t('finance.transferAccountsInvalid'))
      return
    }
    const input: TransactionInput = {
      date,
      type,
      amount: parsedAmount,
      ...(srcAccountId ? { accountId: srcAccountId } : {}),
      ...(srcCardId ? { cardId: srcCardId } : {}),
      ...(type === 'transfer' ? { toAccountId } : {}),
      ...(type !== 'transfer' && categoryId ? { categoryId } : {}),
      note: note.trim(),
      isRecurring: type === 'transfer' ? false : isRecurring
    }
    setSubmitting(true)
    const result = transaction ? await updateTransaction(transaction.id, input) : await addTransaction(input)
    setSubmitting(false)
    if (result === 'ok') {
      toast.success(t(transaction ? 'toasts.updated' : 'toasts.added'))
      onClose()
    } else {
      toast.error(t('toasts.saveError'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{transaction ? t('finance.editTransaction') : t('finance.addTransaction')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Segmented<TransactionType>
            className="mb-4"
            value={type}
            onChange={(next) => {
              setType(next)
              setCategoryId('')
            }}
            options={[
              { value: 'expense', label: t('finance.expense') },
              { value: 'income', label: t('finance.income') },
              { value: 'transfer', label: t('finance.transfer') }
            ]}
          />
          <FormGrid>
            <Field label={t('finance.amount')}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={amount}
                placeholder="0.00"
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label={t('common.date')}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {type === 'expense' ? (
              <Field label={t('finance.paidWith')}>
                <Select value={paidWith} onChange={(e) => setPaidWith(e.target.value)}>
                  {activeAccounts.length > 0 && (
                    <optgroup label={t('finance.groupAccounts')}>
                      {activeAccounts.map((a) => (
                        <option key={a.id} value={`acc:${a.id}`}>
                          {a.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {activeCards.length > 0 && (
                    <optgroup label={t('finance.groupCards')}>
                      {activeCards.map((c) => (
                        <option key={c.id} value={`card:${c.id}`}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </Field>
            ) : (
              <Field label={type === 'transfer' ? t('finance.fromAccount') : t('finance.account')}>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {type === 'transfer' ? (
              <Field label={t('finance.toAccount')}>
                <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  <option value="">—</option>
                  {activeAccounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : (
              <Field label={t('finance.category')}>
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">{t('finance.uncategorized')}</option>
                  {typeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={t('finance.note')} span2>
              <Input
                value={note}
                placeholder={t('finance.notePlaceholder')}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            {type !== 'transfer' && (
              <label className="flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="text-sm">{t('finance.recurringFlag')}</span>
              </label>
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
