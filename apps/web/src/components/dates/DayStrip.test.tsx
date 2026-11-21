import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  DayStrip,
  daysThatFit,
  pageEndFor,
  spokenDay,
} from './DayStrip'

describe('day strip arithmetic', () => {
  it('fits whole 44px tiles, 5 to 7', () => {
    expect(daysThatFit(288)).toBe(5) // 320px phone
    expect(daysThatFit(343)).toBe(6) // 375px
    expect(daysThatFit(358)).toBe(7) // 390px
    expect(daysThatFit(900)).toBe(7)
    expect(daysThatFit(100)).toBe(5)
  })

  it('pages end on today, then every page length before it', () => {
    const today = '2026-11-20'
    expect(pageEndFor(today, today, 7)).toBe(today)
    expect(pageEndFor('2026-11-14', today, 7)).toBe(today)
    expect(pageEndFor('2026-11-13', today, 7)).toBe('2026-11-13')
    expect(pageEndFor('2026-11-01', today, 5)).toBe('2026-11-05')
    // A day to come shows today's page.
    expect(pageEndFor('2026-11-22', today, 7)).toBe(today)
  })

  it('moves calendar days without time zones', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('names a day the way it is said', () => {
    const today = '2026-11-20'
    expect(spokenDay(today, today)).toBe('Aujourd’hui')
    expect(spokenDay('2026-11-19', today)).toBe('Hier')
    expect(spokenDay('2026-11-18', today)).toBe('mer. 18 nov.')
    expect(spokenDay('2025-12-31', today)).toBe('mer. 31 déc. 2025')
  })
})

function Harness({ start }: { start: string }) {
  const [day, setDay] = useState(start)
  return <DayStrip value={day} onChange={setDay} today="2026-11-20" />
}

describe('DayStrip', () => {
  it('shows a page of whole days ending today, ‹ › turning it', async () => {
    const user = userEvent.setup()
    render(<Harness start="2026-11-20" />)
    const strip = screen.getByRole('radiogroup', { name: 'Jour' })
    // Not laid out in jsdom: a page of 7.
    expect(
      within(strip)
        .getAllByRole('radio')
        .map((tile) => tile.getAttribute('aria-label')),
    ).toEqual([
      'sam. 14 nov.',
      'dim. 15 nov.',
      'lun. 16 nov.',
      'mar. 17 nov.',
      'mer. 18 nov.',
      'Hier',
      'Aujourd’hui',
    ])
    expect(
      within(strip).getByRole('radio', { name: 'Aujourd’hui' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('button', { name: 'Jours suivants' }),
    ).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Jours précédents' }))
    const earlier = screen.getByRole('radiogroup', { name: 'Jour' })
    expect(within(earlier).getAllByRole('radio')[0]).toHaveAccessibleName(
      'sam. 7 nov.',
    )
    await user.click(
      within(earlier).getByRole('radio', { name: 'mar. 10 nov.' }),
    )
    expect(
      screen.getByText('Mar. 10 nov.', { exact: false }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('radiogroup', { name: 'Jour' })).getByRole(
        'radio',
        { name: 'mar. 10 nov.' },
      ),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('opens the month in place for any day, never one to come', async () => {
    const user = userEvent.setup()
    render(<Harness start="2026-11-20" />)
    await user.click(
      screen.getByRole('button', { name: 'Choisir dans le calendrier' }),
    )
    // The strip makes way for the month.
    expect(
      screen.queryByRole('radiogroup', { name: 'Jour' }),
    ).not.toBeInTheDocument()
    const grid = screen.getByRole('grid')
    expect(within(grid).getByText('21').closest('button')).toBeDisabled()
    await user.click(within(grid).getByText('3').closest('button')!)
    // Back to the strip, on the page holding the day picked.
    expect(
      within(screen.getByRole('radiogroup', { name: 'Jour' })).getByRole(
        'radio',
        { name: 'mar. 3 nov.' },
      ),
    ).toHaveAttribute('aria-checked', 'true')
  })
})
