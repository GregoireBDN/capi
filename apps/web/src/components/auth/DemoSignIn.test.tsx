import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoSignIn } from './DemoSignIn'
import { rememberSignedOut } from '#/lib/demo-sign-in'

const navigate = vi.fn()
const refresh = vi.fn()
const demoSignIn = vi.fn()

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('#/lib/auth-context', () => ({ useAuth: () => ({ refresh }) }))
vi.mock('#/api', () => ({
  authControllerDemoSignIn: (...args: unknown[]) => demoSignIn(...args),
}))

const ok = { data: { success: true }, response: { ok: true } }

describe('DemoSignIn (#608)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    demoSignIn.mockResolvedValue(ok)
  })

  it('signs the demo account in by itself, then opens the dashboard', async () => {
    render(<DemoSignIn />)

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' }),
    )
    expect(demoSignIn).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalled()
  })

  it('waits for a tap right after a sign-out', async () => {
    const user = userEvent.setup()
    rememberSignedOut()
    render(<DemoSignIn />)

    expect(demoSignIn).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Compte démo' }))
    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(sessionStorage.length).toBe(0)
  })

  it('says so when the API refuses, and stays on the page', async () => {
    demoSignIn.mockResolvedValue({ error: {}, response: { ok: false } })
    render(<DemoSignIn />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Connexion au compte démo impossible.',
    )
    expect(navigate).not.toHaveBeenCalled()
  })
})
