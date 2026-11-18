import { describe, expect, it } from 'vitest'
import type { CategoryDto } from '#/api/types.gen'
import { pickableCategories } from './categories'

function category(id: string, archivedAt: string | null): CategoryDto {
  return {
    id,
    slug: id,
    name: id,
    kind: 'expense',
    color: null,
    icon: null,
    archivedAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('pickableCategories', () => {
  const active = category('active', null)
  const archived = category('archived', '2026-10-01T00:00:00.000Z')

  it('hides archived categories', () => {
    expect(pickableCategories([active, archived])).toEqual([active])
    expect(pickableCategories([active, archived], null)).toEqual([active])
  })

  it('keeps the archived category currently selected', () => {
    expect(pickableCategories([active, archived], 'archived')).toEqual([
      active,
      archived,
    ])
  })
})
