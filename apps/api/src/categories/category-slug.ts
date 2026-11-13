/** Longest generated base slug, leaving room for a `_<n>` suffix (column: 64). */
const BASE_MAX = 56

/**
 * Slug of a new category from its display name: ASCII lowercase snake_case
 * (`Vélo & sport` → `velo_sport`), or `category` when nothing is left.
 */
export function slugifyCategoryName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, BASE_MAX)
    .replace(/^_+|_+$/g, '')
  return base || 'category'
}

/**
 * A slug for `name` that is not in `taken` (existing slugs plus the reserved
 * default slugs): the base slug, else the first free `<base>_2`, `<base>_3`…
 */
export function generateCategorySlug(
  name: string,
  taken: ReadonlySet<string>,
): string {
  const base = slugifyCategoryName(name)
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`
    if (!taken.has(candidate)) return candidate
  }
}
