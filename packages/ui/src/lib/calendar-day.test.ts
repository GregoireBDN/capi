import { afterEach, describe, expect, it } from 'vitest'

import {
  dayToLocalDate,
  formatCalendarDay,
  localDateToDay,
  todayInParis,
} from './calendar-day'

const initialTimeZone = process.env.TZ

/** Every day from `from` to `to` included, as `YYYY-MM-DD`. */
function daysBetween(from: string, to: string): string[] {
  const days: string[] = []
  const date = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (date <= end) {
    days.push(date.toISOString().slice(0, 10))
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return days
}

describe('calendar days for the date picker (#488)', () => {
  afterEach(() => {
    process.env.TZ = initialTimeZone
  })

  // Paris, west and east of UTC, and zones whose DST change skips midnight
  // itself (Santiago, Havana) or moves a whole day (Apia, 2011).
  const zones = [
    'Europe/Paris',
    'America/Los_Angeles',
    'Pacific/Kiritimati',
    'America/Santiago',
    'America/Havana',
    'Asia/Tehran',
    'Pacific/Apia',
  ]

  it.each(zones)(
    'gives back the day picked, every day of two years, in %s',
    (zone) => {
      process.env.TZ = zone
      for (const day of daysBetween('2025-01-01', '2026-12-31')) {
        const local = dayToLocalDate(day)
        expect(local.getDate()).toBe(Number(day.slice(8)))
        expect(localDateToDay(local)).toBe(day)
      }
    },
  )

  it('keeps the day across the DST changes of Europe/Paris, near midnight', () => {
    process.env.TZ = 'Europe/Paris'
    for (const day of [
      '2026-03-28',
      '2026-03-29',
      '2026-10-24',
      '2026-10-25',
    ]) {
      const local = dayToLocalDate(day)
      // The picker may hand back any time of that day.
      const lateEvening = new Date(local)
      lateEvening.setHours(23, 59, 59)
      expect(localDateToDay(local)).toBe(day)
      expect(localDateToDay(lateEvening)).toBe(day)
    }
  })

  it('reads today in Europe/Paris, whatever the device’s zone', () => {
    process.env.TZ = 'America/Los_Angeles'
    // 23:30 UTC on 31 December is already 1 January in Paris.
    expect(todayInParis(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
    // 22:30 UTC in summer is 00:30 the next day in Paris (UTC+2).
    expect(todayInParis(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-15')
    expect(todayInParis(new Date('2026-07-14T21:30:00Z'))).toBe('2026-07-14')
  })

  it('shows a day as dd/mm/yyyy', () => {
    expect(formatCalendarDay('2026-11-07')).toBe('07/11/2026')
  })
})
