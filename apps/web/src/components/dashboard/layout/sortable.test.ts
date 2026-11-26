import { describe, expect, it } from 'vitest'
import { dropIndex, reorder } from './sortable'

describe('reorder', () => {
  it('moves an item down or up, the others keeping their order', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(reorder(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('leaves the list as it is when nothing moves', () => {
    const list = ['a', 'b']
    expect(reorder(list, 1, 1)).toEqual(list)
    expect(reorder(list, 5, 0)).toEqual(list)
  })
})

describe('dropIndex', () => {
  const rows = [0, 50, 100, 150].map((top) => ({ top, height: 50 }))

  it('stays in place until an edge passes its neighbour’s middle', () => {
    expect(dropIndex(rows, 1, 0)).toBe(1)
    expect(dropIndex(rows, 1, 24)).toBe(1)
    expect(dropIndex(rows, 1, -24)).toBe(1)
    expect(dropIndex(rows, 1, -26)).toBe(0)
  })

  it('lands where its middle is, down or up, within the list', () => {
    expect(dropIndex(rows, 1, 26)).toBe(2)
    expect(dropIndex(rows, 1, 120)).toBe(3)
    expect(dropIndex(rows, 1, 900)).toBe(3)
    expect(dropIndex(rows, 2, -60)).toBe(1)
    expect(dropIndex(rows, 2, -900)).toBe(0)
  })
})
