import { DateField } from '@capi/ui'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickDay } from '#/test/date-field'

function Form(props: {
  initial?: string
  min?: string
  max?: string
  clearable?: boolean
  today?: string
}) {
  const { initial = '', ...rest } = props
  const [value, setValue] = useState(initial)
  return (
    <>
      <label htmlFor="day">Date</label>
      <DateField id="day" value={value} onChange={setValue} {...rest} />
      <output>{value === '' ? '(vide)' : value}</output>
    </>
  )
}

const stored = () => screen.getByRole('status').textContent

describe('DateField (#488)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the day as dd/mm/yyyy and opens a French calendar', async () => {
    const user = userEvent.setup()
    render(<Form initial="2026-11-07" today="2026-11-13" />)
    const field = screen.getByLabelText('Date')
    expect(field).toHaveTextContent('07/11/2026')

    await user.click(field)
    // French names, weeks from Monday, the chosen day focused.
    const weekdays = document.querySelectorAll('.rdp-weekday')
    expect(weekdays[0]).toHaveAttribute('aria-label', 'lundi')
    expect(
      screen.getByRole('combobox', { name: 'Choisir le mois' }),
    ).toHaveDisplayValue('nov.')
    expect(document.activeElement).toHaveAccessibleName(
      /samedi 7 novembre 2026/,
    )
  })

  it('stores the day picked as YYYY-MM-DD', async () => {
    const user = userEvent.setup()
    render(<Form initial="2026-11-07" />)
    await pickDay(user, screen.getByLabelText('Date'), '2024-02-29')
    expect(stored()).toBe('2024-02-29')
    expect(screen.getByLabelText('Date')).toHaveTextContent('29/02/2024')
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })

  it('moves with the arrows, picks with Enter, closes with Escape', async () => {
    const user = userEvent.setup()
    render(<Form initial="2026-11-07" today="2026-11-13" />)
    await user.click(screen.getByLabelText('Date'))
    await user.keyboard('{ArrowRight}{ArrowDown}{Enter}')
    expect(stored()).toBe('2026-11-15')

    await user.click(screen.getByLabelText('Date'))
    await user.keyboard('{ArrowLeft}{Escape}')
    expect(stored()).toBe('2026-11-15')
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toHaveFocus()
  })

  it('offers no day outside min and max', async () => {
    const user = userEvent.setup()
    render(
      <Form
        initial="2026-11-10"
        min="2026-11-03"
        max="2026-11-13"
        today="2026-11-13"
      />,
    )
    await user.click(screen.getByLabelText('Date'))
    const grid = screen.getByRole('grid')
    const day = (iso: string) =>
      grid.querySelector(`[data-day="${iso}"] button`) as HTMLButtonElement
    expect(day('2026-11-02')).toBeDisabled()
    expect(day('2026-11-03')).toBeEnabled()
    expect(day('2026-11-13')).toBeEnabled()
    expect(day('2026-11-14')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Aller au mois suivant' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('picks today in Europe/Paris with « Aujourd’hui », whatever the hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 23:30 UTC on 31 December: already 1 January in Paris.
    vi.setSystemTime(new Date('2026-12-31T23:30:00Z'))
    const user = userEvent.setup()
    render(<Form initial="2026-12-24" />)
    await user.click(screen.getByLabelText('Date'))
    await user.click(screen.getByRole('button', { name: 'Aujourd’hui' }))
    expect(stored()).toBe('2027-01-01')
  })

  it('hides « Aujourd’hui » when today is out of bounds', async () => {
    const user = userEvent.setup()
    render(<Form initial="2026-10-10" max="2026-10-31" today="2026-11-13" />)
    await user.click(screen.getByLabelText('Date'))
    expect(
      screen.queryByRole('button', { name: 'Aujourd’hui' }),
    ).not.toBeInTheDocument()
  })

  it('can be cleared only when optional', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Form initial="2026-11-07" />)
    await user.click(screen.getByLabelText('Date'))
    expect(
      screen.queryByRole('button', { name: 'Effacer' }),
    ).not.toBeInTheDocument()
    unmount()

    render(<Form initial="2026-11-07" clearable />)
    await user.click(screen.getByLabelText('Date'))
    await user.click(screen.getByRole('button', { name: 'Effacer' }))
    expect(stored()).toBe('(vide)')
    expect(screen.getByLabelText('Date')).toHaveTextContent('jj/mm/aaaa')
  })
})
