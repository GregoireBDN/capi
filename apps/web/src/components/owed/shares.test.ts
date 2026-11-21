import { describe, expect, it } from 'vitest'
import { divideHalfEven, myPartOf, othersPartCents, partOf } from './shares'

describe('shares', () => {
  it('splits a 95 € dinner between three, the rest on the owner', () => {
    expect(partOf('equal', 9500, 2)).toBe(3167)
    expect(9500 - 2 * 3167).toBe(3166)
    expect(partOf('half', 9000, 1)).toBe(4500)
    expect(partOf('amount', 9000, 1)).toBeNull()
  })

  it('« Quelqu’un a payé pour moi »: 90 € between 3, 100 € between 3, half of 90 €', () => {
    expect(myPartOf('equal', 9000, 3)).toBe(3000)
    expect(myPartOf('equal', 10000, 3)).toBe(3333)
    expect(myPartOf('half', 9000, 3)).toBe(4500)
  })

  it('rounds half to even', () => {
    expect(divideHalfEven(9001, 2)).toBe(4500)
    expect(divideHalfEven(9003, 2)).toBe(4502)
  })
})

describe('othersPartCents', () => {
  it('counts a share let go only for what was repaid on it', () => {
    const share = (state: string, amountCents: number, repaidCents = 0) => ({
      direction: 'owed_to_me',
      state,
      amountCents,
      repaidCents,
    })
    expect(
      othersPartCents({
        shares: [share('repaid', 3000, 3000), share('forgiven', 3000)],
      }),
    ).toBe(3000)
    expect(othersPartCents({ shares: [share('forgiven', 3000, 1000)] })).toBe(
      1000,
    )
  })
})
