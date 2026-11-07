import '#/load-env'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { env } from '#/config/env'

/**
 * Applies the pending Drizzle migrations (`apps/api/drizzle/`) with Drizzle's
 * runtime migrator, so production doesn't need `drizzle-kit` (a dev
 * dependency, absent from the API image). Same journal and history table as
 * `pnpm db:migrate`, so both can be used on the same database.
 *
 * - production image: `node dist/database/migrate.js` (the image ships the
 *   `drizzle/` folder next to `dist/`);
 * - from a checkout: `pnpm --filter @finances/api exec tsx src/database/migrate.ts`.
 *
 * Idempotent: already applied migrations are skipped. Prints no data.
 */

/** `drizzle/` from both `src/database/` (tsx) and `dist/database/` (compiled). */
export const MIGRATIONS_FOLDER = resolve(__dirname, '../../drizzle')

async function main() {
  // One connection; silence the NOTICEs Postgres sends for `IF NOT EXISTS`.
  const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER })
    console.log('Migrations applied.')
  } finally {
    await client.end()
  }
}

main().catch((err: unknown) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
