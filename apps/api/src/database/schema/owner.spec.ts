import '#/load-env'
import { eq, sql } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setOwner } from '#/database/owner-scope'
import { asSpecOwner } from '#/database/testing/spec-owner'
import * as schema from './index'
import {
  accountsTable,
  appSettingsTable,
  categoriesTable,
  monthClosesTable,
  usersTable,
} from './index'

/**
 * Every private row names its owner (ADR 0009, #555). Synthetic rows only;
 * every test runs in a transaction that is rolled back.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

/**
 * Tables without an owner, on purpose (ADR 0009 §1): public market data, and
 * the identity tables, already per user and read before a user is known.
 */
const WITHOUT_OWNER = new Set([
  // Global reference data.
  'crypto_prices',
  'crypto_price_history',
  'crypto_asset_aliases',
  'securities',
  'security_prices',
  // Identity.
  'users',
  'refresh_tokens',
  'password_reset_tokens',
  'email_verification_tokens',
  'webauthn_credentials',
  'webauthn_challenges',
  'personal_access_tokens',
  'access_token_audit',
  'oauth_clients',
  'oauth_grants',
  'oauth_authorization_codes',
  'oauth_tokens',
  'oauth_audit',
])

describe.skipIf(!process.env.DATABASE_URL)('row owners (ADR 0009)', () => {
  let client: postgres.Sql
  let db: Db

  beforeAll(() => {
    client = postgres(process.env.DATABASE_URL!, { max: 1 })
    db = drizzle(client, { schema })
  })

  afterAll(async () => {
    await client.end()
  })

  async function inRollback(fn: (tx: Tx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await fn(tx)
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  async function user(tx: Tx, email: string) {
    const [created] = await tx
      .insert(usersTable)
      .values({ email, name: 'Utilisateur fictif' })
      .returning({ id: usersTable.id })
    return created.id
  }

  /** `write` fails with the Postgres error `code`, in a savepoint. */
  async function refused(
    tx: Tx,
    code: string,
    write: (nested: Tx) => Promise<unknown>,
  ) {
    await expect(
      tx.transaction(async (nested) => {
        await write(nested)
      }),
    ).rejects.toMatchObject({ cause: { code } })
  }

  it('gives every private table an owner that cannot be null', async () => {
    const tables = await db.execute<{
      table_name: string
      nullable: string | null
      fk_on_delete: string | null
    }>(sql`
      select t.table_name,
             c.is_nullable as nullable,
             (select rc.delete_rule
                from information_schema.key_column_usage k
                join information_schema.referential_constraints rc
                  on rc.constraint_name = k.constraint_name
               where k.table_name = t.table_name
                 and k.column_name = 'user_id'
                 and k.table_schema = 'public'
               limit 1) as fk_on_delete
        from information_schema.tables t
        left join information_schema.columns c
          on c.table_schema = t.table_schema
         and c.table_name = t.table_name
         and c.column_name = 'user_id'
       where t.table_schema = 'public'
         and t.table_type = 'BASE TABLE'
         and t.table_name <> '__drizzle_migrations'
       order by t.table_name
    `)
    const unowned = tables
      .filter((t) => !WITHOUT_OWNER.has(t.table_name))
      .filter((t) => t.nullable !== 'NO' || t.fk_on_delete !== 'CASCADE')
      .map((t) => t.table_name)
    // A new private table needs `userId: ownerColumn()`; a new global or
    // identity table goes in WITHOUT_OWNER with its reason (ADR 0009 §1).
    expect(unowned).toEqual([])
    expect(tables.filter((t) => !WITHOUT_OWNER.has(t.table_name))).toHaveLength(
      37,
    )
  })

  it('fills the owner from the request scope', async () => {
    await inRollback(async (tx) => {
      const first = await user(tx, 'premier@capi.test')
      const second = await user(tx, 'second@capi.test')
      await setOwner(tx, second)
      const [created] = await tx
        .insert(accountsTable)
        .values({ name: 'Compte fictif', type: 'checking' })
        .returning({ userId: accountsTable.userId })
      expect(created.userId).toBe(second)
      expect(created.userId).not.toBe(first)
    })
  })

  it('falls back to the only user until the request scope exists (#557)', async () => {
    await inRollback(async (tx) => {
      const only = await user(tx, 'seul@capi.test')
      const [created] = await tx
        .insert(accountsTable)
        .values({ name: 'Compte fictif', type: 'checking' })
        .returning({ userId: accountsTable.userId })
      expect(created.userId).toBe(only)
    })
  })

  it('refuses a row without an owner when several users exist', async () => {
    await inRollback(async (tx) => {
      await user(tx, 'premier@capi.test')
      await user(tx, 'second@capi.test')
      await refused(tx, '23502', (nested) =>
        nested
          .insert(accountsTable)
          .values({ name: 'Compte fictif', type: 'checking' }),
      )
    })
  })

  it('deletes what a user owns with the user', async () => {
    await inRollback(async (tx) => {
      const owner = await asSpecOwner(tx)
      await tx
        .insert(accountsTable)
        .values({ name: 'Compte fictif', type: 'checking' })
      await tx.delete(usersTable).where(eq(usersTable.id, owner))
      const left = await tx
        .select()
        .from(accountsTable)
        .where(eq(accountsTable.userId, owner))
      expect(left).toEqual([])
    })
  })

  it('keeps slugs, setting keys and months unique per user, not across users', async () => {
    await inRollback(async (tx) => {
      const first = await user(tx, 'premier@capi.test')
      const second = await user(tx, 'second@capi.test')
      for (const owner of [first, second]) {
        await setOwner(tx, owner)
        await tx.insert(categoriesTable).values({
          slug: 'courses-fictives',
          name: 'Courses fictives',
          kind: 'expense',
        })
        await tx
          .insert(appSettingsTable)
          .values({ key: 'savings.monthly_target_cents', value: 10_000 })
        await tx.insert(monthClosesTable).values({ month: '2026-10' })
      }
      await refused(tx, '23505', (nested) =>
        nested.insert(categoriesTable).values({
          slug: 'courses-fictives',
          name: 'Autres courses fictives',
          kind: 'expense',
        }),
      )
      await refused(tx, '23505', (nested) =>
        nested
          .insert(appSettingsTable)
          .values({ key: 'savings.monthly_target_cents', value: 1 }),
      )
      await refused(tx, '23505', (nested) =>
        nested.insert(monthClosesTable).values({ month: '2026-10' }),
      )
    })
  })
})
