import { expect, test } from '@playwright/test'
import { login } from './utils'

test('desktop panes collapse and reopen from their controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)

  const rail = page.getByRole('navigation', { name: 'Main navigation' })
  const explorer = page.getByRole('complementary', { name: 'Explore' })
  const dayView = page.getByRole('complementary', { name: 'Day view' })

  await expect(explorer).toBeVisible()
  await rail.getByRole('button', { name: 'Finances' }).click()
  await expect(explorer).toHaveCount(0)
  await rail.getByRole('button', { name: 'Finances' }).click()
  await expect(explorer).toBeVisible()

  await dayView.getByRole('button', { name: 'Close day view' }).click()
  await expect(dayView).toHaveCount(0)
  await page.getByRole('button', { name: 'Open day view' }).click()
  await expect(dayView).toBeVisible()

  await rail.getByRole('button', { name: 'Finances' }).click()
  await rail.getByRole('button', { name: 'Calendar' }).click()
  await expect(explorer).toBeVisible()
  await expect(page).toHaveURL(/\/calendar/)
})
