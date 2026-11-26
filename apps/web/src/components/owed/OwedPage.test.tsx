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
  contactsControllerCreateOffset: vi.fn(),
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

/** Sam owes 75 € and is owed 30 €: two lists, 45 € net, an offset to propose. Synthetic. */
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
        netCents: 4500,
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
        netCents: 4500,
      },
    ],
    settled: [],
  },
  expected: [],
  offers: [
    {
      contactId: SAM,
      contactName: 'Sam',
      owedToMeCents: 7500,
      iOweCents: 3000,
      amountCents: 3000,
      alwaysOffset: false,
      items: [],
    },
  ],
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
    // Owed both ways: the net beside the figure (#484).
    expect(text(row)).toContain('net : vous doit 45,00 €')
    // An item older than 30 days.
    expect(text(row)).toContain('depuis 46 j')

    unmount()
    renderWithClient(<OwedPage side="owe" onSideChange={vi.fn()} />)
    expect(text(await screen.findByRole('link', { name: /Sam/ }))).toContain(
      '30,00 €',
    )
  })

  it('proposes the offset: « Compenser » settles it, « Ignorer » leaves it (#484)', async () => {
    const user = userEvent.setup()
    api.contactsControllerCreateOffset.mockResolvedValue(
      ok({
        id: 'a0000000-0000-4000-8000-000000000070',
        contactId: SAM,
        amountCents: 3000,
        offsetOn: '2026-11-20',
        automatic: false,
      }),
    )
    const { unmount } = renderWithClient(
      <OwedPage side="owed" onSideChange={vi.fn()} />,
    )
    expect(
      await screen.findByText(/Il restera : Sam vous doit 45,00 €/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Compenser 30,00\s€/ }))
    expect(api.contactsControllerCreateOffset).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: SAM }, body: {} }),
    )

    unmount()
    renderWithClient(<OwedPage side="owed" onSideChange={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Ignorer' }))
    expect(screen.queryByText(/Compenser avec Sam/)).not.toBeInTheDocument()
  })

  it('switches lists with the segmented control', async () => {
    const user = userEvent.setup()
    const onSideChange = vi.fn()
    renderWithClient(<OwedPage side="owed" onSideChange={onSideChange} />)
    await user.click(screen.getByRole('radio', { name: 'Je dois' }))
    expect(onSideChange).toHaveBeenCalledWith('owe')
  })
})
