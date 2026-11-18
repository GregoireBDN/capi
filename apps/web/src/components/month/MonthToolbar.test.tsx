import { render, screen } from '@testing-library/react'
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

describe('MonthToolbar', () => {
  it('puts the period note under the navigator, then the page’s filters', () => {
    const { container } = render(
      <MonthToolbar
        navigator={<div data-testid="navigator" />}
        period={partial}
      >
        <button type="button">Ajouter</button>
      </MonthToolbar>,
    )
    const toolbar = container.querySelector('[data-slot=month-toolbar]')!
    const [start, end] = [...toolbar.children]
    expect(start.firstElementChild).toBe(screen.getByTestId('navigator'))
    expect(start.querySelector('[data-slot=period-note]')).toHaveTextContent(
      /3 nov\./,
    )
    expect(end).toContainElement(
      screen.getByRole('button', { name: 'Ajouter' }),
    )
  })

  it('renders only the navigator without a period or filters', () => {
    const { container } = render(
      <MonthToolbar navigator={<div data-testid="navigator" />} />,
    )
    const toolbar = container.querySelector('[data-slot=month-toolbar]')!
    expect(toolbar.children).toHaveLength(1)
    expect(container.querySelector('[data-slot=period-note]')).toBeNull()
  })
})
