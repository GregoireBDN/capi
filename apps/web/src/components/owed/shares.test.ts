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
  it('counts each share minus the part let go (#437)', () => {
    const share = (amountCents: number, forgivenCents = 0) => ({
      direction: 'owed_to_me',
      amountCents,
      forgivenCents,
    })
    // One repaid, one let go entirely.
    expect(othersPartCents({ shares: [share(3000), share(3000, 3000)] })).toBe(
      3000,
    )
    // 60 €, 20 € let go: 40 € still carried by Sam (repaid or claimed).
    expect(othersPartCents({ shares: [share(6000, 2000)] })).toBe(4000)
  })
})
