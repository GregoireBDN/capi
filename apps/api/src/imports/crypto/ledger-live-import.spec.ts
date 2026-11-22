import '#/load-env'
import { BadRequestException } from '@nestjs/common'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import { CryptoCostBasisService } from '#/crypto/cost-basis.service'
import { CryptoPricesService } from '#/crypto/crypto-prices.service'
import { CryptoService } from '#/crypto/crypto.service'
import { CryptoDailyCloseService } from '#/crypto/daily-close/crypto-daily-close.service'
import { CryptoPriceHistoryService } from '#/crypto/daily-close/crypto-price-history.service'
import { pendingOf } from '#/crypto/pending/pending'
import type { PriceProvider } from '#/crypto/price-provider'
import { WalletSyncService } from '#/crypto/wallet-sync/wallet-sync.service'
import * as schema from '#/database/schema'
import { CryptoImportsService } from './crypto-imports.service'
import { txHashDigest } from './parsers/ledger-live.parser'
import {
  BINANCE_EARLY,
  binanceCsv,
  fakeHash,
  LEDGER_LIVE_LINES,
  type LedgerLiveLine,
  ledgerLiveCsv,
} from './testing/crypto-fixtures'

/**
 * A Ledger Live history imported into a wallet account (#426), against the
 * dedicated test database; every test is rolled back. Synthetic files only.
 */

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')
const NOW = new Date('2026-11-05T10:00:00Z')
const m = schema.cryptoMovementsTable

const file = (lines: LedgerLiveLine[]) => ({
  fileName: 'ledger-live-fictif.csv',
  buffer: Buffer.from(ledgerLiveCsv(lines), 'utf8'),
})
const BTC_LINES = LEDGER_LIVE_LINES.filter((line) => line[2] === 'BTC')

/** Reads of the wallet before the import (epoch ms). */
const READ_1 = new Date('2025-03-05T00:00:00Z')
const READ_2 = new Date('2025-03-11T00:00:00Z')
const READ_3 = new Date('2025-03-25T00:00:00Z')

