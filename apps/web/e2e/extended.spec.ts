import * as OTPAuth from 'otpauth'
import { expect, test } from '@playwright/test'

const API = 'http://127.0.0.1:3000/api/v1'

async function loginSession(request: import('@playwright/test').APIRequestContext, username: string, password: string) {
  const csrf = await request.get(`${API}/auth/csrf`)
  const token = (await csrf.json()).token as string
  const login = await request.post(`${API}/auth/login`, {
    headers: { 'csrf-token': token },
    data: { login: username, password },
  })
  expect(login.ok()).toBeTruthy()
  return token
}

async function authedHeaders(request: import('@playwright/test').APIRequestContext, csrf: string) {
  return { 'csrf-token': csrf }
}

function totpCode(secretBase32: string) {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secretBase32),
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
  }).generate()
}

test('rejects stale row versions with version_conflict', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('playwright-admin-password')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByLabel('Current password').fill('playwright-admin-password')
  await page.getByLabel('New password').fill('playwright-admin-password-2')
  await page.getByRole('button', { name: 'Save' }).click()

  const csrf = await loginSession(page.request, 'admin', 'playwright-admin-password-2')
  const headers = await authedHeaders(page.request, csrf)
  const project = await page.request.post(`${API}/projects`, { headers, data: { name: 'Conflict project' } })
  const projectId = (await project.json()).project.id as string
  const table = await page.request.post(`${API}/projects/${projectId}/tables`, { headers, data: { name: 'Items' } })
  const tableId = (await table.json()).table.id as string
  const column = await page.request.post(`${API}/tables/${tableId}/columns`, { headers, data: { name: 'Value', type: 'text' } })
  const columnId = (await column.json()).column.id as string
  const row = await page.request.post(`${API}/tables/${tableId}/rows`, { headers, data: { cells: { [columnId]: 'one' } } })
  const rowId = (await row.json()).row.id as string
  const version = (await row.json()).row.version as number

  const first = await page.request.patch(`${API}/rows/${rowId}`, {
    headers,
    data: { version, cells: { [columnId]: 'two' } },
  })
  expect(first.status()).toBe(200)

  const stale = await page.request.patch(`${API}/rows/${rowId}`, {
    headers,
    data: { version, cells: { [columnId]: 'three' } },
  })
  expect(stale.status()).toBe(409)
  expect((await stale.json()).error.code).toBe('version_conflict')
})

test('scopes API keys to their grants', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('playwright-admin-password')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByLabel('Current password').fill('playwright-admin-password')
  await page.getByLabel('New password').fill('playwright-admin-password-2')
  await page.getByRole('button', { name: 'Save' }).click()

  const csrf = await loginSession(page.request, 'admin', 'playwright-admin-password-2')
  const headers = await authedHeaders(page.request, csrf)
  const project = await page.request.post(`${API}/projects`, { headers, data: { name: 'Key scope' } })
  const projectId = (await project.json()).project.id as string

  const key = await page.request.post(`${API}/api-keys`, {
    headers,
    data: {
      name: 'read-only',
      scopes: [{ action: 'view', resourceType: 'project', resourceId: projectId }],
    },
  })
  expect(key.ok()).toBeTruthy()
  const secret = (await key.json()).apiKey.key as string

  const allowed = await page.request.get(`${API}/projects/${projectId}`, {
    headers: { authorization: `Bearer ${secret}` },
  })
  expect(allowed.ok()).toBeTruthy()

  const denied = await page.request.post(`${API}/projects`, {
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    data: { name: 'Should not create' },
  })
  expect(denied.status()).toBe(404)
})

test('requires totp after enrollment', async ({ page }) => {
  const adminPassword = 'playwright-admin-password-2'
  await page.goto('/login')
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('playwright-admin-password')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByLabel('Current password').fill('playwright-admin-password')
  await page.getByLabel('New password').fill(adminPassword)
  await page.getByRole('button', { name: 'Save' }).click()

  let csrf = await loginSession(page.request, 'admin', adminPassword)
  const created = await page.request.post(`${API}/users`, {
    headers: { 'csrf-token': csrf },
    data: {
      username: 'mfa-e2e',
      email: 'mfa-e2e@example.com',
      password: 'mfa-e2e-password-ok',
      role: 'user',
    },
  })
  expect(created.ok()).toBeTruthy()

  csrf = await loginSession(page.request, 'mfa-e2e', 'mfa-e2e-password-ok')
  const enrolled = await page.request.post(`${API}/totp/enroll`, { headers: { 'csrf-token': csrf } })
  const secret = (await enrolled.json()).secret as string
  const confirm = await page.request.post(`${API}/totp/confirm`, {
    headers: { 'csrf-token': csrf },
    data: { code: totpCode(secret) },
  })
  expect(confirm.ok()).toBeTruthy()
  await page.request.post(`${API}/auth/logout`, { headers: { 'csrf-token': csrf } })

  const freshCsrf = await page.request.get(`${API}/auth/csrf`)
  const freshToken = (await freshCsrf.json()).token as string
  const missingTotp = await page.request.post(`${API}/auth/login`, {
    headers: { 'csrf-token': freshToken },
    data: { login: 'mfa-e2e', password: 'mfa-e2e-password-ok' },
  })
  expect(missingTotp.status()).toBe(401)
  expect((await missingTotp.json()).error.code).toBe('totp_required')

  const csrfAgain = await page.request.get(`${API}/auth/csrf`)
  const token = (await csrfAgain.json()).token as string
  const ok = await page.request.post(`${API}/auth/login`, {
    headers: { 'csrf-token': token },
    data: { login: 'mfa-e2e', password: 'mfa-e2e-password-ok', totpCode: totpCode(secret) },
  })
  expect(ok.ok()).toBeTruthy()
})
