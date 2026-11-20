import { describe, expect, it } from 'vitest'
import type { TransactionKind } from '#/api/types.gen'
import { isRefundPart, remainingCents, splitError } from './edits'

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

  it('refuses a transfer category beside income or expense ones (#357)', () => {
    const kinds: Record<string, TransactionKind> = {
      food: 'expense',
      refunds: 'income',
      moves: 'transfer',
    }
    const kindOf = (id: string) => kinds[id]
    const parts = (a: string, b: string) => [
      { categoryId: a, amountCents: 2_000 },
      { categoryId: b, amountCents: 4_000 },
    ]
    expect(splitError(6_000, parts('food', 'refunds'), kindOf)).toBeNull()
    expect(splitError(6_000, parts('food', 'moves'), kindOf)).toMatch(
      /mouvement interne/,
    )
    expect(splitError(6_000, parts('moves', 'moves'), kindOf)).toBeNull()
  })

  it('calls an incoming part in an expense category a refund (#357)', () => {
    const income = { amountCents: 6_000 }
    expect(isRefundPart(income, 'expense')).toBe(true)
    expect(isRefundPart(income, 'income')).toBe(false)
    expect(isRefundPart({ amountCents: -4_500 }, 'expense')).toBe(false)
  })
})
