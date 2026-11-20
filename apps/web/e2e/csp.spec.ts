import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * The Content-Security-Policy (#174, `src/lib/security-headers.ts`) must not
 * break the app: pages load, hydrate and navigate with no violation.
 *
 * Violations are collected by a listener installed before any page script
 * (init scripts are not subject to the page's CSP). The signed-in part needs
 * an existing owner on the stack under test: set `E2E_EMAIL` and
 * `E2E_PASSWORD` (a throwaway database, never real data), else it is skipped.
 */
declare global {
  interface Window {
    __cspViolations: string[]
  }
}

async function collectViolations(page: Page) {
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(
        `${event.effectiveDirective} ${event.blockedURI} ${event.sourceFile}`,
      )
    })
  })
}

const violations = (page: Page) => page.evaluate(() => window.__cspViolations)

test('pages are sent with a CSP, frame protection and isolation headers', async ({
  page,
}) => {
  await collectViolations(page)
  const response = await page.goto('/auth')
  const headers = response?.headers() ?? {}

  const policy = headers['content-security-policy'] ?? ''
  expect(policy).toContain("frame-ancestors 'none'")
  expect(policy).toContain("object-src 'none'")
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/)
  expect(headers['x-frame-options']).toBe('DENY')

  // Cross-origin isolation and unused features denied, passkeys kept (#204).
  expect(headers['cross-origin-opener-policy']).toBe('same-origin')
  expect(headers['cross-origin-resource-policy']).toBe('same-origin')
  expect(headers['permissions-policy']).toContain('camera=()')
  expect(headers['permissions-policy']).toContain(
    'publickey-credentials-get=(self)',
  )

  // TanStack's inline scripts carry the header's nonce, read back on the client.
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1]
  await expect(page.locator('meta[property="csp-nonce"]')).toHaveAttribute(
    'content',
    nonce ?? 'missing',
  )

  // Hydrated: the client-side form reacts.
  await page.getByRole('button', { name: 'Mot de passe oublié ?' }).click()
  await expect(
    page.getByRole('button', { name: 'Envoyer le lien' }),
  ).toBeVisible()
  expect(await violations(page)).toEqual([])
})

test('signed-in pages load with no CSP violation', async ({ page }) => {
  const email = process.env['E2E_EMAIL']
  const password = process.env['E2E_PASSWORD']
  test.skip(!email || !password, 'E2E_EMAIL / E2E_PASSWORD not set')

  await collectViolations(page)
  await page.goto('/auth')
  await page.getByLabel('Email').fill(email ?? '')
  await page.getByLabel('Mot de passe', { exact: true }).fill(password ?? '')
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  // Without a passkey yet, the offer to add one comes first.
  const later = page.getByRole('button', { name: 'Plus tard' })
  const home = page.getByRole('link', { name: 'Tableau de bord' })
  await expect(later.or(home).first()).toBeVisible()
  if (await later.isVisible()) await later.click()
  await expect(page).toHaveURL(/\/dashboard/)

  for (const name of ['Dépenses', 'Budget', 'Comptes']) {
    await page.getByRole('link', { name, exact: true }).first().click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
  // Opérations, a sub-page of Dépenses, from its « ⋮ » (#393).
  await page
    .getByRole('link', { name: 'Dépenses', exact: true })
    .first()
    .click()
  await page.getByRole('button', { name: 'Actions de la page' }).click()
  await page.getByRole('menuitem', { name: 'Voir les opérations' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Opérations' }),
  ).toBeVisible()
  expect(await violations(page)).toEqual([])
})

test('the OAuth consent flow keeps its opener, static files stay same-origin', async ({
  request,
}) => {
  const consent = await request.get(
    `/auth?redirect=${encodeURIComponent('/oauth/authorize?client_id=c')}`,
  )
  expect(consent.headers()['cross-origin-opener-policy']).toBeUndefined()
  expect(consent.headers()['permissions-policy']).toContain('camera=()')

  for (const path of ['/manifest.json', '/offline.html']) {
    const response = await request.get(path)
    expect(response.headers()['cross-origin-resource-policy']).toBe(
      'same-origin',
    )
  }
})
