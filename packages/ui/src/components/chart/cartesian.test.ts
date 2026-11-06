import { describe, expect, it } from 'vitest'

import { categoryTickIndices, niceTicks, referenceLabelSide } from './cartesian'

const isUnique = (ticks: number[]) =>
  new Set(ticks.map((tick) => String(tick))).size === ticks.length

describe('niceTicks', () => {
  it('returns round, ascending ticks covering the range', () => {
    expect(niceTicks(0, 1_000_000)).toEqual([
      0, 250_000, 500_000, 750_000, 1_000_000,
    ])
    expect(niceTicks(-50_000, 120_000)).toEqual([
      -50_000, 0, 50_000, 100_000, 150_000,
    ])
  })

  it.each([
    [0, 0],
    [0, 1],
    [0, 2],
    [-1, 1],
    [-3, 0],
    [5, 5],
    [-0.4, 0.4],
    [1_234_567, 1_234_569],
  ])('never repeats a tick or prints -0 (%d → %d)', (min, max) => {
    const ticks = niceTicks(min, max)
    expect(isUnique(ticks)).toBe(true)
    expect(ticks.some((tick) => Object.is(tick, -0))).toBe(false)
    expect(ticks.every(Number.isInteger)).toBe(true)
    expect(ticks[0]).toBeLessThanOrEqual(Math.min(min, max))
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(Math.max(min, max))
  })

  it('gives an all-zero series a 0 → 1 € axis', () => {
    expect(niceTicks(0, 0)).toEqual([0, 100])
  })

  it('accepts a fractional minimum step', () => {
    expect(niceTicks(0, 0.3, 4, 0.1)).toEqual([0, 0.1, 0.2, 0.3])
  })
})

describe('categoryTickIndices', () => {
  /** Labels of 35 px (e.g. `janv.`) on a phone-sized plot. */
  const LABEL = 35

  it('labels every category when they fit', () => {
    expect(categoryTickIndices(6, 600, LABEL)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('keeps the first and last labels and spreads the others evenly', () => {
    // 12 months on 270 px: 22.5 px per month, a label needs 2 of them.
    expect(categoryTickIndices(12, 270, LABEL)).toEqual([0, 2, 4, 7, 9, 11])
    // Narrower: a label needs 3 months, gaps of 3 or 4.
    expect(categoryTickIndices(12, 200, LABEL)).toEqual([0, 4, 7, 11])
  })

  it.each([
    [12, 255],
    [12, 160],
    [24, 255],
    [7, 120],
    [36, 300],
  ])('never lets two labels overlap (%i categories, %i px)', (count, width) => {
    const indices = categoryTickIndices(count, width, LABEL)
    const band = width / count
    expect(indices[0]).toBe(0)
    expect(indices.at(-1)).toBe(count - 1)
    for (let i = 1; i < indices.length; i++) {
      expect((indices[i]! - indices[i - 1]!) * band).toBeGreaterThanOrEqual(
        LABEL + 8,
      )
    }
  })

  it('falls back to the last label alone when two cannot fit', () => {
    expect(categoryTickIndices(3, 60, LABEL)).toEqual([2])
    expect(categoryTickIndices(1, 60, LABEL)).toEqual([0])
    expect(categoryTickIndices(0, 60, LABEL)).toEqual([])
  })
})

describe('referenceLabelSide', () => {
  const rows = (...values: number[]) =>
    values.map((net, i) => ({ month: `2026-${i + 1}`, net }))

  it('labels the end of the line by default', () => {
    expect(referenceLabelSide(rows(100, 200, 300, 100), ['net'], 500)).toBe(
      'end',
    )
  })

  it('moves the label to the start when the last bars cross the line', () => {
    expect(referenceLabelSide(rows(100, 200, 300, 900), ['net'], 500)).toBe(
      'start',
    )
  })

  it('counts a bar just under the line as touching the label', () => {
    // 480 is within 8 % of the 0–900 range below the 500 line.
    expect(referenceLabelSide(rows(480, 200, 300, 900), ['net'], 500)).toBe(
      'end',
    )
    expect(referenceLabelSide(rows(300, 200, 300, 900), ['net'], 500)).toBe(
      'start',
    )
  })

  it('stays at the end when both ends cross (the tag has a background)', () => {
    expect(referenceLabelSide(rows(900, 200, 300, 900), ['net'], 500)).toBe(
      'end',
    )
  })

  it('reads negative lines downwards and stacked rows as sums', () => {
    expect(referenceLabelSide(rows(0, 0, 0, -900), ['net'], -500)).toBe('start')
    const stacked = [
      { month: 'a', x: 100, y: 100 },
      { month: 'b', x: 100, y: 100 },
      { month: 'c', x: 100, y: 100 },
      { month: 'd', x: 300, y: 300 },
    ]
    expect(referenceLabelSide(stacked, ['x', 'y'], 500, true)).toBe('start')
    expect(referenceLabelSide(stacked, ['x', 'y'], 500)).toBe('end')
  })
})
