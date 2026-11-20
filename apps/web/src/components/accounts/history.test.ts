import { describe, expect, it } from 'vitest'
import type { SnapshotDto } from '#/api/types.gen'
import { historyPoints } from './history'

const point = (date: string, valueCents: number): SnapshotDto => ({
  id: date,
  date,
  valueCents,
  contributionsCents: null,
  note: null,
  source: 'computed',
})

describe('historyPoints (#366)', () => {
  it('ends with the live value of today', () => {
    expect(
      historyPoints({
        snapshots: [point('2026-11-04', 100), point('2026-11-05', 110)],
        live: {
          date: '2026-11-06',
          valueCents: 120,
          contributionsCents: 90,
        },
      }).map((p) => [p.date, p.valueCents, p.contributionsCents]),
    ).toEqual([
      ['2026-11-04', 100, null],
      ['2026-11-05', 110, null],
      ['2026-11-06', 120, 90],
    ])
  })

  it('keeps the stored values alone without a live one', () => {
    const snapshots = [point('2026-11-04', 100)]
    expect(historyPoints({ snapshots, live: null })).toBe(snapshots)
  })
})
