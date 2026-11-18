import { describe, expect, it } from 'vitest'
import { TRANSACTION_KINDS } from '#/database/schema/domain-enums'
import { insertCategorySchema } from './categories.schema'
import { CATEGORY_ICONS } from './category-icons'
import { DEFAULT_CATEGORIES } from './default-categories'

describe('DEFAULT_CATEGORIES', () => {
  it('has unique slugs', () => {
    const slugs = DEFAULT_CATEGORIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('has unique display names', () => {
    const names = DEFAULT_CATEGORIES.map((c) => c.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it.each(DEFAULT_CATEGORIES)('$slug is a valid category row', (category) => {
    expect(category.slug).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/)
    expect(TRANSACTION_KINDS).toContain(category.kind)
    expect(category.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(CATEGORY_ICONS).toContain(category.icon)
    expect(category.name.trim()).toBe(category.name)
    // Fits the column constraints (lengths, enum, not null).
    expect(() => insertCategorySchema.parse(category)).not.toThrow()
  })

  it('covers every group', () => {
    const kinds = new Set(DEFAULT_CATEGORIES.map((c) => c.kind))
    expect([...kinds].sort()).toEqual([...TRANSACTION_KINDS].sort())
  })
})
