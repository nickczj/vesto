import { expect, test } from '@playwright/test'

test('renders balance sheet shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Vesto.*Balance sheet/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Net worth' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Theme' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'View' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add' })).toBeVisible()
  // The P&L and return columns are price measures, not SGD returns since
  // purchase; the labels are part of the contract (D-046).
  await expect(page.getByRole('button', { name: /Price gain\/loss \(SGD\)/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Price return/ })).toBeVisible()
  await expect(page.getByRole('group', { name: 'History series' }).getByRole('button', { name: 'Ex-CPF' })).toBeVisible()
})

test('opens the two-column add asset dialog', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('menuitem', { name: 'Add asset' }).click()

  await expect(page.getByRole('tab', { name: 'Investment' })).toBeVisible()
  await expect(page.getByLabel('Ticker')).toBeVisible()
  const exchange = page.getByLabel(/^Exchange/)
  await expect(exchange).toHaveAttribute('list', 'asset-market-options')
  await expect(page.locator('#asset-market-options option')).toHaveCount(7)
  await expect(page.locator('#asset-market-options option[value="SEHK"]')).toHaveText('HKEX')
  await expect(page.getByRole('button', { name: 'Add asset' })).toBeVisible()
})

test('closes the dialog on Escape and returns focus to the trigger', async ({ page }) => {
  await page.goto('/')
  const add = page.getByRole('button', { name: 'Add' })
  await add.click()
  await page.getByRole('menuitem', { name: 'Add asset' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByLabel('Ticker')).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(add).toBeFocused()
})

test('applies a stored dark preference on a cold load', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vesto:theme-mode', 'dark')
  })
  await page.goto('/')

  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe('rgb(15, 21, 27)')
})

test('hides every value and the history chart, and remembers the choice', async ({ page }) => {
  await page.goto('/')

  const hide = page.getByRole('button', { name: 'Hide values' })
  await expect(hide).toHaveAttribute('aria-pressed', 'false')

  await hide.click()

  await expect(page.getByRole('button', { name: 'Show values' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.networth-row')).toContainText('••••')
  await expect(page.locator('.history-card')).toContainText('History is hidden')
  await expect(page.locator('.history-chart')).toHaveCount(0)

  await page.reload()

  // The choice is per device and survives a reload, including the first paint
  // from the mirrored view-preferences cookie.
  await expect(page.getByRole('button', { name: 'Show values' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.networth-row')).toContainText('••••')

  await page.getByRole('button', { name: 'Show values' }).click()

  await expect(page.getByRole('button', { name: 'Hide values' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.networth-row')).not.toContainText('••••')
  await expect(page.locator('.history-card')).not.toContainText('History is hidden')
})
