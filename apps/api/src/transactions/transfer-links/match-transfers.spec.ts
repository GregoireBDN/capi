import { describe, expect, it } from 'vitest'
import { matchTransfers, type TransferSide } from './match-transfers'

const CHECKING = 'acc-checking'
const LIVRET = 'acc-livret'
const LIVRET_JEUNE = 'acc-livret-jeune'

function side(
  id: string,
  accountId: string,
  bookingDate: string,
  amountCents: number,
): TransferSide {
  return { id, accountId, bookingDate, amountCents }
}

describe('matchTransfers', () => {
  it('pairs opposite amounts on two accounts within 3 days', () => {
    const out = side('t1', CHECKING, '2026-10-01', -200_00)
    const arrival = side('t2', LIVRET, '2026-10-03', 200_00)
    expect(matchTransfers([out], [out, arrival])).toEqual([
      { out, in: arrival },
    ])
    // Either side may be the new one.
    expect(matchTransfers([arrival], [out])).toEqual([{ out, in: arrival }])
  })

  it('leaves rows further apart than 3 days, on the same account, or of another amount', () => {
    const out = side('t1', CHECKING, '2026-10-01', -200_00)
    expect(
      matchTransfers(
        [out],
        [
          side('t2', LIVRET, '2026-10-05', 200_00),
          side('t3', CHECKING, '2026-10-01', 200_00),
          side('t4', LIVRET, '2026-10-01', 199_99),
          side('t5', LIVRET, '2026-10-01', -200_00),
        ],
      ),
    ).toEqual([])
  })

  it('takes the closest candidate', () => {
    const out = side('t1', CHECKING, '2026-10-10', -50_00)
    const near = side('t3', LIVRET, '2026-10-11', 50_00)
    const far = side('t2', LIVRET_JEUNE, '2026-10-08', 50_00)
    expect(matchTransfers([out], [far, near])).toEqual([{ out, in: near }])
  })

  it('does not guess between two accounts as close', () => {
    const out = side('t1', CHECKING, '2026-10-10', -100_00)
    expect(
      matchTransfers(
        [out],
        [
          side('t2', LIVRET, '2026-10-10', 100_00),
          side('t3', LIVRET_JEUNE, '2026-10-10', 100_00),
        ],
      ),
    ).toEqual([])
  })

  it('pairs identical transfers one to one', () => {
    const out1 = side('a1', CHECKING, '2026-10-10', -100_00)
    const out2 = side('a2', CHECKING, '2026-10-10', -100_00)
    const in1 = side('b1', LIVRET, '2026-10-10', 100_00)
    const in2 = side('b2', LIVRET, '2026-10-11', 100_00)
    const pairs = matchTransfers([out1, out2], [in1, in2])
    expect(pairs).toEqual([
      { out: out1, in: in1 },
      { out: out2, in: in2 },
    ])
  })

  it('never matches a zero amount', () => {
    expect(
      matchTransfers(
        [side('t1', CHECKING, '2026-10-10', 0)],
        [side('t2', LIVRET, '2026-10-10', 0)],
      ),
    ).toEqual([])
  })
})
