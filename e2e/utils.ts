import { expect, type Page } from '@playwright/test'

// Seeded by supabase/seed/test-data.sql — local/test only, not a real secret.
export const TEST_EMAIL = 'test@percorso.local'
export const TEST_PASSWORD = 'test-percorso-123'

export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(TEST_EMAIL)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/finances/)
}

/** Strips an Intl.NumberFormat currency string (e.g. "$1,234.56") down to a number. */
export function parseMoney(text: string): number {
  return parseFloat(text.replace(/[^0-9.-]/g, ''))
}
