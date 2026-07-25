import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { rowToCategory } from './rows'
import { patch, state } from './store'
import type { Category, DeleteResult, SaveResult } from './types'

export type CategoryInput = Omit<Category, 'id'>

export async function addCategory(input: CategoryInput): Promise<SaveResult> {
  const category: Category = { ...input, id: newId() }
  const { error } = await supabase
    .from('categories')
    .insert({ id: category.id, name: category.name, type: category.type, color: category.color })
  if (error) return 'error'
  patch({ categories: [...state().categories, category] })
  return 'ok'
}

export async function updateCategory(id: string, input: CategoryInput): Promise<SaveResult> {
  const { error } = await supabase
    .from('categories')
    .update({ name: input.name, type: input.type, color: input.color })
    .eq('id', id)
  if (error) return 'error'
  patch({ categories: state().categories.map((c) => (c.id === id ? { ...c, ...input } : c)) })
  return 'ok'
}

/** `in-use` when transactions or budgets still use the category. */
export async function deleteCategory(id: string): Promise<DeleteResult> {
  if (state().transactions.some((tx) => tx.categoryId === id) || state().budgets.some((b) => b.categoryId === id))
    return 'in-use'
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return error.code === '23503' ? 'in-use' : 'error'
  patch({ categories: state().categories.filter((c) => c.id !== id) })
  return 'ok'
}

/** Seed a starter set of categories, named in the caller's active language. */
export async function seedCategories(
  expenseNames: string[],
  incomeNames: string[],
  colors: string[]
): Promise<SaveResult> {
  const rows = [
    ...expenseNames.map((name, i) => ({
      id: newId(),
      name,
      type: 'expense' as const,
      color: colors[i % colors.length]
    })),
    ...incomeNames.map((name, i) => ({
      id: newId(),
      name,
      type: 'income' as const,
      color: colors[(i + 3) % colors.length]
    }))
  ]
  const { error } = await supabase.from('categories').insert(rows)
  if (error) return 'error'
  patch({ categories: [...state().categories, ...rows.map((r) => rowToCategory({ ...r, id: r.id }))] })
  return 'ok'
}
