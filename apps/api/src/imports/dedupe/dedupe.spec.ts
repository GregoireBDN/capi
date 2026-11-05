import { normalizeLabel } from '#/imports/normalize/label'
import { describe, expect, it } from 'vitest'
import {
  classifyRows,
  computeDedupeHashes,
  type DedupeInput,
  type ExistingTransaction,
  normalizeLabelForHash,
  significantTokens,
  tokenOverlap,
} from './dedupe'

// Synthetic data only: fake merchants, towns, references and amounts.

function row(
  bookingDate: string,
  amountCents: number,
  rawLabel: string,
): DedupeInput {
  return { bookingDate, amountCents, rawLabel }
}

const COFFEE = 'PAIEMENT CB 0210 VILLE-EXEMPLE CAFE DE LA GARE CARTE 1234 ABCD'

/** Two identical same-day card payments in the middle of a small file. */
const OCTOBER: DedupeInput[] = [
  row('2026-10-01', 245_000, 'VIR SEPA SALAIRE SOCIETE FICTIVE OCT'),
  row('2026-10-02', -390, COFFEE),
  row('2026-10-02', -390, COFFEE),
  row('2026-10-03', -1200, 'PRLV SEPA ACME ASSURANCE 1234567890'),
  row('2026-10-04', -6000, 'RETRAIT DAB 0410 VILLE-EXEMPLE CARTE 1234'),
]

/** Stored transactions as the repository would return them. */
function stored(
  rows: DedupeInput[],
  hashes = computeDedupeHashes(rows),
  balances: (number | null)[] = rows.map(() => null),
): ExistingTransaction[] {
  return rows.map((r, k) => ({
    id: `existing-${k}`,
    ...r,
    merchantKey: normalizeLabel(r.rawLabel, r.amountCents).merchantKey,
    balanceAfterCents: balances[k],
    dedupeHash: hashes[k],
  }))
}

function withMerchantKeys(rows: DedupeInput[]) {
  return rows.map((r) => ({
    ...r,
    merchantKey: normalizeLabel(r.rawLabel, r.amountCents).merchantKey,
  }))
}

function classify(
  rows: DedupeInput[],
  existing: ExistingTransaction[],
  options?: { dateToleranceDays?: number },
) {
  return classifyRows(
    withMerchantKeys(rows),
    computeDedupeHashes(rows),
    existing,
    options,
  )
}

