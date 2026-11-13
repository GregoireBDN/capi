import { describe, expect, it } from 'vitest'
import {
  type BudgetTimelineRow,
  mergeBudgetTimelines,
} from './merge-budget-timelines'

function row(
  effectiveFrom: string,
  monthlyTargetCents: number | null,
  note: string | null = null,
): BudgetTimelineRow {
  return { effectiveFrom, monthlyTargetCents, note }
}

describe('mergeBudgetTimelines', () => {
  it('keeps the source timeline when the target has no budget', () => {
    const source = [row('2026-01-01', 10_000), row('2026-04-01', null)]
    expect(mergeBudgetTimelines(source, [])).toEqual(source)
  })

  it('sums the targets in effect at every change of either timeline', () => {
    const source = [row('2026-01-01', 10_000), row('2026-05-01', 12_000)]
    const target = [row('2026-03-01', 20_000), row('2026-06-01', null)]

    expect(mergeBudgetTimelines(source, target)).toEqual([
      row('2026-01-01', 10_000),
      row('2026-03-01', 30_000),
      row('2026-05-01', 32_000),
      row('2026-06-01', 12_000),
    ])
  })

  it('ends the merged budget only when both are ended', () => {
    const source = [row('2026-01-01', 5_000), row('2026-02-01', null)]
    const target = [row('2026-01-01', 7_000), row('2026-03-01', null)]

    expect(mergeBudgetTimelines(source, target)).toEqual([
      row('2026-01-01', 12_000),
      row('2026-02-01', 7_000),
      row('2026-03-01', null),
    ])
  })

  it('prefers the target note at the same date, else keeps the source note', () => {
    const source = [
      row('2026-01-01', 1_000, 'source'),
      row('2026-02-01', 2_000, 'only source'),
    ]
    const target = [row('2026-01-01', 3_000, 'target')]

    expect(mergeBudgetTimelines(source, target)).toEqual([
      row('2026-01-01', 4_000, 'target'),
      row('2026-02-01', 5_000, 'only source'),
    ])
  })

  it('does not depend on the input order', () => {
    const source = [row('2026-05-01', 2_000), row('2026-01-01', 1_000)]
    expect(
      mergeBudgetTimelines(source, []).map((r) => r.effectiveFrom),
    ).toEqual(['2026-01-01', '2026-05-01'])
  })
})
