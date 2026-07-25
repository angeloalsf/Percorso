import { expect, test } from '@playwright/test'
import { login } from './utils'

test('signs in as the seeded test user and lands on the dashboard', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('tab', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('Net worth', { exact: true })).toBeVisible()
})
