import { expect, test } from '@playwright/test'
import { clearMailbox, waitForEmailLink } from './mailpit'

const API_URL = process.env['VITE_API_URL'] ?? 'http://localhost:4000'

/**
 * Happy-path auth journey against the real stack:
 *   register the owner account → receive verification email → verify → log in.
 *
 * Finances is single-user, so registration is only possible on an empty
 * database: the test skips itself once an account exists (reset the DB, e.g.
 * `docker compose down -v && docker compose up -d`, to run it again).
 *
 * Requires Postgres + Mailpit (`docker compose up -d`); the web/API dev servers
 * are started by playwright.config.ts.
 */
test('register, verify email, then log in', async ({ page, request }) => {
  const status = await request.get(`${API_URL}/api/auth/registration-status`)
  const { open } = (await status.json()) as { open: boolean }
  test.skip(!open, 'Registration is closed: an account already exists')

  await clearMailbox(request)

  const unique = `e2e${Date.now()}`
  const email = `${unique}@finances.test`
  const password = 'password123'
  const firstName = unique // user.name is `${firstName} Tester`, shown in the sidebar

  // 1. Register the owner account.
  await page.goto('/auth')
  await page.getByRole('button', { name: "S'inscrire" }).click()
  await page.getByLabel('Nom').fill(`${firstName} Tester`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByLabel('Confirmer le mot de passe').fill(password)
  await page.getByRole('button', { name: 'Créer un compte' }).click()

  // Registration logs the user in and lands on the verify-email page.
  await expect(page).toHaveURL(/\/verify-email/)

  // Registration is now closed for everyone else.
  const closed = await request.get(`${API_URL}/api/auth/registration-status`)
  expect(await closed.json()).toEqual({ open: false })

  // 2. Pull the verification link out of the email Mailpit captured.
  const verifyUrl = await waitForEmailLink(request, email, '/verify-email')
  await page.goto(verifyUrl)
  await expect(page.getByText('Email vérifié')).toBeVisible()

  // 3. Log out, then log back in with the same credentials. The sign-up link
  //    is gone now that the owner account exists.
  await page.context().clearCookies()
  await page.goto('/auth')
  await expect(page.getByRole('button', { name: "S'inscrire" })).toHaveCount(0)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  // Login lands on the dashboard; the sidebar shows who is signed in.
  await expect(page).toHaveURL('/dashboard')
  await expect(
    page.getByText(`${firstName} Tester`, { exact: true }),
  ).toBeVisible()
})
