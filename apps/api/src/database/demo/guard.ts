/**
 * Where `pnpm db:demo` may write. The demo seed wipes data (`--reset`) and
 * fills a database with synthetic data and a test account whose password is
 * public, so it only ever targets throwaway databases (`finances_demo`, the
 * specs' `finances_test`): never production, never the owner's `finances`.
 *
 * The one exception is staging (#421): it runs the production images
 * (`NODE_ENV=production`), gets the demo data when its database is empty
 * and keeps its data between deploys, reset only on demand (#494). There the
 * seed runs only on the database its compose override names in
 * `DEMO_STAGING_DATABASE`, a name ending in `_staging`; `finances` stays
 * refused whatever the variable says.
 */

/** Databases the demo seed refuses, whatever the server. */
export const PROTECTED_DATABASE_NAMES: ReadonlySet<string> = new Set([
  'finances',
])

/** What a staging database's name looks like (`finances_staging`). */
export const STAGING_DATABASE_PATTERN = /^[a-z0-9_]+_staging$/

export class DemoTargetError extends Error {}

/** Database name of a `postgres://` URL (`finances_demo`), `''` without one. */
export function databaseNameOf(databaseUrl: string): string {
  try {
    return decodeURIComponent(new URL(databaseUrl).pathname.slice(1))
  } catch {
    return ''
  }
}

/**
 * Throws a `DemoTargetError` with a message for the terminal when the demo
 * seed must not run against `databaseUrl`: without a database name, on a
 * protected database, or in production unless the database is the staging
 * one named by `stagingDatabase` (`DEMO_STAGING_DATABASE`).
 */
export function assertDemoTarget(
  databaseUrl: string,
  nodeEnv: string | undefined,
  stagingDatabase?: string,
): string {
  const name = databaseNameOf(databaseUrl)
  if (!name) {
    throw new DemoTargetError(
      'Refusing to seed demo data: DATABASE_URL names no database.',
    )
  }
  if (PROTECTED_DATABASE_NAMES.has(name.toLowerCase())) {
    throw new DemoTargetError(
      `Refusing to seed demo data into "${name}": it is the app database. ` +
        'Use a throwaway one, e.g. `createdb finances_demo` and ' +
        'DATABASE_URL=postgres://user:password@localhost:5432/finances_demo.',
    )
  }
  if (nodeEnv === 'production' && !isStagingDatabase(name, stagingDatabase)) {
    throw new DemoTargetError(
      'Refusing to seed demo data with NODE_ENV=production ' +
        '(only the staging database named by DEMO_STAGING_DATABASE).',
    )
  }
  return name
}

/** Whether `name` is the staging database `stagingDatabase` names. */
function isStagingDatabase(
  name: string,
  stagingDatabase: string | undefined,
): boolean {
  return (
    stagingDatabase !== undefined &&
    name === stagingDatabase &&
    STAGING_DATABASE_PATTERN.test(name)
  )
}
