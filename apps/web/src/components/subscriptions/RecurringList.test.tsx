import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EndedSection } from './EndedSection'
import { RecurringList } from './RecurringList'
import { recurringItem } from './test-fixtures'

const ITEMS = [
  recurringItem({ id: 'item-1', name: 'Premier' }),
  recurringItem({ id: 'item-2', name: 'Milieu' }),
  recurringItem({ id: 'item-3', name: 'Dernier' }),
]

/** The row buttons of a list must fill it: no rounding of their own (#291). */
function expectRowsFillTheList(list: HTMLElement) {
  // The list clips its rows to its corners…
  expect(list).toHaveClass('overflow-hidden', 'rounded-xl', 'border')
  const buttons = within(list).getAllByRole('button')
  expect(buttons).toHaveLength(ITEMS.length)
  for (const button of buttons) {
    // …so no row rounds its own corners (white corners on hover)…
    expect(button.className).not.toMatch(/rounded/)
    // …and the focus ring is drawn inside the row, never clipped.
    expect(button).toHaveClass('focus-visible:ring-inset')
  }
}

describe('row lists of Abonnements (#291)', () => {
  it('lets every row of a section fill it edge to edge', () => {
    render(
      <RecurringList
        title="Abonnements"
        items={ITEMS}
        today="2026-11-19"
        onEdit={vi.fn()}
      />,
    )
    expectRowsFillTheList(screen.getByRole('list'))
  })

  it('does the same for the cancelled items', () => {
    render(
      <EndedSection
        items={ITEMS.map((item) => ({
          ...item,
          endedOn: '2026-10-01',
          ended: true,
        }))}
        today="2026-11-19"
        onEdit={vi.fn()}
      />,
    )
    expectRowsFillTheList(screen.getByRole('list'))
  })
})
