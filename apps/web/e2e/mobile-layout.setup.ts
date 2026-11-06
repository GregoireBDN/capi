import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { request } from '@playwright/test'
import type { FullConfig } from '@playwright/test'

/** Where the signed-in session and account ids are stored for the audit. */
export const AUDIT_STATE_DIR = path.join('test-results', '.mobile-layout')
export const AUDIT_STORAGE = path.join(AUDIT_STATE_DIR, 'storage.json')
export const AUDIT_ACCOUNTS = path.join(AUDIT_STATE_DIR, 'accounts.json')

/**
 * Signs in once for the whole audit (the login route is rate limited) and
 * records the account ids for the account detail pages.
 */
export default async function globalSetup(config: FullConfig) {
  const email = process.env['MOBILE_AUDIT_EMAIL']
  const password = process.env['MOBILE_AUDIT_PASSWORD']
  if (!email || !password) return
  const baseURL = config.projects[0]?.use.baseURL
  const api = await request.newContext({ baseURL })
  const login = await api.post('/api/auth/login', { data: { email, password } })
  if (!login.ok()) throw new Error(`Login failed: ${login.status()}`)
  const accounts = (await (await api.get('/api/accounts')).json()) as Array<{
    id: string
    type: string
  }>
  mkdirSync(AUDIT_STATE_DIR, { recursive: true })
  await api.storageState({ path: AUDIT_STORAGE })
  writeFileSync(AUDIT_ACCOUNTS, JSON.stringify(accounts))
  await api.dispose()
}
