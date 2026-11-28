import '#/load-env'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Migration 0044 (#373, #370): the data it moves, run again on synthetic
 * rows inside a transaction that is rolled back. The test database is
 * already migrated, so the rules that refuse the old shapes (a base on a
 * crypto account, a computed withdrawal cost) are dropped first, in the
 * same transaction. Synthetic rows only.
 */

const MIGRATION = resolve(
  __dirname,
  '../../drizzle/0044_cost_follows_coins.sql',
)
const ROLLBACK = Symbol('rollback')

/** The statements between `-- data: begin` and `-- data: end`. */
function dataStatements(): string[] {
  const text = readFileSync(MIGRATION, 'utf8')
  const block = text.slice(
    text.indexOf('-- data: begin'),
    text.indexOf('-- data: end'),
  )
  return block
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

describe.skipIf(!process.env.DATABASE_URL)(
  'migration 0044: the cost follows the coins (database)',
  () => {
    let client: postgres.Sql
    const notices: string[] = []

    beforeAll(() => {
      client = postgres(process.env.DATABASE_URL!, {
        max: 1,
        onnotice: (notice) => notices.push(notice.message ?? ''),
      })
    })

    afterAll(async () => {
      await client.end()
    })

    it('moves a single-asset base to its opening, drops the others, keeps typed figures only', async () => {
      await client
        .begin(async (sql) => {
          await sql.unsafe(`
            ALTER TABLE accounts DROP CONSTRAINT accounts_invested_base_type;
            ALTER TABLE crypto_movements DROP CONSTRAINT crypto_movements_given_cost;
          `)
          // Rows need an owner since 0058 (ADR 0009).
          const [owner] = await sql`
            INSERT INTO users (email, name) VALUES ('spec-owner@capi.test', 'Spec owner')
            RETURNING id
          `
          await sql`select set_config('app.user_id', ${owner.id}, true)`
          const syncedAt = '2026-11-01T08:00:00Z'
          const [single] = await sql`
            INSERT INTO accounts (name, type, crypto_source, crypto_synced_at, invested_base_cents, invested_base_on)
            VALUES ('Ledger fictif', 'crypto', 'wallet', ${syncedAt}, 500000, '2026-06-30') RETURNING id`
          const [several] = await sql`
            INSERT INTO accounts (name, type, crypto_source, crypto_synced_at, invested_base_cents, invested_base_on)
            VALUES ('Trezor fictif', 'crypto', 'wallet', ${syncedAt}, 300000, '2026-06-30') RETURNING id`
          const [manual] = await sql`
            INSERT INTO accounts (name, type, crypto_source)
            VALUES ('Saisie fictive', 'crypto', 'manual') RETURNING id`
          const [exchange] = await sql`
            INSERT INTO accounts (name, type, crypto_source, crypto_provider)
            VALUES ('Plateforme fictive', 'crypto', 'exchange', 'coinbase') RETURNING id`
          let place = 0
          const holding = (
            accountId: string,
            assetId: string,
            symbol: string,
            quantity: string,
            origin: string,
            investedCents: number | null = null,
          ) => sql`
            INSERT INTO crypto_holdings (account_id, asset_id, symbol, name, quantity, location, origin, invested_cents)
            VALUES (${accountId}, ${assetId}, ${symbol}, ${symbol}, ${quantity}, ${`Lieu ${++place}`}, ${origin}, ${investedCents})`
          await holding(single.id, 'bitcoin', 'BTC', '0.4', 'sync')
          await holding(single.id, 'bitcoin', 'BTC', '0.3', 'sync')
          await holding(several.id, 'bitcoin', 'BTC', '0.1', 'sync')
          await holding(several.id, 'ethereum', 'ETH', '2', 'sync')
          await holding(manual.id, 'bitcoin', 'BTC', '0.05', 'manual', 100000)
          await holding(manual.id, 'ethereum', 'ETH', '1', 'manual')
          const [imported] = await sql`
            INSERT INTO crypto_imports (account_id, format, file_name, file_hash, committed_at)
            VALUES (${exchange.id}, 'coinbase_csv', 'export-fictif.csv', 'fixture', now()) RETURNING id`
          const withdrawal = (day: string, cost: number, n: number) => sql`
            INSERT INTO crypto_movements (account_id, import_id, occurred_at, operation, kind, asset, quantity, counterpart_account_id, cost_cents, dedupe_hash)
            VALUES (${exchange.id}, ${imported.id}, ${day}, 'Send', 'withdrawal', 'BTC', '-0.1', ${single.id}, ${cost}, ${`fixture-${n}`})`
          // Linked to the Ledger before the base's day (in it) and after.
          await withdrawal('2026-05-10T10:00:00Z', 70000, 1)
          await withdrawal('2026-08-02T10:00:00Z', 40000, 2)
          await sql`
            INSERT INTO balance_snapshots (account_id, date, value_cents, contributions_cents, source)
            VALUES (${single.id}, '2026-10-31', 600000, 540000, 'computed')`

          notices.length = 0
          for (const statement of dataStatements()) await sql.unsafe(statement)

          const openings = await sql`
            SELECT account_id, asset_id, quantity::text, resolution, cost_cents, occurred_at, observed_since
            FROM crypto_movements WHERE kind = 'observed_in' ORDER BY account_id, asset_id`
          const of = (accountId: string, assetId: string) =>
            openings.find(
              (row) => row.account_id === accountId && row.asset_id === assetId,
            )
          // The Ledger: one opening of 0.7 BTC at its last sync, its base
          // less the coins linked up to the base's day.
          expect(of(single.id, 'bitcoin')).toMatchObject({
            quantity: '0.700000000000000000',
            resolution: 'bought',
            cost_cents: '430000',
            observed_since: null,
          })
          expect(of(single.id, 'bitcoin')!.occurred_at).toEqual(
            new Date(syncedAt),
          )
          // Several assets: nothing to move, asked again.
          expect(of(several.id, 'bitcoin')?.resolution).toBeNull()
          expect(of(several.id, 'ethereum')?.resolution).toBeNull()
          // A manual account's typed amounts answer its openings.
          expect(of(manual.id, 'bitcoin')).toMatchObject({
            resolution: 'bought',
            cost_cents: '100000',
          })
          expect(of(manual.id, 'ethereum')?.resolution).toBeNull()

          const bases = await sql`
            SELECT count(*)::int AS n FROM accounts
            WHERE type = 'crypto' AND invested_base_cents IS NOT NULL`
          expect(bases[0].n).toBe(0)
          const costs = await sql`
            SELECT count(*)::int AS n FROM crypto_movements
            WHERE kind = 'withdrawal' AND cost_cents IS NOT NULL`
          expect(costs[0].n).toBe(0)
          const [snapshot] = await sql`
            SELECT contributions_cents FROM balance_snapshots WHERE account_id = ${single.id}`
          expect(snapshot.contributions_cents).toBeNull()
          const [read] = await sql`
            SELECT crypto_observed_at FROM accounts WHERE id = ${single.id}`
          expect(read.crypto_observed_at).toEqual(new Date(syncedAt))
          // Counts only, for the owner.
          expect(notices).toContain(
            "finances: 1 crypto invested amount(s) moved to their asset's opening cost (#373)",
          )
          expect(notices).toContain(
            'finances: 1 crypto invested amount(s) on several assets to type again per asset in « À préciser » (#373)',
          )
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    })
  },
)
