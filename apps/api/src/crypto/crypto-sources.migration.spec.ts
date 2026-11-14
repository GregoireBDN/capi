import '#/load-env'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Migration 0018 (crypto account sources), applied to tables in the state it
 * expects, in a scratch Postgres schema inside a transaction that is rolled
 * back: the migrated test database and the other specs are left alone.
 * Synthetic rows only.
 */

const MIGRATION = resolve(
  __dirname,
  '../../drizzle/0018_crypto_account_sources.sql',
)
const SCHEMA = 'migration_0018'
const ROLLBACK = Symbol('rollback')

describe.skipIf(!process.env.DATABASE_URL)(
  'migration 0018: crypto account sources (database)',
  () => {
    let client: postgres.Sql

    beforeAll(() => {
      client = postgres(process.env.DATABASE_URL!, {
        max: 1,
        onnotice: () => {},
      })
    })

    afterAll(async () => {
      await client.end()
    })

    /** Tables as they were before 0017, holding synthetic legacy rows. */
    async function legacyTables(sql: postgres.TransactionSql) {
      await sql.unsafe(`
        CREATE SCHEMA ${SCHEMA};
        SET LOCAL search_path TO ${SCHEMA}, public;
        CREATE TABLE ${SCHEMA}.accounts (LIKE public.accounts INCLUDING DEFAULTS);
        ALTER TABLE ${SCHEMA}.accounts
          DROP COLUMN crypto_source,
          DROP COLUMN crypto_provider,
          DROP COLUMN crypto_synced_at,
          ADD PRIMARY KEY (id);
        CREATE TABLE ${SCHEMA}.crypto_holdings (LIKE public.crypto_holdings INCLUDING DEFAULTS);
        ALTER TABLE ${SCHEMA}.crypto_holdings
          DROP COLUMN origin,
          ADD CONSTRAINT crypto_holdings_account_asset_location_unique
            UNIQUE (account_id, asset_id, location);
      `)
      const [checking] = await sql`
        INSERT INTO accounts (name, type) VALUES ('Test checking', 'checking')
        RETURNING id`
      const [crypto] = await sql`
        INSERT INTO accounts (name, type, institution)
        VALUES ('Test wallet', 'crypto', 'Fake exchange') RETURNING id`
      const [archived] = await sql`
        INSERT INTO accounts (name, type, archived_at)
        VALUES ('Old wallet', 'crypto', now()) RETURNING id`
      await sql`
        INSERT INTO crypto_holdings (account_id, asset_id, symbol, name, quantity, location, invested_cents)
        VALUES (${crypto.id}, 'bitcoin', 'BTC', 'Bitcoin', '0.123456789012345678', 'Fake wallet', 50000)`
      return {
        checkingId: checking.id as string,
        cryptoId: crypto.id as string,
        archivedId: archived.id as string,
      }
    }

    async function migrate(sql: postgres.TransactionSql) {
      const statements = readFileSync(MIGRATION, 'utf8')
        .replaceAll('"public".', `"${SCHEMA}".`)
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter(Boolean)
      for (const statement of statements) await sql.unsafe(statement)
    }

    async function inRollback(
      fn: (sql: postgres.TransactionSql) => Promise<void>,
    ) {
      await client
        .begin(async (sql) => {
          await fn(sql)
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    it('makes existing crypto accounts manual and keeps their holdings', async () => {
      await inRollback(async (sql) => {
        const ids = await legacyTables(sql)
        await migrate(sql)

        const accounts = await sql`
          SELECT id, type, institution, crypto_source, crypto_provider, crypto_synced_at
          FROM accounts ORDER BY name`
        const byId = new Map(accounts.map((row) => [row.id as string, row]))
        expect(byId.get(ids.cryptoId)).toMatchObject({
          crypto_source: 'manual',
          crypto_provider: null,
          crypto_synced_at: null,
          institution: 'Fake exchange',
        })
        expect(byId.get(ids.archivedId)).toMatchObject({
          crypto_source: 'manual',
        })
        expect(byId.get(ids.checkingId)).toMatchObject({
          crypto_source: null,
          crypto_provider: null,
        })

        const holdings = await sql`
          SELECT quantity, location, invested_cents, origin FROM crypto_holdings`
        expect(holdings).toEqual([
          {
            quantity: '0.123456789012345678',
            location: 'Fake wallet',
            invested_cents: '50000',
            origin: 'manual',
          },
        ])
      })
    })

    it('enforces a source on crypto accounts only and a provider on exchanges only', async () => {
      await inRollback(async (sql) => {
        await legacyTables(sql)
        await migrate(sql)

        const fails = async (query: string) => {
          await sql.unsafe('SAVEPOINT attempt')
          await expect(sql.unsafe(query)).rejects.toMatchObject({
            code: '23514',
          })
          await sql.unsafe('ROLLBACK TO SAVEPOINT attempt')
        }
        await fails(`INSERT INTO accounts (name, type) VALUES ('x', 'crypto')`)
        await fails(
          `INSERT INTO accounts (name, type, crypto_source) VALUES ('x', 'checking', 'manual')`,
        )
        await fails(
          `INSERT INTO accounts (name, type, crypto_source) VALUES ('x', 'crypto', 'exchange')`,
        )
        await fails(
          `INSERT INTO accounts (name, type, crypto_source, crypto_provider) VALUES ('x', 'crypto', 'wallet', 'binance')`,
        )
        await sql.unsafe(
          `INSERT INTO accounts (name, type, crypto_source, crypto_provider) VALUES ('x', 'crypto', 'exchange', 'binance')`,
        )
      })
    })

    it('lets an imported line sit next to a manual line of the same asset and place', async () => {
      await inRollback(async (sql) => {
        const { cryptoId } = await legacyTables(sql)
        await migrate(sql)

        await sql`
          INSERT INTO crypto_holdings (account_id, asset_id, symbol, name, quantity, location, origin)
          VALUES (${cryptoId}, 'bitcoin', 'BTC', 'Bitcoin', '1', 'Fake wallet', 'import')`
        await sql.unsafe('SAVEPOINT attempt')
        await expect(
          sql`
            INSERT INTO crypto_holdings (account_id, asset_id, symbol, name, quantity, location, origin)
            VALUES (${cryptoId}, 'bitcoin', 'BTC', 'Bitcoin', '2', 'Fake wallet', 'import')`,
        ).rejects.toMatchObject({ code: '23505' })
        await sql.unsafe('ROLLBACK TO SAVEPOINT attempt')

        const [{ count }] = await sql`
          SELECT count(*)::int AS count FROM crypto_holdings WHERE account_id = ${cryptoId}`
        expect(count).toBe(2)
      })
    })
  },
)
