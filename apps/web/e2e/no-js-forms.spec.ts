import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Password forms submitted before hydration (#203). With JavaScript disabled
 * (standing for "not hydrated yet": slow network, iOS autofill then an
 * immediate tap), pressing Enter or the submit button must never put a field
 * in the URL: the forms are `method="post"` and their submit button stays
 * disabled until hydration (`lib/use-hydrated.ts`).
 *
 * Only synthetic values. The change-password part needs an existing owner on
 * the stack under test: set `E2E_EMAIL` and `E2E_PASSWORD` (a throwaway
 * database, never real data), else it is skipped.
 */
test.use({ javaScriptEnabled: false })

const SYNTHETIC_PASSWORD = 'synthetic-not-a-password'
const SYNTHETIC_EMAIL = 'nobody@audit.test'

async function fillAndSubmit(page: Page) {
  for (const field of await page.locator('input[type="email"]').all()) {
    if (await field.isEditable()) await field.fill(SYNTHETIC_EMAIL)
  }
  const passwords = page.locator('input[type="password"]')
  for (const field of await passwords.all())
    await field.fill(SYNTHETIC_PASSWORD)
  // Enter in a field (implicit submission), then the submit button itself.
  await passwords.last().press('Enter')
  await page
    .locator('form button[type="submit"]')
    .first()
    .click({ force: true, timeout: 2_000 })
    .catch(() => undefined)
  await page.waitForLoadState('load')
}

function expectCleanUrl(page: Page) {
  const url = new URL(page.url())
  expect(url.search).not.toContain('password')
  expect(url.search).not.toContain('email')
  expect(page.url()).not.toContain(encodeURIComponent(SYNTHETIC_EMAIL))
  expect(page.url()).not.toContain(SYNTHETIC_PASSWORD)
}

async function expectPostFormsWithDisabledSubmit(page: Page) {
  const forms = page.locator('form:has(input[type="password"])')
  await expect(forms.first()).toBeVisible()
  for (const form of await forms.all()) {
    await expect(form).toHaveAttribute('method', 'post')
    await expect(form.locator('button[type="submit"]')).toBeDisabled()
  }
}

test('sign-in form stays hidden until hydration, a POST form', async ({
  page,
}) => {
  // Face ID comes first (#543): the password form is rendered, hidden, and
  // only shown by a tap once hydrated, so nothing can be typed into it before.
  await page.goto('/auth')
  const form = page.locator('form:has(input[type="password"])')
  await expect(form).toHaveAttribute('method', 'post')
  await expect(form.locator('button[type="submit"]')).toBeDisabled()
  await expect(form).toBeHidden()
})

test('sign-up form keeps its fields out of the URL', async ({ page }) => {
  await page.goto('/auth?mode=register')
  test.skip(
    !(await page.getByLabel('Confirmer le mot de passe').isVisible()),
    'sign-up closed on this stack',
  )
  await expectPostFormsWithDisabledSubmit(page)
  await fillAndSubmit(page)
  expectCleanUrl(page)
})

test('password reset form keeps its fields out of the URL', async ({
  page,
}) => {
  await page.goto('/reset-password?token=synthetic-token')
  await expectPostFormsWithDisabledSubmit(page)
  await fillAndSubmit(page)
  expectCleanUrl(page)
  expect(new URL(page.url()).search).toBe('?token=synthetic-token')
})

test('a native POST to a page route is harmless', async ({ request }) => {
  for (const path of ['/auth', '/reset-password', '/settings/security']) {
    const response = await request.post(path, {
      form: { email: SYNTHETIC_EMAIL, password: SYNTHETIC_PASSWORD },
      maxRedirects: 0,
    })
    expect([200, 307, 405]).toContain(response.status())
    expect(await response.text()).not.toContain(SYNTHETIC_PASSWORD)
  }
})

test('change-password form keeps its fields out of the URL', async ({
  page,
}) => {
  const email = process.env['E2E_EMAIL']
  const password = process.env['E2E_PASSWORD']
  test.skip(!email || !password, 'E2E_EMAIL / E2E_PASSWORD not set')

  // Shares the page's cookie jar: the SSR guard sees the session.
  const login = await page.request.post('/api/auth/login', {
    data: { email, password },
  })
  expect(login.ok()).toBe(true)

  await page.goto('/settings/security')
  // Signed-in pages may stream their content in after the shell: without
  // JavaScript the form can then not be shown at all, so nothing can be
  // submitted. When it is server-rendered, it must be safe like the others.
  if ((await page.locator('input[type="password"]').count()) === 0) {
    test.info().annotations.push({
      type: 'note',
      description: 'change-password form not server-rendered',
    })
    return
  }
  await expect(
    page.getByRole('button', { name: 'Changer le mot de passe' }),
  ).toBeDisabled()
  await expectPostFormsWithDisabledSubmit(page)
  await fillAndSubmit(page)
  expectCleanUrl(page)
})
