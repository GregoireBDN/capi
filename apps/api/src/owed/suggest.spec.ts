import { describe, expect, it } from 'vitest'
import { labelMatches, suggestRepayment } from './suggest'

const rent = { id: 'rent', date: '2026-10-01', leftCents: 40000 }
const energy = { id: 'energy', date: '2026-10-05', leftCents: 6000 }
const dinner = { id: 'dinner', date: '2026-10-12', leftCents: 3000 }

describe('suggestRepayment', () => {
  it('ticks the oldest items that add up exactly', () => {
    expect(suggestRepayment(46000, [dinner, energy, rent])).toEqual({
      links: [
        { receivableId: 'rent', amountCents: 40000 },
        { receivableId: 'energy', amountCents: 6000 },
      ],
      exact: true,
    })
  })

  it('prefers older items among exact combinations', () => {
    const older = { id: 'older', date: '2026-09-01', leftCents: 3000 }
    expect(suggestRepayment(3000, [dinner, older]).links).toEqual([
      { receivableId: 'older', amountCents: 3000 },
    ])
  })

  it('else the closest without going over', () => {
    const result = suggestRepayment(17000, [
      { id: 'a', date: '2026-10-01', leftCents: 10000 },
      { id: 'b', date: '2026-10-02', leftCents: 6000 },
      { id: 'c', date: '2026-10-03', leftCents: 9000 },
    ])
    expect(result.exact).toBe(false)
    expect(result.links.map((link) => link.receivableId)).toEqual(['a', 'b'])
  })

  it('suggests nothing when every item is larger than the transfer', () => {
    expect(suggestRepayment(1000, [rent])).toEqual({ links: [], exact: false })
  })
})

describe('labelMatches', () => {
  it('ignores case and accents', () => {
    expect(labelMatches('VIR SEPA CAMILLE DUPRE', ['Camille Dupré'])).toBe(true)
    expect(labelMatches('VIR SEPA ALEX', ['camille'])).toBe(false)
    expect(labelMatches('VIR', [' '])).toBe(false)
  })
})
