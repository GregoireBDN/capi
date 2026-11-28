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

/** A glass list: rows separated by space, never by a line (#291, #510). */
function expectGlassRows(list: HTMLElement) {
  expect(list).toHaveClass('glass-card', 'space-y-0.5')
  expect(list.className).not.toMatch(/\b(border|divide-y)\b/)
  const buttons = within(list).getAllByRole('button')
  expect(buttons).toHaveLength(ITEMS.length)
  for (const button of buttons) {
    // A soft rounded tile on hover, the focus ring drawn inside the row.
    expect(button).toHaveClass('rounded-control', 'focus-visible:ring-inset')
  }
}

describe('row lists of Abonnements (#291)', () => {
  it('separates the rows of a section by space only', () => {
    render(
      <RecurringList
        title="Abonnements"
        items={ITEMS}
        today="2026-11-19"
        onEdit={vi.fn()}
      />,
    )
    expectGlassRows(screen.getByRole('list'))
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
    expectGlassRows(screen.getByRole('list'))
  })
})
