import { expect, test } from '@playwright/test'
import { login, openFinanceSection, parseMoney } from './utils'

test('adding an expense reduces net worth by the transaction amount', async ({ page }) => {
  await login(page)

  const netWorth = () =>
    page
      .getByText('Net worth', { exact: true })
      .evaluate((el) => el.parentElement?.querySelector('.tabular')?.textContent ?? '')
      .then(parseMoney)

  const before = await netWorth()

  await openFinanceSection(page, 'Transactions')
  await page.getByRole('button', { name: 'Add transaction' }).click()

  // Defaults to type "expense", paid from the first bank account — a bank-paid
  // expense hits net worth immediately (unlike a card purchase, settled later).
  const amount = 42.5
  await page.getByLabel('Amount').fill(String(amount))
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Added', { exact: true })).toBeVisible()

  await openFinanceSection(page, 'Dashboard')
  await expect.poll(netWorth).toBeCloseTo(before - amount, 2)
})
