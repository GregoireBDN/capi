import { describe, expect, it } from 'vitest'
import { planOffset } from './offset'

describe('planOffset (#484)', () => {
  it('settles the smaller side on both, oldest items first', () => {
    const plan = planOffset([
      { id: 'b', direction: 'owed_to_me', date: '2026-10-05', leftCents: 2500 },
      { id: 'a', direction: 'owed_to_me', date: '2026-10-01', leftCents: 1500 },
      { id: 'c', direction: 'i_owe', date: '2026-10-03', leftCents: 2500 },
    ])
    expect(plan).toEqual({
      owedToMeCents: 4000,
      iOweCents: 2500,
      amountCents: 2500,
      items: [
        { receivableId: 'a', amountCents: 1500 },
        { receivableId: 'b', amountCents: 1000 },
        { receivableId: 'c', amountCents: 2500 },
      ],
    })
  })

  it('offers nothing when one side is empty or settled', () => {
    const plan = planOffset([
      { id: 'a', direction: 'owed_to_me', date: '2026-10-01', leftCents: 4000 },
      { id: 'b', direction: 'i_owe', date: '2026-10-02', leftCents: 0 },
    ])
    expect(plan.amountCents).toBe(0)
    expect(plan.items).toEqual([])
  })
})
