import { describe, expect, it } from 'vitest'
import {
  lineCostCents,
  linesInvestedOn,
  type PricePoint,
  priceReplaces,
  type Statement,
  valuationDays,
  valueOn,
} from './valuation'

// Synthetic securities and amounts only.
const WORLD = 'world'
const EMERGING = 'emerging'

const statements: Statement[] = [
  {
    asOf: '2026-09-30',
    cashCents: 10_000,
    lines: [
      { securityId: WORLD, quantity: '10', unitCostEur: '100.5' },
      { securityId: EMERGING, quantity: '3.5', unitCostEur: '20.123' },
    ],
  },
  {
    asOf: '2026-10-31',
    cashCents: 500,
    lines: [{ securityId: WORLD, quantity: '12', unitCostEur: '101' }],
  },
]

const point = (day: string, priceEur: string): PricePoint => ({
  day,
  priceEur,
  source: 'statement',
})

const prices = new Map<string, PricePoint[]>([
  [WORLD, [point('2026-09-30', '110.25'), point('2026-10-15', '111')]],
  [EMERGING, [point('2026-09-30', '21.005')]],
])

describe('valuation', () => {
  it('values the lines of the statement in force, exactly, plus the cash', () => {
    // 10 × 110.25 = 1102.50 € ; 3.5 × 21.005 = 73.5175 → 73.52 € (half even
    // of 7351.75 cents is 7352).
    expect(valueOn(statements, prices, '2026-09-30')).toEqual({
      valueCents: 10_000 + 110_250 + 7_352,
      missing: [],
    })
    // Mid-October: same lines, the newer World price.
    expect(valueOn(statements, prices, '2026-10-15')?.valueCents).toBe(
      10_000 + 111_000 + 7_352,
    )
    // From the next statement: its lines only.
    expect(valueOn(statements, prices, '2026-10-31')?.valueCents).toBe(
      500 + 133_200,
    )
  })

  it('has no value before the first statement, nor with a line unpriced', () => {
    expect(valueOn(statements, prices, '2026-09-29')).toBeNull()
    const unpriced = new Map([[WORLD, prices.get(WORLD)!]])
    expect(valueOn(statements, unpriced, '2026-09-30')).toEqual({
      valueCents: null,
      missing: [EMERGING],
    })
  })

  it('rounds half to even', () => {
    // 1 × 0.125 € = 12.5 cents → 12; 1 × 0.135 € = 13.5 cents → 14.
    expect(
      lineCostCents({ securityId: WORLD, quantity: '1', unitCostEur: '0.125' }),
    ).toBe(12)
    expect(
      lineCostCents({ securityId: WORLD, quantity: '1', unitCostEur: '0.135' }),
    ).toBe(14)
  })

  it('writes a value on each statement day and each price day of a held line', () => {
    const later = new Map(prices)
    // A price of a security no longer held after October is not a day.
    later.set(EMERGING, [point('2026-09-30', '21'), point('2026-11-05', '22')])
    expect(
      valuationDays(statements, later, '2026-01-01', '2026-11-30'),
    ).toEqual(['2026-09-30', '2026-10-15', '2026-10-31'])
    expect(
      valuationDays(statements, later, '2026-10-01', '2026-10-20'),
    ).toEqual(['2026-10-15'])
  })

  it('takes the lines’ cost plus the cash as invested only when every PRU is known', () => {
    expect(linesInvestedOn(statements, '2026-10-31')).toEqual({
      investedCents: 500 + 121_200,
      since: '2026-10-31',
    })
    const unknown: Statement[] = [
      {
        asOf: '2026-09-30',
        cashCents: 0,
        lines: [{ securityId: WORLD, quantity: '1', unitCostEur: null }],
      },
    ]
    expect(linesInvestedOn(unknown, '2026-09-30')).toBeNull()
    expect(linesInvestedOn(statements, '2026-01-01')).toBeNull()
  })

  it('never lets a weaker price source replace a stronger one', () => {
    expect(priceReplaces('statement', 'manual')).toBe(false)
    expect(priceReplaces('manual', 'statement')).toBe(true)
    expect(priceReplaces('statement', 'statement')).toBe(true)
    expect(priceReplaces('provider', 'statement')).toBe(false)
  })
})
