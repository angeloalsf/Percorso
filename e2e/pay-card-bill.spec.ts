import { expect, test } from '@playwright/test'
import { login } from './utils'

test('pays the Nubank card invoice bill', async ({ page }) => {
  await login(page)
  await page.getByRole('tab', { name: 'Bills' }).click()

  // The card's invoice bill is auto-generated on load (store.ts syncCardBills)
  // and shares its name with the card ("Nubank", supabase/seed/test-data.sql).
  // Anchor on the "Edit" button (always present) rather than "Mark paid"
  // (disappears once paid) so the same locator keeps working after payment.
  const row = page
    .locator('div')
    .filter({ hasText: 'Nubank' })
    .filter({ has: page.getByRole('button', { name: 'Edit' }) })
    .last()

  await row.getByRole('button', { name: 'Mark paid' }).click()

  // Opens PayBillDialog — confirm with the default (first) account.
  await page.getByRole('dialog').getByRole('button', { name: 'Mark paid' }).click()
  await expect(page.getByText('Updated', { exact: true })).toBeVisible()

  await expect(row.getByText('Paid', { exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Mark paid' })).toHaveCount(0)
})
