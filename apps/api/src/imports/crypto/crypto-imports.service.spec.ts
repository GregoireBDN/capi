import '#/load-env'
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import { CryptoPricesService } from '#/crypto/crypto-prices.service'
import { CryptoService } from '#/crypto/crypto.service'
import { CryptoDailyCloseService } from '#/crypto/daily-close/crypto-daily-close.service'
import { CryptoPriceHistoryService } from '#/crypto/daily-close/crypto-price-history.service'
import type { PriceProvider } from '#/crypto/price-provider'
import { WalletSyncService } from '#/crypto/wallet-sync/wallet-sync.service'
import * as schema from '#/database/schema'
import type { CryptoExchangeProvider } from '#/database/schema/domain-enums'
import { CryptoImportsService } from './crypto-imports.service'
import {
  BINANCE_EARLY,
  BINANCE_EARLY_BALANCES,
  BINANCE_LATE,
  binanceCsv,
  COINBASE_2025,
  COINBASE_HOLDER,
  COINBASE_USER_ID,
  coinbaseCsv,
} from './testing/crypto-fixtures'

/**
 * Integration checks against the dedicated test database (see
 * `vitest.config.ts`). Every test runs in a transaction that is rolled back.
 * Synthetic exports only; the price provider is a mock.
 */

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')
const NOW = new Date('2026-11-05T10:00:00Z')
const PRICES: Record<string, string> = {
  bitcoin: '60000',
  ethereum: '2500',
  tether: '0.9',
  'render-token': '4',
  binancecoin: '500',
  solana: '150',
  'xyz-token': '2',
}

const file = (text: string, fileName = 'export.csv') => ({
  fileName,
  buffer: Buffer.from(text, 'utf8'),
})

