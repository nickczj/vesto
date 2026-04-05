import { expect, test } from '@playwright/test'

test('renders balance sheet shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Vesto v2 Balance Sheet' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Toggle Theme' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export Excel' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Asset' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Liability' })).toBeVisible()
})
