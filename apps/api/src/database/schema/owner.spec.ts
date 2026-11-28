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
  balanceSnapshotsTable,
  categoriesTable,
  monthClosesTable,
  transactionsTable,
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
             (select case k.confdeltype when 'c' then 'CASCADE' else k.confdeltype::text end
                from pg_constraint k
               where k.conrelid = ('public.' || t.table_name)::regclass
                 and k.contype = 'f'
                 and k.confrelid = 'public.users'::regclass
                 and k.conkey = array[(select attnum from pg_attribute
                                        where attrelid = k.conrelid
                                          and attname = 'user_id')]
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
  it('pairs every link between private rows with a key on the owner', async () => {
    const links = await db.execute<{ link: string; paired: boolean }>(sql`
      select single.conrelid::regclass || '.' || a.attname as link,
             exists (
               select 1 from pg_constraint pair
                where pair.contype = 'f'
                  and pair.conrelid = single.conrelid
                  and pair.confrelid = single.confrelid
                  and pair.conkey = array[single.conkey[1],
                        (select attnum from pg_attribute
                          where attrelid = single.conrelid and attname = 'user_id')]
                  and pair.confdeltype = single.confdeltype
             ) as paired
        from pg_constraint single
        join pg_attribute a
          on a.attrelid = single.conrelid and a.attnum = single.conkey[1]
       where single.contype = 'f'
         and cardinality(single.conkey) = 1
         and a.attname <> 'user_id'
         and exists (select 1 from pg_attribute o
                      where o.attrelid = single.conrelid and o.attname = 'user_id')
         and exists (select 1 from pg_attribute o
                      where o.attrelid = single.confrelid and o.attname = 'user_id')
         and single.confrelid <> 'public.users'::regclass
       order by 1
    `)
    // A new link between private tables needs its composite key
    // `(x_id, user_id) -> parent (id, user_id)`, same ON DELETE (0059).
    const privateLinks = links.filter(
      (l) => !WITHOUT_OWNER.has(l.link.split('.')[0]),
    )
    expect(privateLinks.filter((l) => !l.paired).map((l) => l.link)).toEqual([])
    expect(privateLinks.length).toBeGreaterThanOrEqual(57)
  })

  it("refuses a row pointing at another user's row", async () => {
    await inRollback(async (tx) => {
      const first = await user(tx, 'premier@capi.test')
      const second = await user(tx, 'second@capi.test')
      await setOwner(tx, first)
      const [mine] = await tx
        .insert(accountsTable)
        .values({ name: 'Compte fictif', type: 'checking' })
        .returning({ id: accountsTable.id })
      const [category] = await tx
        .insert(categoriesTable)
        .values({
          slug: 'courses-fictives',
          name: 'Courses fictives',
          kind: 'expense',
        })
        .returning({ id: categoriesTable.id })
      await setOwner(tx, second)
      await refused(tx, '23503', (nested) =>
        nested.insert(balanceSnapshotsTable).values({
          accountId: mine.id,
          date: '2026-10-31',
          valueCents: 10_000,
        }),
      )
      const [theirs] = await tx
        .insert(accountsTable)
        .values({ name: 'Autre compte fictif', type: 'checking' })
        .returning({ id: accountsTable.id })
      await refused(tx, '23503', (nested) =>
        nested.insert(transactionsTable).values({
          accountId: theirs.id,
          categoryId: category.id,
          bookingDate: '2026-10-15',
          amountCents: -1_250,
          rawLabel: 'PAIEMENT FICTIF',
          kind: 'expense',
          manual: true,
          dedupeHash: 'manual:00000000-0000-4000-8000-000000000001',
        }),
      )
    })
  })

  it('keeps the owner when a deleted row clears a link', async () => {
    await inRollback(async (tx) => {
      const owner = await asSpecOwner(tx)
      const [checking, savings] = await tx
        .insert(accountsTable)
        .values([
          { name: 'Compte fictif', type: 'checking' },
          { name: 'Livret fictif', type: 'savings' },
        ])
        .returning({ id: accountsTable.id })
      const [transfer] = await tx
        .insert(transactionsTable)
        .values({
          accountId: checking.id,
          counterpartAccountId: savings.id,
          bookingDate: '2026-10-15',
          amountCents: -5_000,
          rawLabel: 'VIREMENT FICTIF',
          kind: 'transfer',
          manual: true,
          dedupeHash: 'manual:00000000-0000-4000-8000-000000000002',
        })
        .returning({ id: transactionsTable.id })
      await tx.delete(accountsTable).where(eq(accountsTable.id, savings.id))
      const [after] = await tx
        .select({
          counterpart: transactionsTable.counterpartAccountId,
          userId: transactionsTable.userId,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.id, transfer.id))
      expect(after).toEqual({ counterpart: null, userId: owner })
    })
  })
})
