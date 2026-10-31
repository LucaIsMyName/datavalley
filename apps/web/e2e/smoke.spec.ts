import { expect, test } from '@playwright/test'

test('edits a table and hides it from a second user', async ({ page, browser }) => {
  test.setTimeout(90_000)
  await page.goto('/login')
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('playwright-admin-password')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByLabel('Current password').fill('playwright-admin-password')
  await page.getByLabel('New password').fill('playwright-admin-password-2')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.getByRole('link', { name: 'Media' }).click()
  await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible()
  const uploaded = page.waitForResponse((response) => response.url().includes('/api/v1/media') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Upload' }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex'),
  })
  await uploaded
  await expect(page.getByText('logo.png')).toBeVisible()
  await page.getByRole('link', { name: 'Projects' }).click()
  await page.getByPlaceholder('Name').fill('Playwright CRM')
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByRole('link', { name: 'Playwright CRM' }).click()
  await expect(page.getByRole('heading', { name: 'Playwright CRM' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add to favorites' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Members' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Info' })).toBeVisible()
  await expect(page.getByLabel('Table name')).toHaveValue('People')
  await page.getByRole('button', { name: 'Edit Name' }).click()
  await page.getByLabel('Edit Name').fill('Ada Lovelace')
  await page.keyboard.press('Enter')
  await page.reload()
  await expect(page.getByText('Ada Lovelace')).toBeVisible()
  const exported = page.waitForResponse((response) => response.url().includes('/export') && response.request().method() === 'POST')
  await page.getByLabel('Table name').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Export' }).click()
  const exportBody = await (await exported).json()
  expect(exportBody.csv).toContain('Ada Lovelace')
  await page.locator('input[aria-label="Import"]').setInputFiles({
    name: 'contacts.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name\nGrace Hopper\n'),
  })
  await expect(page.getByText('Grace Hopper')).toBeVisible()

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'Users' }).click()
  await page.getByPlaceholder('Username').fill('outsider')
  await page.getByPlaceholder('Email').fill('outsider@example.com')
  await page.getByPlaceholder('Password').fill('outsider-password-ok')
  await page.getByRole('button', { name: 'Create' }).click()

  const other = await browser.newPage()
  await other.goto('/login')
  await other.getByLabel('Username').fill('outsider')
  await other.getByLabel('Password').fill('outsider-password-ok')
  await other.getByRole('button', { name: 'Log in' }).click()
  await other.getByLabel('Current password').fill('outsider-password-ok')
  await other.getByLabel('New password').fill('outsider-password-ok-2')
  await other.getByRole('button', { name: 'Save' }).click()
  await expect(other.getByRole('heading', { name: 'Projects', level: 2 })).toBeVisible()
  await expect(other.getByRole('link', { name: 'Playwright CRM' })).toHaveCount(0)
})
