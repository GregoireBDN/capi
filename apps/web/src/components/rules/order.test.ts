import { describe, expect, it } from 'vitest'
import { moveById, moveItem, moveOnto } from './order'

const rules = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
const ids = (items: { id: string }[]) => items.map((item) => item.id).join('')

describe('rule order', () => {
  it('moves an item and clamps the target', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b', 'c'], 1, 9)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b', 'c'], 5, 0)).toEqual(['a', 'b', 'c'])
  })

  it('moves one step up or down, and not past the ends', () => {
    expect(ids(moveById(rules, 'c', -1))).toBe('acbd')
    expect(ids(moveById(rules, 'c', 1))).toBe('abdc')
    expect(ids(moveById(rules, 'a', -1))).toBe('abcd')
    expect(ids(moveById(rules, 'd', 1))).toBe('abcd')
    expect(ids(moveById(rules, 'x', 1))).toBe('abcd')
  })

  it('drops a dragged rule in the place of the one it is dropped on', () => {
    expect(ids(moveOnto(rules, 'd', 'b'))).toBe('adbc')
    expect(ids(moveOnto(rules, 'a', 'c'))).toBe('bcad')
    expect(ids(moveOnto(rules, 'b', 'b'))).toBe('abcd')
  })

  it('never loses or duplicates a rule', () => {
    const moved = moveOnto(moveById(rules, 'b', 1), 'a', 'd')
    expect([...ids(moved)].sort().join('')).toBe('abcd')
  })
})