describe('computeDedupeHashes', () => {
  it('returns stable sha256 hex digests', () => {
    const hashes = computeDedupeHashes(OCTOBER)
    expect(hashes).toHaveLength(OCTOBER.length)
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(computeDedupeHashes(OCTOBER)).toEqual(hashes)
    // Pinned: a change of recipe silently breaks idempotency with stored rows.
    expect(
      computeDedupeHashes([row('2026-01-15', -1234, 'TEST LABEL')]),
    ).toEqual([
      '1990b75a59ac78e9dac3b7bcd551a0797cf6fd7883ba0396d351c93ca046c155',
    ])
  })

  it('gives distinct hashes to identical same-day rows', () => {
    const hashes = computeDedupeHashes(OCTOBER)
    expect(hashes[1]).not.toBe(hashes[2])
    expect(new Set(hashes).size).toBe(hashes.length)
  })

  it('does not depend on the order of rows, even newest-first', () => {
    const hashes = computeDedupeHashes(OCTOBER)
    const reversed = computeDedupeHashes([...OCTOBER].reverse())
    expect(new Set(reversed)).toEqual(new Set(hashes))
    expect(reversed[0]).toBe(hashes[4])
  })

  it('does not depend on the rows of other days', () => {
    const hashes = computeDedupeHashes(OCTOBER)
    const shuffled = [
      OCTOBER[3],
      OCTOBER[1],
      OCTOBER[0],
      OCTOBER[4],
      OCTOBER[2],
    ]
    const subset = computeDedupeHashes([OCTOBER[1], OCTOBER[2]])
    expect(computeDedupeHashes(shuffled)).toEqual([
      hashes[3],
      hashes[1],
      hashes[0],
      hashes[4],
      hashes[2],
    ])
    expect(subset).toEqual([hashes[1], hashes[2]])
  })

  it('ignores label case, accents and whitespace', () => {
    const [a] = computeDedupeHashes([
      row('2026-10-02', -435, "CB L'ÉPICERIE DU MOULIN  0210"),
    ])
    const [b] = computeDedupeHashes([
      row('2026-10-02', -435, "  cb l'epicerie   du moulin 0210 "),
    ])
    const [c] = computeDedupeHashes([
      row('2026-10-02', -435, "CB L'ÉPICERIE\tDU MOULIN 0210"),
    ])
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('changes with the date, the amount, the label or the reference', () => {
    const [base] = computeDedupeHashes([row('2026-10-02', -390, COFFEE)])
    const variants = [
      row('2026-10-03', -390, COFFEE),
      row('2026-10-02', -391, COFFEE),
      row('2026-10-02', 390, COFFEE),
      row('2026-10-02', -390, COFFEE.replace('ABCD', 'ABCE')),
    ]
    for (const v of variants) {
      expect(computeDedupeHashes([v])[0]).not.toBe(base)
    }
  })

  it('rejects invalid dates and non-integer amounts', () => {
    expect(() => computeDedupeHashes([row('02/10/2026', -390, 'X')])).toThrow(
      RangeError,
    )
    expect(() => computeDedupeHashes([row('2026-02-30', -390, 'X')])).toThrow(
      RangeError,
    )
    expect(() => computeDedupeHashes([row('2026-10-02', -3.9, 'X')])).toThrow(
      RangeError,
    )
  })

  it('normalizes labels without dropping references', () => {
    expect(
      normalizeLabelForHash('  Paiement  CB œuvre ÉTÉ Carte 1234 ABCD '),
    ).toBe('PAIEMENT CB OEUVRE ETE CARTE 1234 ABCD')
  })
})

describe('classifyRows', () => {
  it('classifies every row of a re-imported file as a duplicate', () => {
    const existing = stored(OCTOBER)
    const statuses = classify(OCTOBER, existing)
    expect(statuses).toEqual(
      existing.map((e) => ({ status: 'duplicate', existingId: e.id })),
    )
  })

  it('keeps both identical same-day rows of a first import', () => {
    expect(classify(OCTOBER, [])).toEqual(
      OCTOBER.map(() => ({ status: 'new' })),
    )
  })

  it('classifies the overlap of a superset file as duplicates', () => {
    const first = OCTOBER.slice(0, 3) // 1st and 2nd of October
    const existing = stored(first)
    const statuses = classify(OCTOBER, existing)
    expect(statuses).toEqual([
      { status: 'duplicate', existingId: 'existing-0' },
      { status: 'duplicate', existingId: 'existing-1' },
      { status: 'duplicate', existingId: 'existing-2' },
      { status: 'new' },
      { status: 'new' },
    ])
  })

  it('classifies the overlap of a subset file as duplicates', () => {
    const existing = stored(OCTOBER)
    const statuses = classify(OCTOBER.slice(1, 4), existing)
    expect(statuses).toEqual([
      { status: 'duplicate', existingId: 'existing-1' },
      { status: 'duplicate', existingId: 'existing-2' },
      { status: 'duplicate', existingId: 'existing-3' },
    ])
  })

  it('treats a third identical row on an already imported day as new', () => {
    const existing = stored(OCTOBER.slice(1, 3))
    const statuses = classify(
      [OCTOBER[1], OCTOBER[2], row('2026-10-02', -390, COFFEE)],
      existing,
    )
    expect(statuses).toEqual([
      { status: 'duplicate', existingId: 'existing-0' },
      { status: 'duplicate', existingId: 'existing-1' },
      { status: 'new' },
    ])
  })

  describe('probable duplicates from another source', () => {
    /** History import rows: statement-style labels, no balance. */
    const HISTORY = [
      row('2026-10-02', -390, 'CARTE X1234 02/10 CAFE DE LA GARE'),
      row('2026-10-02', -390, 'CARTE X1234 02/10 CAFE DE LA GARE'),
      row('2026-10-03', -1200, 'PRELEVEMENT ACME ASSURANCE ECH 03/10'),
    ]

    it('reports cross-source rows with different formatting as conflicts', () => {
      const existing = stored(HISTORY)
      const statuses = classify(OCTOBER, existing)
      expect(statuses).toEqual([
        { status: 'new' },
        {
          status: 'conflict',
          existingId: 'existing-0',
          reason: 'Same amount, same day, similar label',
        },
        {
          status: 'conflict',
          existingId: 'existing-1',
          reason: 'Same amount, same day, similar label',
        },
        {
          status: 'conflict',
          existingId: 'existing-2',
          reason: 'Same amount, same day, similar label',
        },
        { status: 'new' },
      ])
    })

    it('says when the merchant keys are the same', () => {
      const existing = stored([
        row('2026-10-03', -1200, 'PRELEVEMENT SEPA ACME ASSURANCE'),
      ])
      expect(classify([OCTOBER[3]], existing)).toEqual([
        {
          status: 'conflict',
          existingId: 'existing-0',
          reason: 'Same amount, same day, same merchant',
        },
      ])
    })

    it('matches each existing transaction with at most one row', () => {
      const existing = stored(HISTORY.slice(0, 1))
      const statuses = classify(OCTOBER.slice(1, 3), existing)
      expect(statuses).toEqual([
        expect.objectContaining({
          status: 'conflict',
          existingId: 'existing-0',
        }),
        { status: 'new' },
      ])
    })

    it('never reuses an exact duplicate as a conflict', () => {
      const existing = [
        ...stored(OCTOBER.slice(1, 2)),
        ...stored(HISTORY.slice(0, 1)).map((e) => ({ ...e, id: 'history-0' })),
      ]
      const statuses = classify(OCTOBER.slice(1, 3), existing)
      expect(statuses).toEqual([
        { status: 'duplicate', existingId: 'existing-0' },
        expect.objectContaining({
          status: 'conflict',
          existingId: 'history-0',
        }),
      ])
    })

    it('does not report a conflict on a different amount', () => {
      const existing = stored([
        row('2026-10-02', -490, 'CARTE X1234 02/10 CAFE DE LA GARE'),
        row('2026-10-02', 390, 'CARTE X1234 02/10 CAFE DE LA GARE'),
      ])
      expect(classify([OCTOBER[1]], existing)).toEqual([{ status: 'new' }])
    })

    it('does not report a conflict on an unrelated label', () => {
      const existing = stored([
        row('2026-10-02', -390, 'CARTE X1234 02/10 BOULANGERIE FICTIVE'),
        row(
          '2026-10-02',
          -390,
          'PAIEMENT CB 0210 VILLE-EXEMPLE KIOSQUE IMAGINAIRE CARTE 1234 WXYZ',
        ),
      ])
      expect(classify([OCTOBER[1]], existing)).toEqual([{ status: 'new' }])
    })

    it('only looks at other days within the date tolerance', () => {
      const existing = stored([
        row('2026-10-03', -390, 'CARTE X1234 03/10 CAFE DE LA GARE'),
      ])
      expect(classify([OCTOBER[1]], existing)).toEqual([{ status: 'new' }])
      expect(
        classify([OCTOBER[1]], existing, { dateToleranceDays: 1 }),
      ).toEqual([
        {
          status: 'conflict',
          existingId: 'existing-0',
          reason: 'Same amount, 1 day apart, similar label',
        },
      ])
    })

    it('prefers the closest date, then the same balance', () => {
      const candidates = stored(
        [
          row('2026-10-01', -390, 'CAFE DE LA GARE'),
          row('2026-10-02', -390, 'CAFE DE LA GARE'),
          row('2026-10-02', -390, 'CAFE DE LA GARE'),
        ],
        undefined,
        [null, 10_000, 9_610],
      )
      const statuses = classifyRows(
        [{ ...withMerchantKeys([OCTOBER[1]])[0], balanceAfterCents: 9_610 }],
        computeDedupeHashes([OCTOBER[1]]),
        candidates,
        { dateToleranceDays: 1 },
      )
      expect(statuses).toEqual([
        {
          status: 'conflict',
          existingId: 'existing-2',
          reason: 'Same amount, same day, same merchant, same balance',
        },
      ])
    })
  })

  it('rejects mismatched inputs and invalid tolerances', () => {
    expect(() => classifyRows(withMerchantKeys(OCTOBER), [], [])).toThrow(
      RangeError,
    )
    expect(() => classify(OCTOBER, [], { dateToleranceDays: -1 })).toThrow(
      RangeError,
    )
  })
})

describe('label tokens', () => {
  it('keeps counterparty words and long numbers only', () => {
    expect(significantTokens(COFFEE)).toEqual(
      new Set(['VILLE', 'EXEMPLE', 'CAFE', 'GARE', 'ABCD']),
    )
    expect(significantTokens('CHQ 1234567 DU 02/10')).toEqual(
      new Set(['1234567']),
    )
  })

  it('measures overlap against the smaller label', () => {
    const csv = significantTokens(COFFEE)
    const history = significantTokens('CARTE X1234 02/10 CAFE DE LA GARE')
    expect(tokenOverlap(history, csv)).toBe(1)
    expect(tokenOverlap(new Set(), csv)).toBe(0)
  })
})
