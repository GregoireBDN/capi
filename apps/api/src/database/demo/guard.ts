/**
 * Where `pnpm db:demo` may write. The demo seed wipes data (`--reset`) and
 * fills a database with synthetic data and a test account whose password is
 * public, so it only ever targets throwaway databases (`finances_demo`, the
 * specs' `finances_test`): never production, never the owner's `finances`.
 */

/** Databases the demo seed refuses, whatever the server. */
export const PROTECTED_DATABASE_NAMES: ReadonlySet<string> = new Set([
  'finances',
])

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
 * seed must not run against `databaseUrl`: in production, without a database
 * name, or on a protected database.
 */
export function assertDemoTarget(
  databaseUrl: string,
  nodeEnv: string | undefined,
): string {
  if (nodeEnv === 'production') {
    throw new DemoTargetError(
      'Refusing to seed demo data with NODE_ENV=production.',
    )
  }
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
  return name
}
