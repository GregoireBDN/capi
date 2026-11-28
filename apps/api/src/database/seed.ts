import '#/load-env'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { seedDefaultCategories } from '#/categories/seed-default-categories'
import { env } from '#/config/env'
import { setOwner } from '#/database/owner-scope'
import { usersTable } from '#/user/user.schema'
import * as schema from './schema'

/**
 * Seeds reference data (`pnpm db:seed`): each user's default categories. Idempotent: safe to run any number
 * of times, it only inserts what is missing. Run after `pnpm db:migrate`.
 */
async function seed() {
  const client = postgres(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, {
    max: 1,
  })
  try {
    const db = drizzle(client, { schema })
    // Every user has their own categories (ADR 0009); a new user gets them
    // at sign-up, so an instance without users seeds nothing.
    const users = await db.select({ id: usersTable.id }).from(usersTable)
    const totals = { inserted: 0, skipped: 0, deleted: 0, iconsFilled: 0 }
    for (const user of users) {
      const result = await db.transaction(async (tx) => {
        await setOwner(tx, user.id)
        return seedDefaultCategories(tx, user.id)
      })
      totals.inserted += result.inserted
      totals.skipped += result.skipped
      totals.deleted += result.deleted
      totals.iconsFilled += result.iconsFilled
    }
    console.log(
      `Default categories for ${users.length} user(s): ${totals.inserted} inserted, ${totals.skipped} already present, ${totals.deleted} deleted by the user, ${totals.iconsFilled} icons filled in.`,
    )
  } finally {
    await client.end()
  }
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
