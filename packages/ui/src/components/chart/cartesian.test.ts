import { describe, expect, it } from 'vitest'

import { niceTicks } from './cartesian'

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
