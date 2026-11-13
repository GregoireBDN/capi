import type { CategoryDto } from '#/api/types.gen'

/**
 * Categories offered by a picker: archived ones are hidden, except the one
 * currently selected so an existing value still shows.
 */
export function pickableCategories(
  categories: readonly CategoryDto[],
  selectedId?: string | null,
): CategoryDto[] {
  return categories.filter(
    (category) => !category.archivedAt || category.id === selectedId,
  )
}
