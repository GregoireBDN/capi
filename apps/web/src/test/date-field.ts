import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/**
 * Picks `day` (`YYYY-MM-DD`) in a `DateField` (#488) as the owner would:
 * opens its calendar, chooses the year and the month in its lists, then
 * taps the day.
 */
export async function pickDay(
  user: UserEvent,
  field: HTMLElement,
  day: string,
): Promise<void> {
  await user.click(field)
  const year = await screen.findByRole('combobox', { name: "Choisir l'année" })
  const panel = year.closest<HTMLElement>('[data-slot=calendar]')!
  await user.selectOptions(year, String(Number(day.slice(0, 4))))
  await user.selectOptions(
    within(panel).getByRole('combobox', { name: 'Choisir le mois' }),
    String(Number(day.slice(5, 7)) - 1),
  )
  const cell = panel.querySelector(`[data-day="${day}"] button`)
  if (!(cell instanceof HTMLElement)) throw new Error(`No ${day} to pick`)
  await user.click(cell)
}
