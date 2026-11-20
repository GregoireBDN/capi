import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OwedSummaryDto } from '#/api/types.gen'
import { ok, renderWithClient } from '#/components/import/test-fixtures'
import { OwedPage } from './OwedPage'

const api = vi.hoisted(() => ({
  owedControllerSummary: vi.fn(),
  contactsControllerList: vi.fn(),
  categoriesControllerList: vi.fn(),
}))
vi.mock('#/api', () => api)
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const SAM = 'a0000000-0000-4000-8000-000000000002'

/** Sam owes 75 € and is owed 30 €: two lists, never netted. Synthetic. */
const summary: OwedSummaryDto = {
  today: '2026-11-20',
  month: '2026-11',
  owedToMe: {
    totalCents: 7500,
    contacts: [
      {
        contactId: SAM,
        name: 'Sam',
        owedCents: 7500,
        openCount: 2,
        oldestOpenDate: '2026-10-05',
        oldestOpenDays: 46,
      },
    ],
    settled: [],
  },
  iOwe: {
    totalCents: 3000,
    contacts: [
      {
        contactId: SAM,
        name: 'Sam',
        owedCents: 3000,
        openCount: 1,
        oldestOpenDate: '2026-11-12',
        oldestOpenDays: 8,
      },
    ],
    settled: [],
  },
  expected: [],
}

function text(element: HTMLElement) {
  return element.textContent.replace(/\s/g, ' ')
}

describe('OwedPage (#359, « B. Deux listes »)', () => {
  beforeEach(() => {
    api.owedControllerSummary.mockResolvedValue(ok(summary))
    api.contactsControllerList.mockResolvedValue(ok([]))
    api.categoriesControllerList.mockResolvedValue(ok([]))
  })

  it('shows Sam in « On me doit » with 75 €, then in « Je dois » with 30 €', async () => {
    const { unmount } = renderWithClient(
      <OwedPage side="owed" onSideChange={vi.fn()} />,
    )
    const row = await screen.findByRole('link', { name: /Sam/ })
    expect(text(row)).toContain('75,00 €')
    expect(text(row)).not.toContain('45,00 €')
    // An item older than 30 days.
    expect(text(row)).toContain('depuis 46 j')

    unmount()
    renderWithClient(<OwedPage side="owe" onSideChange={vi.fn()} />)
    expect(text(await screen.findByRole('link', { name: /Sam/ }))).toContain(
      '30,00 €',
    )
  })

  it('switches lists with the segmented control', async () => {
    const user = userEvent.setup()
    const onSideChange = vi.fn()
    renderWithClient(<OwedPage side="owed" onSideChange={onSideChange} />)
    await user.click(screen.getByRole('radio', { name: 'Je dois' }))
    expect(onSideChange).toHaveBeenCalledWith('owe')
  })
})
