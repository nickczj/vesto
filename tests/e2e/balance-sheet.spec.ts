import { expect, test } from '@playwright/test'

test('renders balance sheet shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Vesto.*Balance sheet/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Net worth' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Theme' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'View' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add' })).toBeVisible()
})
