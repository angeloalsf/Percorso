import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useT } from '@/i18n'
import { importTransactions, parseStatement, statementDuplicate, type StatementEntry } from '../store/import'
import { useFinanceStore } from '../store'

export function StatementImport({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { accounts, categories, transactions } = useFinanceStore()
  const active = accounts.filter((account) => !account.archived)
  const [accountId, setAccountId] = useState(active[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [entries, setEntries] = useState<StatementEntry[]>([])
  const [saving, setSaving] = useState(false)
  const ready = useMemo(() => {
    const seen = new Set<string>()
    return entries.filter((entry) => {
      const key = entry.reference
        ? `ref:${entry.reference}`
        : `${entry.date}|${entry.type}|${entry.amount}|${entry.note.toLowerCase()}`
      if (seen.has(key) || statementDuplicate(entry, accountId, transactions)) return false
      seen.add(key)
      return true
    })
  }, [entries, accountId, transactions])

  const read = async (file?: File): Promise<void> => {
    if (!file || file.size > 2_000_000) {
      toast.error(t('finance.importInvalid'))
      return
    }
    const parsed = parseStatement(await file.text())
    setEntries(parsed)
    if (!parsed.length) toast.error(t('finance.importInvalid'))
  }
  const save = async (): Promise<void> => {
    setSaving(true)
    const result = await importTransactions(accountId, ready, categoryId || undefined)
    setSaving(false)
    if (result === 'ok') {
      toast.success(t('toasts.added'))
      onClose()
    } else toast.error(t('toasts.saveError'))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('finance.importStatement')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <Field label={t('finance.account')}>
              <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                {active.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('finance.importFile')}>
              <Input
                type="file"
                accept=".csv,.ofx,.qfx,text/csv"
                onChange={(event) => void read(event.target.files?.[0])}
              />
            </Field>
            <Field label={t('finance.importCategory')}>
              <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">{t('finance.uncategorized')}</option>
                {categories
                  .filter((category) => category.type === 'expense')
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </Select>
            </Field>
            {entries.length > 0 && (
              <>
                <p className="text-sm">{t('finance.importPreview', { total: entries.length, new: ready.length })}</p>
                <div className="max-h-48 overflow-y-auto rounded-md border p-2 text-xs">
                  {entries.slice(0, 30).map((entry, i) => (
                    <div key={i} className="flex justify-between gap-2 py-1">
                      <span>
                        {entry.date} · {entry.note}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {entry.type === 'expense' ? '−' : '+'}
                        {entry.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!accountId || ready.length === 0 || saving} onClick={() => void save()}>
            {t('finance.importStatement')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
