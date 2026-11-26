import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetReviewCount, setReviewCount } from '#/lib/review-count'
import { MovementsTabs } from './MovementsTabs'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string
    search?: Record<string, string>
    children: ReactNode
  }) => {
    const query = new URLSearchParams(search).toString()
    return (
      <a href={query ? `${to}?${query}` : to} {...props}>
        {children}
      </a>
    )
  },
}))

afterEach(() => resetReviewCount())

describe('MovementsTabs (#498)', () => {
  it('links the two tabs on the month shown, the current one marked', () => {
    setReviewCount(7)
    render(<MovementsTabs current="summary" month="2026-10" />)
    const tabs = within(screen.getByRole('navigation', { name: 'Mouvements' }))
    expect(tabs.getByRole('link', { name: 'Résumé' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    const operations = tabs.getByRole('link', {
      name: /^Opérations\s*, 7 opérations à revoir$/,
    })
    expect(operations).toHaveAttribute('href', '/transactions?month=2026-10')
    expect(operations).not.toHaveAttribute('aria-current')
  })

  it('carries no month from every date, and no count with none to review', () => {
    setReviewCount(0)
    render(<MovementsTabs current="operations" month="all" />)
    const tabs = within(screen.getByRole('navigation', { name: 'Mouvements' }))
    expect(tabs.getByRole('link', { name: 'Résumé' })).toHaveAttribute(
      'href',
      '/spending',
    )
    expect(tabs.getByRole('link', { name: 'Opérations' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
