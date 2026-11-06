const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

/**
 * Formats `value` with `format`, without a sign when it prints as zero.
 * `Intl` keeps the minus of `-0` and of negatives that round to zero
 * (`-0,00 €`, `-0 €`); those are printed as a plain zero instead.
 */
export function formatUnsignedZero(
  format: Intl.NumberFormat,
  value: number,
): string {
  const text = format.format(value)
  const negative = value < 0 || Object.is(value, -0)
  return negative && !/[1-9]/.test(text) ? format.format(0) : text
}

/**
 * Formats signed integer cents as euros (`-1 234,56 €`, never `-0,00 €`).
 * Money stays in integer cents everywhere else; this is the display edge.
 */
export function formatCents(cents: number): string {
  return formatUnsignedZero(euros, cents / 100)
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
