/**
 * Test database for the API integration specs.
 *
 * Specs must never run against the database the app uses (`DATABASE_URL`,
 * usually read from `.env`), which holds real financial data. They use
 * `TEST_DATABASE_URL` instead, defaulting to the app database name with a
 * `_test` suffix on the same server (`finances` → `finances_test`).
 *
 * `vitest.config.ts` passes the resolved URL to the workers as `DATABASE_URL`,
 * and this file's default export (Vitest global setup) creates the database if
 * needed and applies the Drizzle migrations before the run. Postgres must be
 * running (`docker compose up -d`): leaving `DATABASE_URL` unset to skip the
 * database specs would let them fall back to `.env`, i.e. the real database.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { ensureAppRole } from './src/database/app-role'

const DEV_DATABASE_URL = 'postgres://user:password@localhost:5432/finances'
const API_ROOT = dirname(fileURLToPath(import.meta.url))

/** Reads `DATABASE_URL` from `apps/api/.env` without loading it into `process.env`. */
function readDotEnvDatabaseUrl(): string | undefined {
  const path = resolve(API_ROOT, '.env')
  if (!existsSync(path)) return undefined
  return parseEnv(readFileSync(path, 'utf8')).DATABASE_URL || undefined
}

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1))
}

function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${encodeURIComponent(name)}`
  return parsed.toString()
}

function sameDatabase(a: string, b: string): boolean {
  const ua = new URL(a)
  const ub = new URL(b)
  const port = (u: URL) => u.port || '5432'
  return (
    ua.hostname === ub.hostname &&
    port(ua) === port(ub) &&
    databaseName(a) === databaseName(b)
  )
}

/** Returns the URL the specs must use; throws if it is the application database. */
export function resolveTestDatabaseUrl(): string {
  const appUrl =
    process.env.DATABASE_URL || readDotEnvDatabaseUrl() || DEV_DATABASE_URL
  const testUrl =
    process.env.TEST_DATABASE_URL ||
    withDatabaseName(appUrl, `${databaseName(appUrl)}_test`)

  if (sameDatabase(testUrl, appUrl)) {
    throw new Error(
      `The test database "${databaseName(testUrl)}" is the application database. ` +
        'Point TEST_DATABASE_URL at a dedicated database: integration specs delete rows.',
    )
  }
  return testUrl
}

export default async function setup(): Promise<void> {
  const url = resolveTestDatabaseUrl()
  const name = databaseName(url)
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Unsupported test database name "${name}"`)
  }

  const admin = postgres(withDatabaseName(url, 'postgres'), {
    max: 1,
    onnotice: () => {},
  })
  try {
    const existing =
      await admin`select 1 from pg_database where datname = ${name}`
    if (existing.length === 0) await admin.unsafe(`create database "${name}"`)
  } catch (error) {
    throw new Error(
      `Cannot prepare the test database "${name}" (${(error as Error).message}). ` +
        'Start Postgres with `docker compose up -d`.',
    )
  } finally {
    await admin.end()
  }

  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(API_ROOT, 'drizzle'),
    })
    // The API's role, for the specs that read as it (#557).
    await ensureAppRole(client)
  } finally {
    await client.end()
  }
}
