const shortMonthYear = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** `2027-07-01` → `juil. 2027` (calendar date, no time zone shift). */
export function formatShortMonthOf(date: string): string {
  const [year, month] = date.split('-').map(Number)
  return shortMonthYear.format(new Date(Date.UTC(year, month - 1, 1)))
}
