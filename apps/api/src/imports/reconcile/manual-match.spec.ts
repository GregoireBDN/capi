import { describe, expect, it } from 'vitest'
import {
  MANUAL_MATCH_TOLERANCE_DAYS,
  type ManualExpense,
  manualLookupRange,
  matchManualExpenses,
  unmatchedInPeriod,
} from './manual-match'

// Synthetic data only.
const manual = (
  id: string,
  bookingDate: string,
  amountCents: number,
  rawLabel = 'Sorties',
): ManualExpense => ({ id, bookingDate, amountCents, rawLabel })

const row = (bookingDate: string, amountCents: number, rawLabel = 'X') => ({
  bookingDate,
  amountCents,
  rawLabel,
})

describe('matchManualExpenses', () => {
  it('matches the same amount booked a few days later', () => {
    expect(
      matchManualExpenses(
        [row('2026-11-05', -1250, 'PAIEMENT CB CINEMA FAKE')],
        [manual('m1', '2026-11-03', -1250)],
      ),
    ).toEqual(['m1'])
  })

  it('needs the same amount', () => {
    expect(
      matchManualExpenses(
        [row('2026-11-03', -1251)],
        [manual('m1', '2026-11-03', -1250)],
      ),
    ).toEqual([null])
  })

  it('accepts up to the tolerance, either side, and no further', () => {
    const tol = MANUAL_MATCH_TOLERANCE_DAYS
    expect(tol).toBe(5)
    expect(
      matchManualExpenses(
        [row('2026-11-15', -500), row('2026-11-05', -700)],
        [
          manual('late', '2026-11-10', -500),
          manual('early', '2026-11-10', -700),
        ],
      ),
    ).toEqual(['late', 'early'])
    expect(
      matchManualExpenses(
        [row('2026-11-16', -500), row('2026-11-04', -700)],
        [
          manual('late', '2026-11-10', -500),
          manual('early', '2026-11-10', -700),
        ],
      ),
    ).toEqual([null, null])
  })

  it('honours a custom tolerance', () => {
    expect(
      matchManualExpenses(
        [row('2026-11-11', -500)],
        [manual('m1', '2026-11-10', -500)],
        0,
      ),
    ).toEqual([null])
    expect(() => matchManualExpenses([], [], -1)).toThrow(RangeError)
  })

  it('pairs identical amounts on the same day one to one', () => {
    const rows = [
      row('2026-11-08', -300, 'PAIEMENT CB BOULANGERIE FAKE'),
      row('2026-11-08', -300, 'PAIEMENT CB BOULANGERIE FAKE'),
      row('2026-11-08', -300, 'PAIEMENT CB BOULANGERIE FAKE'),
    ]
    const result = matchManualExpenses(rows, [
      manual('b', '2026-11-07', -300),
      manual('a', '2026-11-07', -300),
    ])
    // Two expenses noted, three identical bank rows: the extra one stays new.
    expect(result).toEqual(['a', 'b', null])
  })

  it('gives a bank row to the closest of several candidates', () => {
    const result = matchManualExpenses(
      [row('2026-11-10', -2000)],
      [manual('far', '2026-11-06', -2000), manual('near', '2026-11-09', -2000)],
    )
    expect(result).toEqual(['near'])
  })

  it('gives each of several candidates its closest row', () => {
    const result = matchManualExpenses(
      [row('2026-11-04', -2000), row('2026-11-12', -2000)],
      [manual('m10', '2026-11-10', -2000), manual('m03', '2026-11-03', -2000)],
    )
    expect(result).toEqual(['m03', 'm10'])
  })

  it('prefers a bank row booked after the expense at equal distance', () => {
    const result = matchManualExpenses(
      [row('2026-11-09', -800), row('2026-11-11', -800)],
      [manual('m1', '2026-11-10', -800)],
    )
    expect(result).toEqual([null, 'm1'])
  })

  it('ranks by label when dates tie', () => {
    const result = matchManualExpenses(
      [row('2026-11-10', -900, 'PAIEMENT CB LIBRAIRIE FAKE')],
      [
        manual('other', '2026-11-10', -900, 'Restaurant'),
        manual('book', '2026-11-10', -900, 'Librairie'),
      ],
    )
    expect(result).toEqual(['book'])
  })

  it('never matches rows left out', () => {
    expect(
      matchManualExpenses([null], [manual('m1', '2026-11-10', -900)]),
    ).toEqual([null])
  })

  it('does not depend on the order of the manual expenses', () => {
    const rows = [row('2026-11-08', -300), row('2026-11-09', -300)]
    const m = [
      manual('a', '2026-11-08', -300),
      manual('b', '2026-11-09', -300),
      manual('c', '2026-11-08', -300),
    ]
    expect(matchManualExpenses(rows, m)).toEqual(
      matchManualExpenses(rows, [...m].reverse()),
    )
  })
})

describe('unmatchedInPeriod', () => {
  it('flags the unmatched expenses whose bank row was due in the file', () => {
    const m = [
      manual('before', '2026-10-28', -100),
      manual('due', '2026-11-20', -100),
      manual('matched', '2026-11-20', -100),
      manual('edge', '2026-11-25', -100),
      manual('tooLate', '2026-11-26', -100),
    ]
    expect(
      unmatchedInPeriod(
        m,
        new Set(['matched']),
        '2026-11-01',
        '2026-11-30',
      ).map((x) => x.id),
    ).toEqual(['due', 'edge'])
  })
})

describe('manualLookupRange', () => {
  it('pads the period by the tolerance', () => {
    expect(manualLookupRange('2026-11-01', '2026-11-30')).toEqual({
      from: '2026-10-27',
      to: '2026-12-05',
    })
  })
})
