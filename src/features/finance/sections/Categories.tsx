import { useState, type ReactNode } from 'react'
import { Pencil, Plus, Tag, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { ColorSwatches, PALETTE } from '@/components/ui/color-swatches'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, FormGrid } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ColorDot, List, ListRow } from '@/components/ui/list'
import { Select } from '@/components/ui/select'
import { useT } from '@/i18n'
import {
  addCategory,
  deleteCategory,
  seedCategories,
  updateCategory,
  useFinanceStore,
  type Category,
  type CategoryInput,
  type CategoryType
} from '../store'

export function Categories() {
  const t = useT()
  const categories = useFinanceStore((s) => s.categories)
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  const seedDefaults = async (): Promise<void> => {
    const result = await seedCategories(
      [
        t('finance.seedGroceries'),
        t('finance.seedDining'),
        t('finance.seedTransport'),
        t('finance.seedHousing'),
        t('finance.seedUtilities'),
        t('finance.seedHealth'),
        t('finance.seedLeisure'),
        t('finance.seedShopping'),
        t('finance.seedSubscriptions')
      ],
      [t('finance.seedSalary'), t('finance.seedFreelance'), t('finance.seedInvestments'), t('finance.seedGifts')],
      PALETTE
    )
    if (result === 'ok') toast.success(t('finance.defaultsAdded'))
    else toast.error(t('toasts.saveError'))
  }

  const confirmDelete = async (category: Category): Promise<void> => {
    const result = await deleteCategory(category.id)
    setDeleting(null)
    if (result === 'ok') toast.success(t('toasts.deleted'))
    else if (result === 'in-use') toast.error(t('finance.categoryInUse'))
    else toast.error(t('toasts.saveError'))
  }

  const renderGroup = (type: CategoryType): ReactNode => {
    const group = categories.filter((c) => c.type === type)
    return (
      <Card>
        <CardTitle>{type === 'expense' ? t('finance.expenseCategories') : t('finance.incomeCategories')}</CardTitle>
        {group.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('finance.noCategoriesInGroup')}</p>
        ) : (
          <List>
            {group.map((category) => (
              <ListRow key={category.id} className="py-2">
                <ColorDot color={category.color} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
                <div className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('common.edit')}
                    onClick={() => setEditing(category)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => setDeleting(category)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </ListRow>
            ))}
          </List>
        )}
      </Card>
    )
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t('finance.tabCategories')}</h3>
        <div className="flex gap-2">
          {categories.length === 0 && (
            <Button size="sm" variant="secondary" onClick={() => void seedDefaults()}>
              <Zap />
              {t('finance.addDefaults')}
            </Button>
          )}
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus />
            {t('finance.addCategory')}
          </Button>
        </div>
      </div>

      {categories.length === 0 ? (
        <EmptyState icon={Tag} title={t('finance.noCategoriesTitle')} hint={t('finance.noCategoriesHint')} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {renderGroup('expense')}
          {renderGroup('income')}
        </div>
      )}

      {editing && <CategoryForm category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t('common.deleteTitle')}
          message={t('finance.deleteCategoryConfirm', { name: deleting.name })}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </>
  )
}

function CategoryForm({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const t = useT()
  const [name, setName] = useState(category?.name ?? '')
  const [type, setType] = useState<CategoryType>(category?.type ?? 'expense')
  const [color, setColor] = useState(category?.color ?? PALETTE[6])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      setError(t('errors.nameRequired'))
      return
    }
    const input: CategoryInput = { name: name.trim(), type, color }
    setSubmitting(true)
    const result = category ? await updateCategory(category.id, input) : await addCategory(input)
    setSubmitting(false)
    if (result === 'ok') {
      toast.success(t(category ? 'toasts.updated' : 'toasts.added'))
      onClose()
    } else {
      toast.error(t('toasts.saveError'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{category ? t('finance.editCategory') : t('finance.addCategory')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <FormGrid>
            <Field label={t('common.name')} error={error ?? undefined}>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label={t('common.type')}>
              <Select
                value={type}
                disabled={category !== null}
                onChange={(e) => setType(e.target.value as CategoryType)}
              >
                <option value="expense">{t('finance.expense')}</option>
                <option value="income">{t('finance.income')}</option>
              </Select>
            </Field>
            <Field label={t('common.color')} span2>
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
