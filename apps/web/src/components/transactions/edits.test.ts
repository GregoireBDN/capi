import { describe, expect, it } from 'vitest'
import { remainingCents, splitError } from './edits'
import { parseSignedCents } from './ImportedCorrection'

describe('split arithmetic', () => {
  it('tells what is left to allocate, in exact cents', () => {
    expect(
      remainingCents(-4_550, [{ amountCents: -3_000 }, { amountCents: null }]),
    ).toBe(-1_550)
    expect(
      remainingCents(-4_550, [
        { amountCents: -3_000 },
        { amountCents: -1_550 },
      ]),
    ).toBe(0)
  })

  it('accepts only parts summing exactly to the amount, with its sign', () => {
    const parts = (a: number | null, b: number | null) => [
      { categoryId: 'a', amountCents: a },
      { categoryId: 'b', amountCents: b },
    ]
    expect(splitError(-4_550, parts(-3_000, -1_550))).toBeNull()
    expect(splitError(-4_550, parts(-3_000, -1_549))).toMatch(/exactement/)
    expect(splitError(-4_550, parts(-6_000, 1_450))).toMatch(/montant/)
    expect(splitError(-4_550, parts(-4_550, 0))).toMatch(/montant/)
    expect(splitError(-4_550, parts(-4_550, null))).toMatch(/montant/)
    expect(
      splitError(-4_550, [{ categoryId: 'a', amountCents: -4_550 }]),
    ).toMatch(/deux/)
    expect(
      splitError(-4_550, [
        { categoryId: 'a', amountCents: -3_000 },
        { categoryId: '', amountCents: -1_550 },
      ]),
    ).toMatch(/catégorie/)
  })
})

describe('parseSignedCents', () => {
  it('reads money out with a minus, never through floats', () => {
    expect(parseSignedCents('-12,50')).toEqual({ cents: -1_250 })
    expect(parseSignedCents('−0,10')).toEqual({ cents: -10 })
    expect(parseSignedCents('1 234,56')).toEqual({ cents: 123_456 })
    expect(parseSignedCents('0')).toHaveProperty('error')
    expect(parseSignedCents('abc')).toHaveProperty('error')
    expect(parseSignedCents('')).toHaveProperty('error')
  })
})
