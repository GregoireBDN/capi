import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoverageDto } from '#/api/types.gen'
import { MonthNavigator, monthShortcuts } from './MonthNavigator'

const api = vi.hoisted(() => ({ coverageControllerCoverage: vi.fn() }))
vi.mock('#/api', () => api)

function ok<T>(data: T) {
  return Promise.resolve({ data, response: { ok: true, status: 200 } })
}

/** Synthetic coverage: data from August to September 2026, today in November. */
const coverage: CoverageDto = {
  dataUntil: '2026-09-30',
  currentMonth: '2026-11',
  defaultMonth: '2026-09',
  months: ['2025-12', '2026-08', '2026-09'],
}

function Harness({
  initial,
  max,
  label,
  onChange,
}: {
  initial: string
  max?: string
  label?: string
  onChange: (month: string) => void
}) {
  const [month, setMonth] = useState(initial)
  return (
    <>
      <input aria-label="Champ" />
      <MonthNavigator
        month={month}
        max={max}
        label={label}
        onMonthChange={(next) => {
          onChange(next)
          setMonth(next)
        }}
      />
    </>
  )
}

function setup(props: { initial?: string; max?: string; label?: string } = {}) {
  const onChange = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <Harness
        initial={props.initial ?? '2026-09'}
        {...props}
        onChange={onChange}
      />
    </QueryClientProvider>,
  )
  return { user, onChange }
}

const trigger = (name: string) =>
  screen.getByRole('button', { name: `${name}, choisir un mois` })

beforeEach(() => {
  vi.resetAllMocks()
  // "Today" is 5 November 2026 in Europe/Paris; only Date is faked.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
  api.coverageControllerCoverage.mockReturnValue(ok(coverage))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MonthNavigator', () => {
  it('moves month by month, never past the latest month', async () => {
    const { user, onChange } = setup({ initial: '2026-10' })
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(onChange).toHaveBeenLastCalledWith('2026-11')
    expect(trigger('Novembre 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Mois précédent' }))
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(onChange).toHaveBeenLastCalledWith('2026-09')
  })

  it('jumps to a month from the picker, months with data marked and the future off', async () => {
    const { user, onChange } = setup({ initial: '2026-09' })
    await user.click(trigger('Septembre 2026'))
    const picker = await screen.findByRole('dialog', {
      name: 'Choisir un mois',
    })

    expect(
      within(picker).getByRole('button', {
        name: 'Septembre 2026, avec des opérations',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      await within(picker).findByRole('button', {
        name: 'Août 2026, avec des opérations',
      }),
    ).toBeEnabled()
    expect(
      within(picker).getByRole('button', { name: 'Octobre 2026' }),
    ).toBeEnabled()
    expect(
      within(picker).getByRole('button', { name: 'Décembre 2026' }),
    ).toBeDisabled()
    expect(
      within(picker).getByRole('button', { name: 'Année suivante' }),
    ).toBeDisabled()

    // Back a year: December 2025 has data, the year before has none.
    await user.click(
      within(picker).getByRole('button', { name: 'Année précédente' }),
    )
    expect(within(picker).getByText('2025')).toBeInTheDocument()
    expect(
      within(picker).getByRole('button', { name: 'Année précédente' }),
    ).toBeDisabled()
    await user.click(
      within(picker).getByRole('button', {
        name: 'Décembre 2025, avec des opérations',
      }),
    )
    expect(onChange).toHaveBeenLastCalledWith('2025-12')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger('Décembre 2025')).toBeInTheDocument()
  })

  it('offers the current month and the month the data stops in', async () => {
    const { user, onChange } = setup({ initial: '2026-03' })
    await user.click(trigger('Mars 2026'))
    const picker = await screen.findByRole('dialog', {
      name: 'Choisir un mois',
    })
    await user.click(
      await within(picker).findByRole('button', { name: 'Dernières données' }),
    )
    expect(onChange).toHaveBeenLastCalledWith('2026-09')

    await user.click(trigger('Septembre 2026'))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Mois en cours',
      }),
    )
    expect(onChange).toHaveBeenLastCalledWith('2026-11')
  })

  it('moves with ← and → outside fields, never past the latest month', async () => {
    const { user, onChange } = setup({ initial: '2026-10', max: '2026-10' })
    await user.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('2026-09')
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('2026-10')
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledTimes(2)

    // Typing in a field keeps its arrows.
    await user.click(screen.getByLabelText('Champ'))
    await user.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenCalledTimes(2)
    // A modifier too.
    screen.getByLabelText('Champ').blur()
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('has a short label for narrow containers, both as wide as the widest month', () => {
    setup({ initial: '2026-05' })
    const button = trigger('Mai 2026')
    // Both forms are rendered; container queries pick one (< 320px: short).
    expect(within(button).getByText('Mai 2026')).toBeInTheDocument()
    expect(within(button).getByText('mai 2026')).toBeInTheDocument()
    // Every month of the year sizes the label, so the arrows never move.
    const sizers = [...button.querySelectorAll('[data-sizer]')].map((sizer) =>
      sizer.getAttribute('data-sizer'),
    )
    expect(sizers).toHaveLength(24)
    expect(sizers).toEqual(
      expect.arrayContaining(['Septembre 2026', 'sept. 2026', 'Mai 2026']),
    )
  })

  it('shows a label instead of the month, arrows off, the picker leading back to a month', async () => {
    const { user, onChange } = setup({
      initial: '2026-11',
      label: 'Toutes les dates',
    })
    expect(
      screen.getByRole('button', { name: 'Mois précédent' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled()
    await user.keyboard('{ArrowLeft}')
    expect(onChange).not.toHaveBeenCalled()

    await user.click(trigger('Toutes les dates'))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Mois en cours',
      }),
    )
    expect(onChange).toHaveBeenLastCalledWith('2026-11')
  })
})

describe('monthShortcuts', () => {
  it('names the latest month and the month the data stops in', () => {
    expect(
      monthShortcuts({
        max: '2026-11',
        current: '2026-11',
        defaultMonth: '2026-09',
      }),
    ).toEqual([
      { label: 'Mois en cours', month: '2026-11' },
      { label: 'Dernières données', month: '2026-09' },
    ])
    // The reviews stop at the previous month.
    expect(
      monthShortcuts({
        max: '2026-10',
        current: '2026-11',
        defaultMonth: '2026-11',
      }),
    ).toEqual([{ label: 'Mois dernier', month: '2026-10' }])
    expect(
      monthShortcuts({
        max: '2026-11',
        current: '2026-11',
        defaultMonth: undefined,
      }),
    ).toEqual([{ label: 'Mois en cours', month: '2026-11' }])
  })
})
