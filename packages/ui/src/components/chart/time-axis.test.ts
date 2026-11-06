import { describe, expect, it } from 'vitest'

import { calendarToTime } from './format'
import { timeDomain, timeTicks } from './time-axis'

const t = (date: string) => calendarToTime(date)!
const plain = (text: string) => text.replace(/\s/g, ' ')

function ticksOf(from: string, to: string, maxCount?: number) {
  const { ticks, format } = timeTicks(t(from), t(to), maxCount)
  return {
    dates: ticks.map((tick) => new Date(tick).toISOString().slice(0, 10)),
    labels: ticks.map((tick) => plain(format(tick))),
  }
}

describe('timeTicks', () => {
  it('uses days over a short range', () => {
    expect(ticksOf('2026-11-06', '2026-11-09')).toEqual({
      dates: ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'],
      labels: ['6 nov.', '7 nov.', '8 nov.', '9 nov.'],
    })
  })

  it('uses Mondays over a month', () => {
    const { dates } = ticksOf('2026-11-06', '2026-11-30')
    expect(dates).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ])
    for (const date of dates) expect(new Date(date).getUTCDay()).toBe(1)
  })

  it('uses quarters over a year and a half, labelled with the year', () => {
    expect(ticksOf('2025-02-14', '2026-06-02')).toEqual({
      dates: [
        '2025-04-01',
        '2025-07-01',
        '2025-10-01',
        '2026-01-01',
        '2026-04-01',
      ],
      labels: ['avr. 25', 'juil. 25', 'oct. 25', 'janv. 26', 'avr. 26'],
    })
  })

  it('uses years over a long range', () => {
    expect(ticksOf('2019-06-30', '2026-03-31').labels).toEqual([
      '2020',
      '2022',
      '2024',
      '2026',
    ])
  })

  it('returns unique, sorted ticks within the range', () => {
    for (const [from, to] of [
      ['2026-01-01', '2026-01-01'],
      ['2023-07-15', '2026-11-06'],
      ['2026-02-27', '2026-03-02'],
    ] as const) {
      const [low, high] = timeDomain(t(from), t(to))
      const { ticks } = timeTicks(low, high)
      expect(new Set(ticks).size).toBe(ticks.length)
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks)
      expect(ticks.length).toBeLessThanOrEqual(5)
      for (const tick of ticks) {
        expect(tick).toBeGreaterThanOrEqual(low)
        expect(tick).toBeLessThanOrEqual(high)
      }
    }
  })

  it('pads a single date by a day on each side', () => {
    expect(timeDomain(t('2026-03-29'), t('2026-03-29'))).toEqual([
      t('2026-03-28'),
      t('2026-03-30'),
    ])
  })
})
