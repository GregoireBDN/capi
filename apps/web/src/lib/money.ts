const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

/**
 * Formats signed integer cents as euros (`-1 234,56 €`). Money stays in
 * integer cents everywhere else; this is the display edge.
 */
export function formatCents(cents: number): string {
  return euros.format(cents / 100)
}

const calendarDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * Formats a `YYYY-MM-DD` calendar date (`3 nov. 2026`). The date is read and
 * printed in UTC so no time zone can shift it by a day.
 */
export function formatCalendarDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return calendarDate.format(new Date(Date.UTC(year, month - 1, day)))
}
