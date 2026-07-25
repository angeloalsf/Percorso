import { expect, test } from '@playwright/test'
import { login } from './utils'

test('creates a new bank account', async ({ page }) => {
  await login(page)
  await page.getByRole('tab', { name: 'Bank accounts' }).click()

  const name = `E2E Test Account ${Date.now()}`
  await page.getByRole('button', { name: 'New account' }).click()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByLabel('Initial balance').fill('100')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Added', { exact: true })).toBeVisible()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
})
