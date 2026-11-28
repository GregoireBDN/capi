import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
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
  'insert' | 'select' | 'update'
>

export interface SeedDefaultCategoriesResult {
  /** Categories created by this run. */
  inserted: number
  /** Default categories that already existed (left untouched). */
  skipped: number
  /** Default categories the user deleted (not created again). */
  deleted: number
  /** Existing default categories without an icon that got their default one. */
  iconsFilled: number
}

/**
 * Inserts the default categories that `userId` is missing, matched on
 * `slug` (ADR 0009: every user has their own categories). Called for each
 * user by `pnpm db:seed`, and at sign-up for the new user.
 *
 * Idempotent: uses `INSERT … ON CONFLICT (user_id, slug) DO NOTHING`, so running it
 * again inserts nothing. Existing rows are deliberately *not* updated: the
 * user may have renamed, recoloured or archived a default category, and
 * re-seeding must not clobber those edits. The one exception is the icon
 * (#287): an existing default category without one gets its default icon,
 * never replacing an icon already set. A default category the user deleted
 * is recorded in `deleted_default_categories` and never re-created.
 */
export async function seedDefaultCategories(
  db: SeedDb,
  userId: string,
): Promise<SeedDefaultCategoriesResult> {
  const deleted = new Set(
    (
      await db
        .select({ slug: deletedDefaultCategoriesTable.slug })
        .from(deletedDefaultCategoriesTable)
        .where(eq(deletedDefaultCategoriesTable.userId, userId))
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
          .values(wanted.map((category) => ({ ...category, userId })))
          .onConflictDoNothing({
            target: [categoriesTable.userId, categoriesTable.slug],
          })
          .returning({ slug: categoriesTable.slug })

  const iconsFilled =
    wanted.length === 0
      ? []
      : await db
          .update(categoriesTable)
          .set({
            icon: sql`case ${categoriesTable.slug} ${sql.join(
              wanted.map(
                (category) => sql`when ${category.slug} then ${category.icon}`,
              ),
              sql` `,
            )} end`,
          })
          .where(
            and(
              eq(categoriesTable.userId, userId),
              isNull(categoriesTable.icon),
              inArray(
                categoriesTable.slug,
                wanted.map((category) => category.slug),
              ),
            ),
          )
          .returning({ slug: categoriesTable.slug })

  return {
    inserted: inserted.length,
    skipped: wanted.length - inserted.length,
    deleted: DEFAULT_CATEGORIES.length - wanted.length,
    iconsFilled: iconsFilled.length,
  }
}
