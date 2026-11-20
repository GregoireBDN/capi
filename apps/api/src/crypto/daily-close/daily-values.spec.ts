import { describe, expect, it } from 'vitest'
import type { HoldingMovement } from '#/imports/crypto/holdings'
import { knownAsset } from '#/imports/crypto/assets'
import {
  closingPrices,
  dayRange,
  exchangeLinesByDay,
  msUntilNextClose,
  parisDayEnd,
  parisDayStart,
  valueDay,
} from './daily-values'

/** Synthetic prices and quantities only. */
describe('daily values (#366)', () => {
  it('finds the Europe/Paris day boundaries in winter and in summer', () => {
    expect(parisDayStart('2026-11-05').toISOString()).toBe(
      '2026-11-04T23:00:00.000Z',
    )
    expect(parisDayStart('2026-07-14').toISOString()).toBe(
      '2026-07-13T22:00:00.000Z',
    )
    // The days the clocks change still start at midnight.
    expect(parisDayEnd('2026-03-29').toISOString()).toBe(
      '2026-03-29T22:00:00.000Z',
    )
    expect(parisDayEnd('2026-10-25').toISOString()).toBe(
      '2026-10-25T23:00:00.000Z',
    )
  })

  it('lists the days of a range', () => {
    expect(dayRange('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])
    expect(dayRange('2026-11-02', '2026-11-01')).toEqual([])
  })

  it('takes the provider point nearest to the end of each day', () => {
    const points = [
      { at: new Date('2026-11-04T00:00:00Z'), priceEur: '100' },
      { at: new Date('2026-11-05T00:00:00Z'), priceEur: '101' },
      { at: new Date('2026-11-06T00:00:00Z'), priceEur: '102' },
      // The current price, a few minutes after midnight in Paris.
      { at: new Date('2026-11-06T23:04:00Z'), priceEur: '103.5' },
    ]
    expect(
      closingPrices(points, [
        '2026-11-03',
        '2026-11-04',
        '2026-11-05',
        '2026-11-06',
        '2026-11-08',
      ]),
    ).toEqual(
      new Map([
        ['2026-11-03', '100'],
        ['2026-11-04', '101'],
        ['2026-11-05', '102'],
        ['2026-11-06', '103.5'],
      ]),
    )
  })

  it('values a day exactly, or not at all when a price is missing', () => {
    const lines = [
      { assetId: 'bitcoin', quantity: '0.25', investedCents: 1_000_00 },
      { assetId: 'ethereum', quantity: '1.5', investedCents: 2_000_00 },
    ]
    expect(
      valueDay(
        lines,
        new Map([
          ['bitcoin', '60000.5'],
          ['ethereum', '2500'],
        ]),
      ),
    ).toEqual({
      // 0.25 × 60 000,50 € = 1 500 012,5 cents → 1 500 012 (half to even).
      valueCents: 1_500_012 + 375_000,
      investedCents: 3_000_00,
    })
    expect(valueDay(lines, new Map([['bitcoin', '60000']]))).toBeNull()
    // A token known by its contract only never holds the day back.
    expect(
      valueDay(
        [
          lines[0],
          {
            assetId: 'erc20.1.0x1111111111111111111111111111111111111111',
            quantity: '5',
            investedCents: null,
          },
        ],
        new Map([['bitcoin', '60000']]),
      ),
    ).toEqual({ valueCents: 1_500_000, investedCents: null })
  })

  it("gives an exchange's holdings at the end of each day from its movements", () => {
    const move = (
      occurredAt: string,
      kind: HoldingMovement['kind'],
      asset: string,
      quantity: string,
      eurCents: number | null = null,
    ): HoldingMovement => ({ occurredAt, kind, asset, quantity, eurCents })
    const movements = [
      move('2026-03-02T09:00:00Z', 'deposit', 'EUR', '300'),
      move('2026-03-02T09:05:00Z', 'buy', 'EUR', '-300'),
      move('2026-03-02T09:05:00Z', 'buy', 'BTC', '0.005'),
      // 23:30 UTC is already the next day in Paris.
      move('2026-03-03T23:30:00Z', 'buy', 'EUR', '-100'),
      move('2026-03-03T23:30:00Z', 'buy', 'ETH', '0.05'),
      move('2026-03-05T10:00:00Z', 'withdrawal', 'BTC', '-0.002'),
    ]
    const lines = exchangeLinesByDay(
      movements,
      knownAsset,
      dayRange('2026-03-01', '2026-03-05'),
    )
    expect(lines.get('2026-03-01')).toEqual([])
    expect(lines.get('2026-03-02')).toEqual([
      { assetId: 'bitcoin', quantity: '0.005', investedCents: 300_00 },
    ])
    expect(lines.get('2026-03-03')).toEqual(lines.get('2026-03-02'))
    expect(lines.get('2026-03-04')).toEqual([
      { assetId: 'bitcoin', quantity: '0.005', investedCents: 300_00 },
      { assetId: 'ethereum', quantity: '0.05', investedCents: 100_00 },
    ])
    expect(lines.get('2026-03-05')).toEqual([
      { assetId: 'bitcoin', quantity: '0.003', investedCents: 180_00 },
      { assetId: 'ethereum', quantity: '0.05', investedCents: 100_00 },
    ])
  })

  it('waits until a few minutes past the next midnight in Paris', () => {
    // 22:00 UTC on 5 November is 23:00 in Paris: 1 h 05 to go.
    expect(msUntilNextClose(new Date('2026-11-05T22:00:00Z'), 5)).toBe(
      65 * 60_000,
    )
    // 00:02 in Paris: three minutes to today's close.
    expect(msUntilNextClose(new Date('2026-11-05T23:02:00Z'), 5)).toBe(
      3 * 60_000,
    )
  })
})
