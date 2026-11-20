import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const location = vi.hoisted(() => ({ pathname: '/settings' }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: object) => options,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: typeof location }) => unknown
  }) => select({ location }),
  Outlet: () => <h1>Page</h1>,
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => {
    const { params: _p, search: _s, ...rest } = props as Record<string, unknown>
    return (
      <a href={to} {...rest}>
        {children}
      </a>
    )
  },
}))

const { Route } = await import('#/routes/_app/_settings')
const Layout = (Route as unknown as { component: () => ReactNode }).component

describe('settings layout', () => {
  it('has no way back on the Réglages list', () => {
    location.pathname = '/settings'
    render(<Layout />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('goes back to Réglages from its screens, with the one back link (#324)', () => {
    location.pathname = '/settings/security'
    render(<Layout />)
    // Outside the shell's header: in the page (`PageBack`).
    expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute(
      'href',
      '/settings',
    )
  })
})
