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
 * - from a checkout: `pnpm --filter @capi/api exec tsx src/database/migrate.ts`.
 *
 * Idempotent: already applied migrations are skipped. Prints no data, only
 * the counts a migration reports.
 */

/** `drizzle/` from both `src/database/` (tsx) and `dist/database/` (compiled). */
export const MIGRATIONS_FOLDER = resolve(__dirname, '../../drizzle')

/** Prefix of the NOTICEs a migration raises to be printed. */
const MIGRATION_NOTICE_PREFIX = 'finances: '

async function main() {
  // One connection. Silence the NOTICEs Postgres sends for `IF NOT EXISTS`;
  // print only the ones a migration raises for the owner (`finances: …`,
  // counts and never data, e.g. the rows #368 put in review).
  const client = postgres(env.DATABASE_URL, {
    max: 1,
    onnotice: (notice) => {
      if (notice.message?.startsWith(MIGRATION_NOTICE_PREFIX)) {
        console.log(notice.message.slice(MIGRATION_NOTICE_PREFIX.length))
      }
    },
  })
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
