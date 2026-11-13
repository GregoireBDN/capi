import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import {
  categoriesTable,
  deletedDefaultCategoriesTable,
} from './categories.schema'
import { DEFAULT_CATEGORIES } from './default-categories'

/** A Drizzle database or transaction. */
export type SeedDb = Pick<
  PostgresJsDatabase<typeof schema>,
  'insert' | 'select'
>

export interface SeedDefaultCategoriesResult {
  /** Categories created by this run. */
  inserted: number
  /** Default categories that already existed (left untouched). */
  skipped: number
  /** Default categories the user deleted (not created again). */
  deleted: number
}

/**
 * Inserts the default categories that are missing, matched on `slug`.
 *
 * Idempotent: uses `INSERT … ON CONFLICT (slug) DO NOTHING`, so running it
 * again inserts nothing. Existing rows are deliberately *not* updated: the
 * user may have renamed, recoloured or archived a default category, and
 * re-seeding must not clobber those edits. A default category the user
 * deleted is recorded in `deleted_default_categories` and never re-created.
 */
export async function seedDefaultCategories(
  db: SeedDb,
): Promise<SeedDefaultCategoriesResult> {
  const deleted = new Set(
    (
      await db
        .select({ slug: deletedDefaultCategoriesTable.slug })
        .from(deletedDefaultCategoriesTable)
    ).map((row) => row.slug),
  )
  const wanted = DEFAULT_CATEGORIES.filter(
    (category) => !deleted.has(category.slug),
  )
  const inserted =
    wanted.length === 0
      ? []
      : await db
          .insert(categoriesTable)
          .values(wanted.map((category) => ({ ...category })))
          .onConflictDoNothing({ target: categoriesTable.slug })
          .returning({ slug: categoriesTable.slug })

  return {
    inserted: inserted.length,
    skipped: wanted.length - inserted.length,
    deleted: DEFAULT_CATEGORIES.length - wanted.length,
  }
}
