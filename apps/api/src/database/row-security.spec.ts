import { sql } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APP_ROLE } from './app-role'
import { rowSecurityProblems } from './row-security'
import * as schema from './schema'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

describe.skipIf(!process.env.DATABASE_URL)('rowSecurityProblems (#558)', () => {
  let client: postgres.Sql
  let db: Db

  beforeAll(() => {
    client = postgres(process.env.DATABASE_URL!, {
      max: 1,
      onnotice: () => {},
    })
    db = drizzle(client, { schema })
  })

  afterAll(async () => {
    await client.end()
  })

  async function rolledBack(fn: (tx: Tx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await fn(tx)
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  it('finds nothing as the API role, on the migrated schema', async () => {
    await rolledBack(async (tx) => {
      await tx.execute(sql.raw(`set local role ${APP_ROLE}`))
      expect(await rowSecurityProblems(tx)).toEqual([])
    })
  })

  it('names a role that would bypass the policies', async () => {
    await rolledBack(async (tx) => {
      const [{ name, superuser }] = await tx.execute<{
        name: string
        superuser: boolean
      }>(
        sql`select current_user as name, rolsuper as superuser from pg_roles where rolname = current_user`,
      )
      const problems = await rowSecurityProblems(tx)
      expect(problems).toContain(
        superuser
          ? `role ${name} is a superuser`
          : expect.stringMatching(`role ${name} owns \\d+ tables`),
      )
    })
  })

  it('names a private table whose policies are off or missing', async () => {
    await rolledBack(async (tx) => {
      await tx.execute(sql`alter table accounts no force row level security`)
      await tx.execute(sql`alter table envelopes disable row level security`)
      await tx.execute(sql`drop policy contacts_owner on contacts`)
      await tx.execute(sql.raw(`set local role ${APP_ROLE}`))
      expect(await rowSecurityProblems(tx)).toEqual([
        'accounts: row-level security not forced',
        'contacts: no owner policy',
        'envelopes: row-level security disabled',
      ])
    })
  })
})
