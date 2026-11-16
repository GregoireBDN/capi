import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ChangePasswordCard } from '#/components/profile/ChangePasswordCard'
import { Route as ResetPasswordRoute } from '#/routes/reset-password'
import { ForgotForm } from './ForgotForm'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'

/**
 * Password forms are server-rendered: before hydration, Enter or the submit
 * button submits them natively, which for a form without `method` is a GET
 * that puts every field (the password too) in the URL (#203). They must be
 * POST forms, and their submit button stays disabled until hydration.
 */

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  createFileRoute: () => (options: { component: () => ReactElement }) => ({
    options,
    useSearch: () => ({ token: 'synthetic-token' }),
  }),
}))
vi.mock('#/lib/auth-context', () => ({
  useAuth: () => ({ refresh: vi.fn() }),
}))
vi.mock('#/api', () => ({
  authControllerLogin: vi.fn(),
  authControllerRegister: vi.fn(),
  authControllerForgotPassword: vi.fn(),
  authControllerResetPassword: vi.fn(),
  authControllerChangePassword: vi.fn(),
}))

// Radix Checkbox measures itself; jsdom has no ResizeObserver.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const ResetPasswordPage = (
  ResetPasswordRoute as unknown as {
    options: { component: () => ReactElement }
  }
).options.component

function withProviders(element: ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {element}
    </QueryClientProvider>
  )
}

const forms: [string, () => ReactElement, string][] = [
  [
    'sign-in',
    () => <LoginForm onSwitchToForgot={() => undefined} />,
    'Se connecter',
  ],
  ['sign-up', () => <RegisterForm />, 'Créer un compte'],
  ['forgotten password', () => <ForgotForm />, 'Envoyer le lien'],
  [
    'password reset',
    () => <ResetPasswordPage />,
    'Réinitialiser le mot de passe',
  ],
  [
    'password change',
    () => <ChangePasswordCard email="owner@example.test" />,
    'Changer le mot de passe',
  ],
]

describe.each(forms)('%s form (#203)', (_name, Form, submitLabel) => {
  it('is server-rendered as a POST form with its submit button disabled', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(withProviders(<Form />))

    const form = container.querySelector('form')
    expect(form?.getAttribute('method')).toBe('post')
    expect(form?.getAttribute('action')).toBeNull()
    const submit = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )
    expect(submit?.textContent).toContain(submitLabel)
    expect(submit?.disabled).toBe(true)
  })

  it('enables its submit button once hydrated', async () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(withProviders(<Form />))
    document.body.appendChild(container)

    await act(async () => {
      render(withProviders(<Form />), { container, hydrate: true })
    })

    expect(screen.getByRole('button', { name: submitLabel })).toBeEnabled()
    container.remove()
  })
})