describe.skipIf(!process.env.DATABASE_URL)(
  'CryptoImportsService (database)',
  () => {
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
      crypto: CryptoService
      accounts: AccountsService
      provider: {
        fetchEurPrices: ReturnType<typeof vi.fn>
        searchAssets: ReturnType<typeof vi.fn>
      }
      exchange: (provider?: CryptoExchangeProvider) => Promise<string>
    }

    async function inRollback(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          const database = { db: tx } as never
          const accounts = new AccountsService(database)
          const provider = {
            fetchEurPrices: vi.fn((ids: readonly string[]) =>
              Promise.resolve(
                new Map(
                  ids
                    .filter((id) => id in PRICES)
                    .map((id) => [id, PRICES[id]] as const),
                ),
              ),
            ),
            searchAssets: vi.fn((query: string) =>
              Promise.resolve(
                query === 'XYZ'
                  ? [
                      {
                        id: 'xyz-fake',
                        symbol: 'xyz',
                        name: 'Fake',
                        rank: 900,
                      },
                      { id: 'xyz-token', symbol: 'xyz', name: 'XYZ', rank: 50 },
                      { id: 'xyzz', symbol: 'xyzz', name: 'Other', rank: 1 },
                    ]
                  : [],
              ),
            ),
          }
          const prices = new CryptoPricesService(database, {
            provider: provider as PriceProvider,
            ttlMs: 600_000,
          })
          const walletSync = new WalletSyncService(database, {
            bitcoin: null,
            evm: null,
            tokens: null,
            intervalMs: 600_000,
          })
          const crypto = new CryptoService(
            database,
            accounts,
            prices,
            walletSync,
          )
          const dailyClose = new CryptoDailyCloseService(
            database,
            new CryptoPriceHistoryService(database, {
              provider: provider as PriceProvider,
              ttlMs: 600_000,
            }),
          )
          const imports = new CryptoImportsService(
            database,
            accounts,
            prices,
            crypto,
            dailyClose,
          )
          const exchange = async (
            cryptoProvider: CryptoExchangeProvider = 'binance',
          ) =>
            (
              await accounts.create({
                name: 'Exchange',
                type: 'crypto',
                cryptoSource: 'exchange',
                cryptoProvider,
              })
            ).id
          await fn({
            tx: tx as unknown as Db,
            imports,
            crypto,
            accounts,
            provider,
            exchange,
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    const quantities = async (tx: Db, accountId: string) => {
      const rows = await tx
        .select()
        .from(schema.cryptoHoldingsTable)
        .where(eq(schema.cryptoHoldingsTable.accountId, accountId))
      return Object.fromEntries(
        rows
          .filter((row) => row.origin === 'import')
          .map((row) => [row.assetId, row.quantity.replace(/\.?0+$/, '')]),
      )
    }

    it('previews without writing anything but the pending import', async () => {
      await inRollback(async ({ tx, imports, exchange }) => {
        const accountId = await exchange()
        const preview = await imports.preview(
          { accountId, ...file(binanceCsv(BINANCE_EARLY)) },
          NOW,
        )
        expect(preview).toMatchObject({
          status: 'pending',
          format: 'binance_csv',
          counts: {
            rows: BINANCE_EARLY.length,
            new: BINANCE_EARLY.length,
            duplicates: 0,
            issues: 0,
            inserted: 0,
          },
          periodStart: '2025-01-10T09:00:00.000Z',
          periodEnd: '2025-02-07T14:00:00.000Z',
          unknownOperations: [{ operation: 'Mystery Bonus', count: 1 }],
          unmappedTickers: [],
        })
        expect(preview.rows).toHaveLength(BINANCE_EARLY.length)
        expect(
          Object.fromEntries(
            preview.holdings.map((holding) => [
              holding.assetId,
              holding.quantity,
            ]),
          ),
        ).toEqual(BINANCE_EARLY_BALANCES)
        expect(await tx.select().from(schema.cryptoMovementsTable)).toEqual([])
        expect(await quantities(tx, accountId)).toEqual({})
      })
    })

    it('commits: holdings match the balances, re-import adds nothing', async () => {
      await inRollback(async ({ tx, imports, crypto, exchange }) => {
        const accountId = await exchange()
        const first = await imports.preview(
          { accountId, ...file(binanceCsv(BINANCE_EARLY)) },
          NOW,
        )
        const committed = await imports.commit(first.id, {}, NOW)
        expect(committed).toMatchObject({
          status: 'committed',
          counts: { inserted: BINANCE_EARLY.length, duplicates: 0 },
          rows: [],
        })
        expect(committed.holdings.length).toBeGreaterThan(0)
        expect(await quantities(tx, accountId)).toEqual(BINANCE_EARLY_BALANCES)
        // The movements are the record: the stored preview is dropped (#367).
        const [stored] = await tx
          .select({ preview: schema.cryptoImportsTable.preview })
          .from(schema.cryptoImportsTable)
          .where(eq(schema.cryptoImportsTable.id, first.id))
        expect(stored.preview).toBeNull()

        const [account] = await tx
          .select()
          .from(schema.accountsTable)
          .where(eq(schema.accountsTable.id, accountId))
        expect(account.cryptoSyncedAt).toEqual(NOW)
        // Nothing stored (#366): today's value is live, and the history is
        // rebuilt from the movements by the daily close.
        const snapshots = await tx
          .select()
          .from(schema.balanceSnapshotsTable)
          .where(eq(schema.balanceSnapshotsTable.accountId, accountId))
        expect(snapshots).toEqual([])
        expect((await crypto.holdings(accountId, NOW)).snapshot).toEqual({
          date: '2026-11-05',
          // 0.001992 × 60000 + 0.01 × 2500 + 1.5 × 0.9 + 10 × 4 + 0.00000001 × 500
          valueCents: 11952 + 2500 + 135 + 4000 + 0,
          contributionsCents: null,
        })
        expect((await crypto.holdings(accountId, NOW)).complete).toBe(true)

        const again = await imports.preview(
          { accountId, ...file(binanceCsv(BINANCE_EARLY)) },
          NOW,
        )
        expect(again.counts).toMatchObject({
          new: 0,
          duplicates: BINANCE_EARLY.length,
        })
        const second = await imports.commit(again.id, {}, NOW)
        expect(second.counts.inserted).toBe(0)
        expect(await quantities(tx, accountId)).toEqual(BINANCE_EARLY_BALANCES)
        const movements = await tx.select().from(schema.cryptoMovementsTable)
        expect(movements).toHaveLength(BINANCE_EARLY.length)
      })
    })

    it('imports an overlapping export: only the new lines', async () => {
      await inRollback(async ({ tx, imports, exchange }) => {
        const accountId = await exchange()
        const first = await imports.preview(
          { accountId, ...file(binanceCsv(BINANCE_EARLY)) },
          NOW,
        )
        await imports.commit(first.id, {}, NOW)
        const late = await imports.preview(
          { accountId, ...file(binanceCsv(BINANCE_LATE), 'later.csv') },
          NOW,
        )
        expect(late.counts).toMatchObject({ new: 4, duplicates: 6 })
        await imports.commit(late.id, {}, NOW)
        expect(await quantities(tx, accountId)).toEqual({
          ...BINANCE_EARLY_BALANCES,
          ethereum: '0.05',
          solana: '2.5',
        })
        const [eth] = await tx
          .select()
          .from(schema.cryptoHoldingsTable)
          .where(
            and(
              eq(schema.cryptoHoldingsTable.accountId, accountId),
              eq(schema.cryptoHoldingsTable.assetId, 'ethereum'),
            ),
          )
        // 25.05 € left from the conversion + 100.10 € spent.
        expect(eth.investedCents).toBe(2505 + 10010)
      })
    })

    it('never touches the holdings typed by hand', async () => {
      await inRollback(async ({ tx, imports, crypto, exchange }) => {
        const accountId = await exchange()
        const manual = await crypto.create(
          accountId,
          {
            assetId: 'bitcoin',
            symbol: 'BTC',
            name: 'Bitcoin',
            quantity: '0.5',
            investedCents: 100,
          },
          NOW,
        )
        const preview = await imports.preview(
          { accountId, ...file(binanceCsv(BINANCE_EARLY)) },
          NOW,
        )
        await imports.commit(preview.id, {}, NOW)
        const rows = await tx
          .select()
          .from(schema.cryptoHoldingsTable)
          .where(
            and(
              eq(schema.cryptoHoldingsTable.accountId, accountId),
              eq(schema.cryptoHoldingsTable.assetId, 'bitcoin'),
            ),
          )
        expect(
          rows.map((row) => [row.origin, row.quantity.replace(/\.?0+$/, '')]),
        ).toEqual(
          expect.arrayContaining([
            ['manual', '0.5'],
            ['import', '0.001992'],
          ]),
        )
        expect(rows.find((row) => row.origin === 'manual')?.id).toBe(manual.id)
      })
    })

    it('undoes a committed import and discards a pending one', async () => {
      await inRollback(async ({ tx, imports, exchange }) => {
        const accountId = await exchange()
        const first = await imports.preview(
          { accountId, ...file(binanceCsv(BINANCE_EARLY)) },
          NOW,
        )
        await imports.commit(first.id, {}, NOW)
        const late = await imports.preview(
          { accountId, ...file(binanceCsv(BINANCE_LATE)) },
          NOW,
        )
        await imports.commit(late.id, {}, NOW)

        expect(await imports.remove(late.id, NOW)).toEqual({
          deletedMovements: 4,
        })
        expect(await quantities(tx, accountId)).toEqual(BINANCE_EARLY_BALANCES)

        const pending = await imports.preview(
          { accountId, ...file(binanceCsv(BINANCE_LATE)) },
          NOW,
        )
        expect(await imports.remove(pending.id, NOW)).toEqual({
          deletedMovements: 0,
        })
        await expect(imports.findOne(pending.id)).rejects.toThrow(
          NotFoundException,
        )

        await imports.remove(first.id, NOW)
        expect(await quantities(tx, accountId)).toEqual({})
      })
    })

    it('imports Coinbase: preamble never stored, tickers looked up', async () => {
      await inRollback(async ({ tx, imports, provider, exchange }) => {
        const accountId = await exchange('coinbase')
        const preview = await imports.preview(
          { accountId, ...file(coinbaseCsv(COINBASE_2025)) },
          NOW,
        )
        // Only the ticker is sent; the best-ranked exact match wins.
        expect(provider.searchAssets).toHaveBeenCalledWith('XYZ')
        expect(preview.unmappedTickers).toEqual([])
        expect(preview.unknownOperations).toEqual([
          { operation: 'Mystery Airdrop', count: 1 },
        ])
        await imports.commit(preview.id, {}, NOW)
        expect(await quantities(tx, accountId)).toEqual({
          bitcoin: '0.000301',
          ethereum: '0.0051',
          solana: '2',
          'xyz-token': '5',
        })
        const [alias] = await tx
          .select()
          .from(schema.cryptoAssetAliasesTable)
          .where(eq(schema.cryptoAssetAliasesTable.ticker, 'XYZ'))
        expect(alias).toMatchObject({ assetId: 'xyz-token', symbol: 'XYZ' })

        const stored = JSON.stringify([
          await tx.select().from(schema.cryptoImportsTable),
          await tx.select().from(schema.cryptoMovementsTable),
        ])
        expect(stored).not.toContain(COINBASE_HOLDER)
        expect(stored).not.toContain(COINBASE_USER_ID)
        expect(stored).not.toContain('synthetic note')
      })
    })

    it('maps a ticker the search does not know with the owner’s choice', async () => {
      await inRollback(async ({ tx, imports, provider, exchange }) => {
        provider.searchAssets.mockResolvedValue([])
        const accountId = await exchange('coinbase')
        const preview = await imports.preview(
          { accountId, ...file(coinbaseCsv(COINBASE_2025)) },
          NOW,
        )
        expect(preview.unmappedTickers).toEqual(['XYZ'])
        expect(
          preview.holdings.find((holding) => holding.symbol === 'XYZ'),
        ).toMatchObject({ status: 'unmapped', quantity: '5' })

        await expect(
          imports.commit(
            preview.id,
            {
              assets: [{ ticker: 'BTC', assetId: 'x', symbol: 'X', name: 'X' }],
            },
            NOW,
          ),
        ).rejects.toThrow(BadRequestException)

        const committed = await imports.commit(
          preview.id,
          {
            assets: [
              {
                ticker: 'XYZ',
                assetId: 'xyz-token',
                symbol: 'xyz',
                name: 'XYZ',
              },
            ],
          },
          NOW,
        )
        expect(committed.unmappedTickers).toEqual([])
        expect((await quantities(tx, accountId))['xyz-token']).toBe('5')
      })
    })

    it('leaves unmapped tickers out of the holdings', async () => {
      await inRollback(async ({ tx, imports, provider, exchange }) => {
        provider.searchAssets.mockResolvedValue([])
        const accountId = await exchange('coinbase')
        const preview = await imports.preview(
          { accountId, ...file(coinbaseCsv(COINBASE_2025)) },
          NOW,
        )
        const committed = await imports.commit(preview.id, {}, NOW)
        expect(committed.unmappedTickers).toEqual(['XYZ'])
        expect(Object.keys(await quantities(tx, accountId)).sort()).toEqual([
          'bitcoin',
          'ethereum',
          'solana',
        ])
      })
    })

    it('refuses other accounts, other exchanges and other files', async () => {
      await inRollback(async ({ imports, accounts, exchange }) => {
        const binance = await exchange('binance')
        await expect(
          imports.preview(
            { accountId: binance, ...file(coinbaseCsv(COINBASE_2025)) },
            NOW,
          ),
        ).rejects.toThrow('This is a Coinbase export; the account is not')
        await expect(
          imports.preview(
            { accountId: binance, ...file('Date;Libellé\n') },
            NOW,
          ),
        ).rejects.toThrow('Not a Binance or Coinbase transactions export')

        const other = await exchange('other')
        await expect(
          imports.preview(
            { accountId: other, ...file(coinbaseCsv(COINBASE_2025)) },
            NOW,
          ),
        ).resolves.toMatchObject({ format: 'coinbase_csv' })

        const manual = await accounts.create({
          name: 'Ledger',
          type: 'crypto',
          cryptoSource: 'manual',
        })
        const checking = await accounts.create({
          name: 'Courant',
          type: 'checking',
        })
        for (const id of [manual.id, checking.id]) {
          await expect(
            imports.preview(
              { accountId: id, ...file(binanceCsv(BINANCE_EARLY)) },
              NOW,
            ),
          ).rejects.toThrow(BadRequestException)
        }
      })
    })

    it('refuses committing twice', async () => {
      await inRollback(async ({ imports, exchange }) => {
        const accountId = await exchange()
        const preview = await imports.preview(
          { accountId, ...file(binanceCsv(BINANCE_EARLY)) },
          NOW,
        )
        await imports.commit(preview.id, {}, NOW)
        await expect(imports.commit(preview.id, {}, NOW)).rejects.toThrow(
          ConflictException,
        )
      })
    })
  },
)
