import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import { categoriesTable } from './categories.schema'
import { DEFAULT_CATEGORIES } from './default-categories'

/** A Drizzle database or transaction. */
export type SeedDb = Pick<PostgresJsDatabase<typeof schema>, 'insert'>

export interface SeedDefaultCategoriesResult {
  /** Categories created by this run. */
  inserted: number
  /** Default categories that already existed (left untouched). */
  skipped: number
}

/**
 * Inserts the default categories that are missing, matched on `slug`.
 *
 * Idempotent: uses `INSERT … ON CONFLICT (slug) DO NOTHING`, so running it
 * again inserts nothing. Existing rows are deliberately *not* updated: the
 * user may have renamed or recoloured a default category, and re-seeding must
 * not clobber those edits. A category the user deleted is re-created on the
 * next run.
 */
export async function seedDefaultCategories(
  db: SeedDb,
): Promise<SeedDefaultCategoriesResult> {
  const inserted = await db
    .insert(categoriesTable)
    .values(DEFAULT_CATEGORIES.map((category) => ({ ...category })))
    .onConflictDoNothing({ target: categoriesTable.slug })
    .returning({ slug: categoriesTable.slug })

  return {
    inserted: inserted.length,
    skipped: DEFAULT_CATEGORIES.length - inserted.length,
  }
}
