import '#/load-env'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { seedDefaultCategories } from '#/categories/seed-default-categories'
import { env } from '#/config/env'
import * as schema from './schema'

/**
 * Seeds reference data (`pnpm db:seed`). Idempotent: safe to run any number
 * of times, it only inserts what is missing. Run after `pnpm db:migrate`.
 */
async function seed() {
  const client = postgres(env.DATABASE_URL, { max: 1 })
  try {
    const db = drizzle(client, { schema })
    const categories = await seedDefaultCategories(db)
    console.log(
      `Default categories: ${categories.inserted} inserted, ${categories.skipped} already present, ${categories.deleted} deleted by the user, ${categories.iconsFilled} icons filled in.`,
    )
  } finally {
    await client.end()
  }
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
