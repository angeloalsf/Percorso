import { expect, test } from '@playwright/test'
import { login } from './utils'

test('signs in as the seeded test user and lands on the overview', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('heading', { name: /Your overview/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Monthly summary' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Finances' }).click()
  await expect(
    page.getByRole('navigation', { name: 'Finances' }).getByRole('button', { name: 'Dashboard' })
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('Net worth', { exact: true })).toBeVisible()
})
