import { describe, expect, it } from 'vitest'
import { generateCategorySlug, slugifyCategoryName } from './category-slug'

describe('slugifyCategoryName', () => {
  it('makes ASCII snake_case from a French name', () => {
    expect(slugifyCategoryName('Vélo & sport')).toBe('velo_sport')
    expect(slugifyCategoryName('  Œuvres d’art  ')).toBe('oeuvres_d_art')
    expect(slugifyCategoryName('Crèche (2e enfant)')).toBe('creche_2e_enfant')
  })

  it('falls back to `category` when nothing is left', () => {
    expect(slugifyCategoryName('€€€')).toBe('category')
    expect(slugifyCategoryName('🙂')).toBe('category')
  })

  it('stays short enough for a numeric suffix', () => {
    const slug = slugifyCategoryName('a'.repeat(100))
    expect(slug).toHaveLength(56)
    expect(`${slug}_99`.length).toBeLessThanOrEqual(64)
  })
})

describe('generateCategorySlug', () => {
  it('uses the base slug when it is free', () => {
    expect(generateCategorySlug('Vélo', new Set(['rent']))).toBe('velo')
  })

  it('adds the first free numeric suffix', () => {
    expect(
      generateCategorySlug('Transport', new Set(['transport', 'transport_2'])),
    ).toBe('transport_3')
  })
})
