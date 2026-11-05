import type { ParsedRow } from '#/imports/parsers/parsed-row'
import { describe, expect, it } from 'vitest'
import { checkContinuity, endOfDayBalance } from './continuity'

// Synthetic data only: fake labels, amounts and balances.

let nextLine = 2
function row(
  bookingDate: string,
  amountCents: number,
  balanceAfterCents: number | null,
): ParsedRow {
  return {
    lineNumber: nextLine++,
    bookingDate,
    valueDate: bookingDate,
    amountCents,
    balanceAfterCents,
    rawLabel: 'TEST LABEL',
  }
}

/** Renumbers lines in file order, like the parser does. */
function file(...rows: ParsedRow[]): ParsedRow[] {
  return rows.map((r, k) => ({ ...r, lineNumber: k + 2 }))
}

const ASCENDING = file(
  row('2026-10-01', 245_000, 264_199),
  row('2026-10-02', -105_000, 159_199),
  row('2026-10-02', -390, 158_809),
  row('2026-10-02', -390, 158_419),
  row('2026-10-05', -1200, 157_219),
)

describe('checkContinuity', () => {
  it('accepts a file whose balances follow', () => {
    expect(checkContinuity(ASCENDING, null)).toEqual({
      checked: true,
      ok: true,
      order: 'ascending',
      gaps: [],
      openingMismatch: null,
    })
  })

  it('accepts a file that continues the previous balance', () => {
    expect(checkContinuity(ASCENDING, 19_199)).toMatchObject({
      checked: true,
      ok: true,
      openingMismatch: null,
    })
  })

  it('reports a missing row as a gap with its date range', () => {
    const missing = file(...ASCENDING.slice(0, 2), ...ASCENDING.slice(3))
    const report = checkContinuity(missing, null)
    expect(report).toMatchObject({ checked: true, ok: false })
    expect(report.gaps).toEqual([
      {
        lineNumber: 4,
        expectedCents: 158_809,
        actualCents: 158_419,
        fromDate: '2026-10-02',
        toDate: '2026-10-02',
      },
    ])
  })

  it('reports each gap once and resynchronizes after it', () => {
    const rows = file(
      row('2026-10-01', -100, 10_000),
      row('2026-10-03', -100, 9_800), // a -100 row is missing before this one
      row('2026-10-04', -100, 9_700),
      row('2026-10-08', 500, 10_000), // a -200 row is missing before this one
    )
    expect(checkContinuity(rows, null).gaps).toEqual([
      {
        lineNumber: 3,
        expectedCents: 9_900,
        actualCents: 9_800,
        fromDate: '2026-10-01',
        toDate: '2026-10-03',
      },
      {
        lineNumber: 5,
        expectedCents: 10_200,
        actualCents: 10_000,
        fromDate: '2026-10-04',
        toDate: '2026-10-08',
      },
    ])
  })

  it('checks a newest-first file in chronological order', () => {
    const descending = file(...[...ASCENDING].reverse())
    expect(checkContinuity(descending, 19_199)).toEqual({
      checked: true,
      ok: true,
      order: 'descending',
      gaps: [],
      openingMismatch: null,
    })

    const missing = file(...[...ASCENDING].reverse().filter((_, k) => k !== 3))
    const report = checkContinuity(missing, null)
    expect(report.order).toBe('descending')
    expect(report.gaps).toEqual([
      expect.objectContaining({
        lineNumber: 4,
        fromDate: '2026-10-01',
        toDate: '2026-10-02',
      }),
    ])
  })

  it('reads the order of a single-day file from the balances', () => {
    const day = file(
      row('2026-10-02', -390, 9_220),
      row('2026-10-02', -390, 9_610),
      row('2026-10-02', -390, 10_000),
    )
    expect(checkContinuity(day, 10_390)).toMatchObject({
      ok: true,
      order: 'descending',
    })
    expect(checkContinuity(file(...[...day].reverse()), 10_390)).toMatchObject({
      ok: true,
      order: 'ascending',
    })
  })

  it('reports an unknown order when nothing tells', () => {
    const single = file(row('2026-10-02', -390, 10_000))
    expect(checkContinuity(single, 10_390)).toEqual({
      checked: true,
      ok: true,
      order: 'unknown',
      gaps: [],
      openingMismatch: null,
    })
  })

  it('reports a mismatch with the previous import', () => {
    const report = checkContinuity(ASCENDING, 20_000)
    expect(report).toMatchObject({ checked: true, ok: false, gaps: [] })
    expect(report.openingMismatch).toEqual({
      lineNumber: 2,
      expectedCents: 265_000,
      actualCents: 264_199,
      fromDate: null,
      toDate: '2026-10-01',
    })
  })

  it('is not checked when the file has no balances', () => {
    const rows = file(
      row('2026-10-01', -100, null),
      row('2026-10-02', -100, null),
    )
    expect(checkContinuity(rows, 10_000)).toEqual({
      checked: false,
      ok: true,
      order: 'ascending',
      gaps: [],
      openingMismatch: null,
    })
    expect(checkContinuity([], null)).toMatchObject({
      checked: false,
      order: 'unknown',
    })
  })

  it('is not checked with a single balance and no previous balance', () => {
    const rows = file(row('2026-10-01', -100, 10_000))
    expect(checkContinuity(rows, null)).toMatchObject({ checked: false })
  })

  it('carries amounts through rows without a balance', () => {
    const rows = file(
      row('2026-10-01', -100, 10_000),
      row('2026-10-02', -200, null),
      row('2026-10-03', -300, 9_500),
    )
    expect(checkContinuity(rows, 10_100)).toMatchObject({
      checked: true,
      ok: true,
    })
    const broken = file(rows[0], rows[1], row('2026-10-03', -300, 9_700))
    expect(checkContinuity(broken, null).gaps).toEqual([
      expect.objectContaining({ expectedCents: 9_500, actualCents: 9_700 }),
    ])
  })
})

describe('endOfDayBalance', () => {
  it('finds the last balance of a day in any order', () => {
    // 10_000 → 9_610 → 10_610 → 10_220
    const day = [
      { amountCents: -390, balanceAfterCents: 10_220 },
      { amountCents: -390, balanceAfterCents: 9_610 },
      { amountCents: 1_000, balanceAfterCents: 10_610 },
    ]
    expect(endOfDayBalance(day)).toBe(10_220)
    expect(endOfDayBalance([...day].reverse())).toBe(10_220)
  })

  it('handles identical rows and zero amounts', () => {
    expect(
      endOfDayBalance([
        { amountCents: -390, balanceAfterCents: 9_610 },
        { amountCents: -390, balanceAfterCents: 9_220 },
        { amountCents: 0, balanceAfterCents: 9_220 },
      ]),
    ).toBe(9_220)
    expect(
      endOfDayBalance([
        { amountCents: 0, balanceAfterCents: 5_000 },
        { amountCents: 0, balanceAfterCents: 5_000 },
      ]),
    ).toBe(5_000)
  })

  it('returns null when the balances do not chain', () => {
    expect(
      endOfDayBalance([
        { amountCents: -100, balanceAfterCents: 9_900 },
        { amountCents: -100, balanceAfterCents: 5_000 },
      ]),
    ).toBeNull()
    expect(
      endOfDayBalance([
        { amountCents: -500, balanceAfterCents: 9_500 },
        { amountCents: 500, balanceAfterCents: 10_000 },
      ]),
    ).toBeNull()
  })
})
