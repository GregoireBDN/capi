import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonthPeriodDto } from '#/api/types.gen'
import { MonthToolbar } from './MonthToolbar'

const partial: MonthPeriodDto = {
  month: '2026-11',
  status: 'partial',
  dataUntil: '2026-11-03',
  throughDay: 3,
  previousMonth: '2026-10',
  previousUntil: '2026-10-03',
  defaultMonth: '2026-11',
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

const toolbar = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-slot=month-toolbar]')!

describe('MonthToolbar', () => {
  it('holds the navigator, the actions and the period note in one bar', () => {
    const { container } = render(
      <MonthToolbar
        navigator={<div data-testid="navigator" />}
        period={partial}
        actions={<button type="button">Ajouter</button>}
      />,
    )
    const bar = toolbar(container)
    expect(bar).toContainElement(screen.getByTestId('navigator'))
    expect(
      within(
        bar.querySelector<HTMLElement>('[data-slot=month-toolbar-actions]')!,
      ).getByRole('button', { name: 'Ajouter' }),
    ).toBeInTheDocument()
    expect(bar.querySelector('[data-slot=period-note]')).toHaveTextContent(
      /3 nov\./,
    )
    // No filters, no « Filtres » button.
    expect(screen.queryByRole('button', { name: /^Filtres/ })).toBeNull()
  })

  it('shows the filters inline and, on phones, in a sheet with the count', async () => {
    const user = userEvent.setup()
    const filters = (layout: 'inline' | 'sheet') => (
      <select aria-label={`Compte (${layout})`} />
    )
    const { container } = render(
      <MonthToolbar navigator={<div />} filters={filters} activeFilters={2} />,
    )
    expect(
      toolbar(container).querySelector('[data-slot=month-toolbar-filters]'),
    ).toContainElement(screen.getByLabelText('Compte (inline)'))
    expect(screen.queryByLabelText('Compte (sheet)')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Filtres, 2 actifs' }))
    const sheet = await screen.findByRole('dialog', { name: 'Filtres' })
    expect(within(sheet).getByLabelText('Compte (sheet)')).toBeInTheDocument()
  })

  it('puts the period note in the row when the page has nothing to set', () => {
    const { container } = render(
      <MonthToolbar
        navigator={<div data-testid="navigator" />}
        period={partial}
      />,
    )
    const row = screen.getByTestId('navigator').parentElement!
    expect(row.querySelector('[data-slot=period-note]')).not.toBeNull()
    expect(toolbar(container)).toHaveClass('border')
  })

  it('renders only the navigator without a period, filters or actions', () => {
    const { container } = render(
      <MonthToolbar navigator={<div data-testid="navigator" />} />,
    )
    expect(container.querySelector('[data-slot=period-note]')).toBeNull()
    expect(
      container.querySelector('[data-slot=month-toolbar-actions]'),
    ).toBeNull()
    expect(
      container.querySelector('[data-slot=month-toolbar-filters]'),
    ).toBeNull()
    // No empty bar around a lone navigator.
    expect(toolbar(container)).not.toHaveClass('border')
  })
})