describe.skipIf(!process.env.DATABASE_URL)('Ledger Live imports (#426)', () => {
  let client: postgres.Sql
  let db: Db

  beforeAll(() => {
    client = postgres(process.env.DATABASE_URL!, { max: 1 })
    db = drizzle(client, { schema })
  })

  afterAll(async () => {
    await client.end()
  })

  interface Fixture {
    tx: Db
    imports: CryptoImportsService
    costBasis: CryptoCostBasisService
    wallet: string
    exchange: string
  }

  async function inRollback(fn: (f: Fixture) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        const database = { db: tx } as never
        const accounts = new AccountsService(database)
        const provider = {
          fetchEurPrices: vi.fn(() => Promise.resolve(new Map())),
          searchAssets: vi.fn(() => Promise.resolve([])),
        }
        const prices = new CryptoPricesService(database, {
          provider: provider as unknown as PriceProvider,
          ttlMs: 600_000,
        })
        const walletSync = new WalletSyncService(database, {
          bitcoin: null,
          evm: null,
          tokens: null,
          intervalMs: 600_000,
        })
        const crypto = new CryptoService(database, accounts, prices, walletSync)
        const dailyClose = new CryptoDailyCloseService(
          database,
          new CryptoPriceHistoryService(database, {
            provider: provider as unknown as PriceProvider,
            ttlMs: 600_000,
          }),
        )
        const costBasis = new CryptoCostBasisService(database)
        const imports = new CryptoImportsService(
          database,
          accounts,
          prices,
          crypto,
          dailyClose,
          costBasis,
        )
        const [wallet] = await tx
          .insert(schema.accountsTable)
          .values({ name: 'Ledger', type: 'crypto', cryptoSource: 'wallet' })
          .returning()
        const [exchange] = await tx
          .insert(schema.accountsTable)
          .values({
            name: 'Exchange',
            type: 'crypto',
            cryptoSource: 'exchange',
            cryptoProvider: 'coinbase',
          })
          .returning()
        await fn({
          tx: tx as unknown as Db,
          imports,
          costBasis,
          wallet: wallet.id,
          exchange: exchange.id,
        })
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  const movements = (tx: Db, accountId: string) =>
    tx
      .select()
      .from(m)
      .where(eq(m.accountId, accountId))
      .orderBy(asc(m.occurredAt), asc(m.quantity))

  /** Three reads of the wallet's Bitcoin, before any import. */
  async function readThreeTimes(tx: Db, wallet: string) {
    const observed = (
      at: Date,
      since: Date | null,
      quantity: string,
    ): typeof m.$inferInsert => ({
      accountId: wallet,
      occurredAt: at,
      observedSince: since,
      operation: since === null ? 'opening' : 'wallet_sync',
      kind: quantity.startsWith('-') ? 'observed_out' : 'observed_in',
      asset: 'BTC',
      assetId: 'bitcoin',
      quantity,
      dedupeHash: `observed:${at.toISOString()}`,
    })
    await tx
      .insert(m)
      .values([
        observed(READ_1, null, '0.01'),
        observed(READ_2, READ_1, '-0.002'),
        observed(READ_3, READ_2, '-0.00001'),
      ])
    await tx
      .update(schema.accountsTable)
      .set({ cryptoObservedAt: READ_3 })
      .where(eq(schema.accountsTable.id, wallet))
  }

  it('previews without writing, commits, and a re-import inserts nothing', async () => {
    await inRollback(async ({ tx, imports, wallet }) => {
      const preview = await imports.preview(
        { accountId: wallet, ...file(LEDGER_LIVE_LINES) },
        NOW,
      )
      expect(preview).toMatchObject({
        status: 'pending',
        format: 'ledger_live_csv',
        holdings: [],
        counts: { rows: 9, new: 9, duplicates: 0, issues: 0 },
      })
      expect(await movements(tx, wallet)).toEqual([])

      const committed = await imports.commit(preview.id, {}, NOW)
      expect(committed.counts.inserted).toBe(9)
      const rows = await movements(tx, wallet)
      expect(rows).toHaveLength(9)
      expect(
        rows.every((row) => /^[0-9a-f]{64}$/.test(row.txHashDigest!)),
      ).toBe(true)
      // The holdings stay what the chain says.
      expect(
        await tx
          .select()
          .from(schema.cryptoHoldingsTable)
          .where(eq(schema.cryptoHoldingsTable.accountId, wallet)),
      ).toEqual([])

      const again = await imports.preview(
        { accountId: wallet, ...file(LEDGER_LIVE_LINES) },
        NOW,
      )
      expect(again.counts).toMatchObject({ new: 0, duplicates: 9 })
      await imports.commit(again.id, {}, NOW)
      expect(await movements(tx, wallet)).toHaveLength(9)
    })
  })

  it('refuses an exchange export on a wallet and a Ledger Live one on an exchange', async () => {
    await inRollback(async ({ imports, wallet, exchange }) => {
      await expect(
        imports.preview(
          {
            accountId: wallet,
            fileName: 'binance.csv',
            buffer: Buffer.from(binanceCsv(BINANCE_EARLY)),
          },
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(
        imports.preview({ accountId: exchange, ...file(BTC_LINES) }, NOW),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  it('links a withdrawal carrying the same hash with no question asked', async () => {
    await inRollback(async ({ tx, imports, costBasis, wallet, exchange }) => {
      const [exchangeImport] = await tx
        .insert(schema.cryptoImportsTable)
        .values({
          accountId: exchange,
          format: 'coinbase_csv',
          fileName: 'export-fictif.csv',
          fileHash: 'fixture',
          committedAt: NOW,
        })
        .returning()
      // A withdrawal of another amount and day: only the hash says so.
      const [withdrawal] = await tx
        .insert(m)
        .values({
          accountId: exchange,
          importId: exchangeImport.id,
          occurredAt: new Date('2025-02-20T10:00:00Z'),
          operation: 'Send',
          kind: 'withdrawal',
          asset: 'BTC',
          quantity: '-0.0105',
          txHashDigest: txHashDigest(fakeHash(1)),
          dedupeHash: 'fixture-withdrawal',
        })
        .returning()

      const preview = await imports.preview(
        { accountId: wallet, ...file(BTC_LINES) },
        NOW,
      )
      await imports.commit(preview.id, {}, NOW)

      const [deposit] = await tx
        .select()
        .from(m)
        .where(and(eq(m.accountId, wallet), eq(m.kind, 'deposit')))
      const links = await tx.select().from(schema.cryptoTransferLinksTable)
      expect(links).toMatchObject([
        {
          outMovementId: withdrawal.id,
          inMovementId: deposit.id,
          matched: 'auto',
        },
      ])
      const basis = await costBasis.load(tx)
      const { items } = pendingOf(basis, wallet)
      expect(items.map((item) => item.movementId)).not.toContain(deposit.id)
      // The payment out is asked about.
      expect(items.map((item) => [item.type, item.quantity])).toEqual([
        ['departure', '0.002'],
      ])
    })
  })

  it('replaces the observed movements it explains, and undoing brings them back', async () => {
    await inRollback(async ({ tx, imports, costBasis, wallet }) => {
      await readThreeTimes(tx, wallet)
      const preview = await imports.preview(
        { accountId: wallet, ...file(BTC_LINES) },
        NOW,
      )
      await imports.commit(preview.id, {}, NOW)
      const observed = (await movements(tx, wallet)).filter(
        (row) => row.importId === null,
      )
      // The import explains every read: nothing is observed any more.
      expect(observed).toEqual([])

      // The next read finds what the import already counts: nothing new.
      await costBasis.observe(
        tx,
        wallet,
        [{ assetId: 'bitcoin', symbol: 'BTC', quantity: '0.00799' }],
        new Date('2025-04-01T00:00:00Z'),
        'wallet_sync',
      )
      expect(
        (await movements(tx, wallet)).filter((row) => row.importId === null),
      ).toEqual([])

      // The replay holds the chain's quantity, once.
      const basis = await costBasis.load(tx)
      expect(basis.pools.get(wallet)).toMatchObject([
        { assetId: 'bitcoin', quantity: '0.008' },
      ])

      // Undone, the reads explain it all again: what the chain held at the
      // reads still known (the last one here), from no previous read.
      await imports.remove(preview.id, NOW)
      const back = await movements(tx, wallet)
      expect(
        back.map((row) => [row.kind, row.quantity, row.observedSince]),
      ).toEqual([['observed_in', '0.007990000000000000', null]])
    })
  })

  it('undoes an import: the earliest read still known opens the account again', async () => {
    await inRollback(async ({ tx, imports, wallet }) => {
      await readThreeTimes(tx, wallet)
      const preview = await imports.preview(
        { accountId: wallet, ...file(BTC_LINES.slice(0, 2)) },
        NOW,
      )
      await imports.commit(preview.id, {}, NOW)
      // Only the last read is left observed (the move inside the wallet).
      await imports.remove(preview.id, NOW)
      const back = await movements(tx, wallet)
      expect(
        back.map((row) => [
          row.kind,
          row.quantity,
          row.observedSince,
          row.occurredAt,
        ]),
      ).toEqual([['observed_in', '0.007990000000000000', null, READ_3]])
    })
  })

  it('keeps observed what the import does not explain', async () => {
    await inRollback(async ({ tx, imports, wallet }) => {
      await readThreeTimes(tx, wallet)
      // Only the first operation: the payment out stays observed.
      const preview = await imports.preview(
        { accountId: wallet, ...file(BTC_LINES.slice(0, 1)) },
        NOW,
      )
      await imports.commit(preview.id, {}, NOW)
      const observed = (await movements(tx, wallet)).filter(
        (row) => row.importId === null,
      )
      expect(observed.map((row) => [row.occurredAt, row.quantity])).toEqual([
        [READ_2, '-0.002000000000000000'],
        [READ_3, '-0.000010000000000000'],
      ])
    })
  })

  it('balances an asset the reads never saw: the wallet holds what the chain says', async () => {
    await inRollback(async ({ tx, imports, wallet }) => {
      await readThreeTimes(tx, wallet)
      const preview = await imports.preview(
        { accountId: wallet, ...file(LEDGER_LIVE_LINES) },
        NOW,
      )
      await imports.commit(preview.id, {}, NOW)
      const observed = await tx
        .select({ asset: m.asset, quantity: m.quantity, at: m.occurredAt })
        .from(m)
        .where(
          and(
            eq(m.accountId, wallet),
            inArray(m.kind, ['observed_in', 'observed_out']),
          ),
        )
        .orderBy(asc(m.asset))
      expect(observed).toEqual([
        { asset: 'ETH', quantity: '-0.500700000000000000', at: READ_3 },
        { asset: 'USDT', quantity: '-25.000000000000000000', at: READ_3 },
      ])
    })
  })
})
