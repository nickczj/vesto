import { expect, test } from '@playwright/test'

test('renders balance sheet shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Vesto.*Balance sheet/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Net worth' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Theme' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'View' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'History series' }).getByRole('button', { name: 'Ex-CPF' })).toBeVisible()
})

test('opens the two-column add asset dialog', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('menuitem', { name: 'Add asset' }).click()

  await expect(page.getByRole('tab', { name: 'Investment' })).toBeVisible()
  await expect(page.getByLabel('Ticker')).toBeVisible()
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
