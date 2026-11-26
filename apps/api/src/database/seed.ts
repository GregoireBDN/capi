import '#/load-env'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { seedDefaultCategories } from '#/categories/seed-default-categories'
import { env } from '#/config/env'
import { convertAndRemoveSavingsGoals } from '#/envelopes/convert-goals'
import { todayInParis } from '#/recurring/dates'
import * as schema from './schema'

/**
 * Seeds reference data (`pnpm db:seed`). Idempotent: safe to run any number
 * of times, it only inserts what is missing, and converts the savings goals
 * left into envelopes (#430). Run after `pnpm db:migrate`.
 */
async function seed() {
  const client = postgres(env.DATABASE_URL, { max: 1 })
  try {
    const db = drizzle(client, { schema })
    const categories = await seedDefaultCategories(db)
    console.log(
      `Default categories: ${categories.inserted} inserted, ${categories.skipped} already present, ${categories.deleted} deleted by the user, ${categories.iconsFilled} icons filled in.`,
    )
    // Savings goals become envelopes (#430, ADR 0008 §13), once.
    const goals = await convertAndRemoveSavingsGoals(db, todayInParis())
    if (goals.converted > 0) {
      console.log(
        `Savings goals converted into envelopes: ${goals.converted}${goals.unplacedCents > 0 ? ' (part of a goal typed by hand found no account with enough « libre »: set it aside again from the envelope page)' : ''}.`,
      )
    }
  } finally {
    await client.end()
  }
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
