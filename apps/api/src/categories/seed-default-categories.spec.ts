import '#/load-env'
import { eq, inArray } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  categoriesTable,
  deletedDefaultCategoriesTable,
} from './categories.schema'
import { DEFAULT_CATEGORIES } from './default-categories'
import { seedDefaultCategories } from './seed-default-categories'

/**
 * Integration checks against the migrated database (see
 * `domain-schema.spec.ts`). Every test empties the categories table inside a
 * transaction that is rolled back, so the local database is left untouched.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

describe.skipIf(!process.env.DATABASE_URL)(
  'seedDefaultCategories (database)',
  () => {
    let client: postgres.Sql
    let db: Db

    beforeAll(() => {
      client = postgres(process.env.DATABASE_URL!, { max: 1 })
      db = drizzle(client, { schema })
    })

    afterAll(async () => {
      await client.end()
    })

    /** Runs `fn` on an empty categories table, then rolls everything back. */
    async function withEmptyCategories(fn: (tx: Tx) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          await tx.delete(categoriesTable)
          await tx.delete(deletedDefaultCategoriesTable)
          await fn(tx)
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    it('inserts every default category on an empty table', async () => {
      await withEmptyCategories(async (tx) => {
        const result = await seedDefaultCategories(tx)

        expect(result).toEqual({
          inserted: DEFAULT_CATEGORIES.length,
          skipped: 0,
          deleted: 0,
          iconsFilled: 0,
        })
        const rows = await tx
          .select({
            slug: categoriesTable.slug,
            name: categoriesTable.name,
            kind: categoriesTable.kind,
            color: categoriesTable.color,
            icon: categoriesTable.icon,
          })
          .from(categoriesTable)
        expect(rows).toEqual(expect.arrayContaining([...DEFAULT_CATEGORIES]))
        expect(rows).toHaveLength(DEFAULT_CATEGORIES.length)
      })
    })

    it('is a no-op the second time and keeps user edits', async () => {
      await withEmptyCategories(async (tx) => {
        await seedDefaultCategories(tx)
        await tx
          .update(categoriesTable)
          .set({ name: 'Supermarché', color: '#000000' })
          .where(eq(categoriesTable.slug, 'groceries'))

        const result = await seedDefaultCategories(tx)

        expect(result).toEqual({
          inserted: 0,
          skipped: DEFAULT_CATEGORIES.length,
          deleted: 0,
          iconsFilled: 0,
        })
        const rows = await tx.select().from(categoriesTable)
        expect(rows).toHaveLength(DEFAULT_CATEGORIES.length)
        expect(rows.find((r) => r.slug === 'groceries')).toMatchObject({
          name: 'Supermarché',
          color: '#000000',
        })
      })
    })

    it('fills a missing default icon and keeps a chosen one', async () => {
      await withEmptyCategories(async (tx) => {
        await seedDefaultCategories(tx)
        await tx
          .update(categoriesTable)
          .set({ icon: null })
          .where(inArray(categoriesTable.slug, ['groceries', 'rent']))
        await tx
          .update(categoriesTable)
          .set({ icon: 'gift' })
          .where(eq(categoriesTable.slug, 'restaurants_cafes'))
        await tx.insert(categoriesTable).values({
          slug: 'test_no_icon',
          name: 'Test sans icône',
          kind: 'expense',
          color: '#2a78d6',
        })

        const result = await seedDefaultCategories(tx)

        expect(result.iconsFilled).toBe(2)
        const rows = await tx.select().from(categoriesTable)
        const icon = (slug: string) => rows.find((r) => r.slug === slug)?.icon
        const wanted = (slug: string) =>
          DEFAULT_CATEGORIES.find((c) => c.slug === slug)?.icon
        expect(icon('groceries')).toBe(wanted('groceries'))
        expect(icon('rent')).toBe(wanted('rent'))
        expect(icon('restaurants_cafes')).toBe('gift')
        expect(icon('test_no_icon')).toBeNull()
        expect(rows.every((r) => r.slug === 'test_no_icon' || r.icon)).toBe(
          true,
        )
      })
    })

    it('keeps custom and archived categories as they are', async () => {
      await withEmptyCategories(async (tx) => {
        await seedDefaultCategories(tx)
        const archivedAt = new Date('2026-02-01T10:00:00Z')
        await tx
          .update(categoriesTable)
          .set({ archivedAt, kind: 'transfer' })
          .where(eq(categoriesTable.slug, 'gifts'))
        await tx.insert(categoriesTable).values({
          slug: 'test_custom',
          name: 'Test custom',
          kind: 'expense',
          color: '#2a78d6',
        })

        const result = await seedDefaultCategories(tx)

        expect(result).toEqual({
          inserted: 0,
          skipped: DEFAULT_CATEGORIES.length,
          deleted: 0,
          iconsFilled: 0,
        })
        const rows = await tx.select().from(categoriesTable)
        expect(rows).toHaveLength(DEFAULT_CATEGORIES.length + 1)
        expect(rows.find((r) => r.slug === 'gifts')).toMatchObject({
          archivedAt,
          kind: 'transfer',
        })
        expect(rows.find((r) => r.slug === 'test_custom')).toMatchObject({
          name: 'Test custom',
        })
      })
    })

    it('does not re-create a default category the user deleted', async () => {
      await withEmptyCategories(async (tx) => {
        await seedDefaultCategories(tx)
        await tx.delete(categoriesTable).where(eq(categoriesTable.slug, 'rent'))
        await tx.insert(deletedDefaultCategoriesTable).values({ slug: 'rent' })

        const result = await seedDefaultCategories(tx)

        expect(result).toEqual({
          inserted: 0,
          skipped: DEFAULT_CATEGORIES.length - 1,
          deleted: 1,
          iconsFilled: 0,
        })
        const rows = await tx.select().from(categoriesTable)
        expect(rows.map((r) => r.slug)).not.toContain('rent')
      })
    })

    it('only re-creates the missing categories', async () => {
      await withEmptyCategories(async (tx) => {
        await seedDefaultCategories(tx)
        await tx.delete(categoriesTable).where(eq(categoriesTable.slug, 'rent'))

        const result = await seedDefaultCategories(tx)

        expect(result).toEqual({
          inserted: 1,
          skipped: DEFAULT_CATEGORIES.length - 1,
          deleted: 0,
          iconsFilled: 0,
        })
        const rows = await tx.select().from(categoriesTable)
        expect(rows).toHaveLength(DEFAULT_CATEGORIES.length)
      })
    })
  },
)
