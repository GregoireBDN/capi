import { describe, expect, it } from 'vitest'
import {
  basisPointsOf,
  divideHalfEven,
  equalPart,
  ownPart,
  recurringShareOf,
} from './shares'

describe('divideHalfEven', () => {
  it.each([
    [9000, 3, 3000],
    [10000, 3, 3333],
    [9500, 3, 3167],
    [9000, 2, 4500],
    [9001, 2, 4500], // 4500.5 → even
    [9003, 2, 4502], // 4501.5 → even
    [5, 2, 2],
    [7, 2, 4],
    [0, 4, 0],
  ])('%i / %i = %i', (numerator, denominator, expected) => {
    expect(divideHalfEven(numerator, denominator)).toBe(expected)
  })

  it('refuses floats and negatives', () => {
    expect(() => divideHalfEven(1.5, 2)).toThrow(RangeError)
    expect(() => divideHalfEven(-1, 2)).toThrow(RangeError)
    expect(() => divideHalfEven(1, 0)).toThrow(RangeError)
  })
})

describe('equal parts', () => {
  it('« Quelqu’un a payé pour moi »: 90 € between 3 is 30 €, 100 € between 3 is 33,33 €', () => {
    expect(equalPart(9000, 3)).toBe(3000)
    expect(equalPart(10000, 3)).toBe(3333)
  })

  it('keeps the remainder on the owner: 95 € with two friends', () => {
    const part = equalPart(9500, 3)
    expect(part).toBe(3167)
    expect(ownPart(9500, [part, part])).toBe(3166)
  })

  it('needs at least two people', () => {
    expect(() => equalPart(1000, 1)).toThrow(RangeError)
  })
})

describe('recurring shares', () => {
  it('takes a rate half to even, or a fixed amount capped at the charge', () => {
    expect(basisPointsOf(80000, 5000)).toBe(40000)
    expect(basisPointsOf(899, 5000)).toBe(450) // 449.5 → even
    expect(recurringShareOf(6000, { bps: null, amountCents: 4000 })).toBe(4000)
    expect(recurringShareOf(3000, { bps: null, amountCents: 4000 })).toBe(3000)
    expect(recurringShareOf(80000, { bps: 5000, amountCents: null })).toBe(
      40000,
    )
  })
})
