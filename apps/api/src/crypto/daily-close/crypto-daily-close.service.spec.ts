import { DatabaseService } from '#/database/database.service'
import { asSpecOwner } from '#/database/testing/spec-owner'
import '#/load-env'
import { Logger } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import * as schema from '#/database/schema'
import { addDays } from '#/imports/dedupe/calendar-date'
import { CryptoPricesService } from '../crypto-prices.service'
import { CryptoService } from '../crypto.service'
import {
  type PricePoint,
  type PriceProvider,
  PriceProviderError,
} from '../price-provider'
import { WalletSyncService } from '../wallet-sync/wallet-sync.service'
import { CryptoDailyCloseService } from './crypto-daily-close.service'
import { CryptoPriceHistoryService } from './crypto-price-history.service'

/**
 * The daily close against the dedicated test database (see
 * `vitest.config.ts`), each test in a transaction rolled back. Synthetic
 * quantities and prices; the price provider is a mock.
 */

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')
/** 00:10 on 6 November 2026 in Paris: the close of 5 November. */
const CLOSE = new Date('2026-11-05T23:10:00Z')
/** 5 November 2026, mid-morning in Paris. */
const DAYTIME = new Date('2026-11-05T10:00:00Z')

/**
 * The provider's daily history: the point at 00:00 UTC of day X (the close
 * of the Paris day before) is `base + days since 2026-01-01`.
 */
const BASES: Record<string, number> = { bitcoin: 60_000, ethereum: 2_500 }
function priceOn(assetId: string, utcDay: string): string {
  const days = Math.round(
    (Date.parse(`${utcDay}T00:00:00Z`) - Date.parse('2026-01-01T00:00:00Z')) /
      86_400_000,
  )
  return String(BASES[assetId] + days)
}
/** The closing price of a Paris day in the mock history. */
const closeOf = (assetId: string, day: string) =>
  priceOn(assetId, addDays(day, 1))

function history(now: () => Date) {
  return vi.fn((assetId: string, days: number): Promise<PricePoint[]> => {
    if (!(assetId in BASES)) {
      return Promise.reject(new PriceProviderError('http', 404))
    }
    const today = now().toISOString().slice(0, 10)
    const points: PricePoint[] = []
    for (let i = days; i >= 0; i--) {
      const day = addDays(today, -i)
      points.push({
        at: new Date(`${day}T00:00:00Z`),
        priceEur: priceOn(assetId, day),
      })
    }
    // The current price last: here, the close of the Paris day that
    // just ended.
    points.push({
      at: now(),
      priceEur: priceOn(assetId, addDays(today, 1)),
    })
    return Promise.resolve(points)
  })
}

describe.skipIf(!process.env.DATABASE_URL)(
  'CryptoDailyCloseService (database)',
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
      close: CryptoDailyCloseService
      crypto: CryptoService
      accounts: AccountsService
      provider: {
        fetchEurPrices: ReturnType<typeof vi.fn>
        fetchEurHistory: ReturnType<typeof history>
        searchAssets: ReturnType<typeof vi.fn>
      }
      /** A crypto account and its lines, added on `createdAt`. */
      account: (
        source: 'manual' | 'wallet' | 'exchange',
        lines: { assetId: string; quantity: string; origin?: string }[],
        createdAt?: Date,
      ) => Promise<string>
      points: (
        accountId: string,
      ) => Promise<{ date: string; valueCents: number; source: string }[]>
    }

    async function inRollback(
      fn: (f: Fixture) => Promise<void>,
      { enabled = true, now = () => CLOSE } = {},
    ) {
      await db
        .transaction(async (tx) => {
          await asSpecOwner(tx)
          const database = DatabaseService.within(tx)
          const accounts = new AccountsService(database)
          const provider = {
            fetchEurPrices: vi.fn((ids: readonly string[]) =>
              Promise.resolve(
                new Map(ids.map((id) => [id, closeOf(id, '2026-11-05')])),
              ),
            ),
            fetchEurHistory: history(now),
            searchAssets: vi.fn(() => Promise.resolve([])),
          }
          const options = {
            provider: enabled ? (provider as PriceProvider) : null,
            ttlMs: 600_000,
          }
          const prices = new CryptoPricesService(database, options)
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
          const close = new CryptoDailyCloseService(
            database,
            new CryptoPriceHistoryService(database, options),
          )
          const account: Fixture['account'] = async (
            source,
            lines,
            createdAt = new Date('2026-10-01T10:00:00Z'),
          ) => {
            const created = await accounts.create({
              name: `Test ${source}`,
              type: 'crypto',
              cryptoSource: source === 'wallet' ? 'manual' : source,
              ...(source === 'exchange' ? { cryptoProvider: 'binance' } : {}),
            })
            // A wallet without its keys: only its synced lines matter here.
            if (source === 'wallet') {
              await tx
                .update(schema.accountsTable)
                .set({ cryptoSource: 'wallet' })
                .where(eq(schema.accountsTable.id, created.id))
            }
            for (const line of lines) {
              await tx.insert(schema.cryptoHoldingsTable).values({
                accountId: created.id,
                assetId: line.assetId,
                symbol: line.assetId.slice(0, 3).toUpperCase(),
                name: line.assetId,
                quantity: line.quantity,
                origin: (line.origin ?? 'manual') as 'manual',
                location: line.origin ?? 'manual',
                createdAt,
                updatedAt: createdAt,
              })
            }
            return created.id
          }
          const points = (accountId: string) =>
            tx
              .select({
                date: schema.balanceSnapshotsTable.date,
                valueCents: schema.balanceSnapshotsTable.valueCents,
                source: schema.balanceSnapshotsTable.source,
              })
              .from(schema.balanceSnapshotsTable)
              .where(eq(schema.balanceSnapshotsTable.accountId, accountId))
              .orderBy(asc(schema.balanceSnapshotsTable.date))
          await fn({
            tx: tx as unknown as Db,
            close,
            crypto,
            accounts,
            provider,
            account,
            points,
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    it('writes one point for the day at its closing price, whatever the page loads', async () => {
      await inRollback(async ({ close, crypto, account, points, provider }) => {
        const id = await account(
          'wallet',
          [{ assetId: 'bitcoin', quantity: '0.5', origin: 'sync' }],
          new Date('2026-11-05T08:00:00Z'),
        )
        // Ten page loads and an « Actualiser » during the day: nothing stored.
        for (let i = 0; i < 10; i++) {
          await crypto.holdings(id, new Date(DAYTIME.getTime() + i * 60_000))
        }
        await crypto.refresh(id, DAYTIME)
        expect(await points(id)).toEqual([])

        const result = await close.run(CLOSE)
        expect(result).toEqual({ written: 1, retry: false })
        expect(await points(id)).toEqual([
          {
            date: '2026-11-05',
            // 0.5 × the close of 5 November.
            valueCents: Number(closeOf('bitcoin', '2026-11-05')) * 50,
            source: 'computed',
          },
        ])
        // Idempotent: a second run writes nothing more.
        expect(await close.run(CLOSE)).toEqual({ written: 0, retry: false })
        expect(await points(id)).toHaveLength(1)
        // Privacy: the provider only ever gets an asset id and a span.
        for (const call of provider.fetchEurHistory.mock.calls) {
          expect(call).toEqual(['bitcoin', expect.any(Number)])
        }
      })
    })

    it('catches up the days missed while the server was down', async () => {
      await inRollback(async ({ close, account, points }) => {
        const id = await account('manual', [
          { assetId: 'ethereum', quantity: '2' },
        ])
        await close.run(new Date('2026-11-01T23:10:00Z'))
        expect((await points(id)).at(-1)?.date).toBe('2026-11-01')
        // Down from 2 to 4 November: the boot fills them in.
        const result = await close.run(CLOSE)
        expect(result.written).toBe(4)
        const days = (await points(id)).slice(-4)
        expect(days).toEqual(
          ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map(
            (date) => ({
              date,
              valueCents: Number(closeOf('ethereum', date)) * 200,
              source: 'computed',
            }),
          ),
        )
      })
    })

    it('starts a manual account on the day its line was added, never at 0 €', async () => {
      await inRollback(async ({ close, account, points }) => {
        const id = await account(
          'manual',
          [{ assetId: 'bitcoin', quantity: '0.1' }],
          new Date('2026-11-03T15:00:00Z'),
        )
        const empty = await account(
          'manual',
          [{ assetId: 'bitcoin', quantity: '0' }],
          new Date('2026-11-03T15:00:00Z'),
        )
        await close.run(CLOSE)
        expect((await points(id)).map((p) => p.date)).toEqual([
          '2026-11-03',
          '2026-11-04',
          '2026-11-05',
        ])
        expect(await points(empty)).toEqual([])
      })
    })

    it("rebuilds an exchange's daily curve from its movements", async () => {
      await inRollback(async ({ tx, close, account, points }) => {
        const id = await account('exchange', [])
        const [imported] = await tx
          .insert(schema.cryptoImportsTable)
          .values({
            accountId: id,
            format: 'binance_csv',
            fileName: 'export-exemple.csv',
            fileHash: 'e'.repeat(64),
            preview: {} as never,
            committedAt: DAYTIME,
          })
          .returning()
        const move = (
          at: string,
          asset: string,
          quantity: string,
          n: number,
        ) => ({
          accountId: id,
          importId: imported.id,
          occurredAt: new Date(at),
          operation: 'Buy',
          kind: 'buy' as const,
          asset,
          quantity,
          dedupeHash: `daily-close-${n}`,
        })
        // Eight months ago, then one more purchase in September.
        await tx
          .insert(schema.cryptoMovementsTable)
          .values([
            move('2026-03-05T09:00:00Z', 'EUR', '-200', 1),
            move('2026-03-05T09:00:00Z', 'BTC', '0.004', 2),
            move('2026-09-10T09:00:00Z', 'EUR', '-100', 3),
            move('2026-09-10T09:00:00Z', 'BTC', '0.002', 4),
          ])
        // A value stored by a page load before #366 is replaced.
        await tx.insert(schema.balanceSnapshotsTable).values({
          accountId: id,
          date: '2026-06-15',
          valueCents: 1,
          source: 'computed',
        })

        close.requestRebuild(id)
        await close.run(CLOSE)
        const curve = await points(id)
        expect(curve[0].date).toBe('2026-03-05')
        expect(curve.at(-1)?.date).toBe('2026-11-05')
        // One point per day from the first purchase.
        expect(curve).toHaveLength(246)
        const on = (date: string) => curve.find((p) => p.date === date)
        // 0.004 BTC, then 0.006 BTC (never a half cent here).
        expect(on('2026-06-15')?.valueCents).toBe(
          Math.round(Number(closeOf('bitcoin', '2026-06-15')) * 0.4),
        )
        expect(on('2026-09-10')?.valueCents).toBe(
          Math.round(Number(closeOf('bitcoin', '2026-09-10')) * 0.6),
        )
        // The prices are kept for the next closes.
        const kept = await tx
          .select()
          .from(schema.cryptoPriceHistoryTable)
          .where(eq(schema.cryptoPriceHistoryTable.assetId, 'bitcoin'))
        expect(kept.length).toBeGreaterThanOrEqual(246)
      })
    })

    it("follows a wallet's reads day by day and counts the euros waiting on an exchange (#373)", async () => {
      await inRollback(async ({ tx, close, account, points }) => {
        const wallet = await account(
          'wallet',
          [{ assetId: 'bitcoin', quantity: '0.5', origin: 'sync' }],
          new Date('2026-11-01T08:00:00Z'),
        )
        const observe = (
          at: string,
          since: string | null,
          quantity: string,
        ) => ({
          accountId: wallet,
          occurredAt: new Date(at),
          observedSince: since === null ? null : new Date(since),
          operation: 'wallet_sync',
          kind: 'observed_in' as const,
          asset: 'BTC',
          assetId: 'bitcoin',
          quantity,
          dedupeHash: `observed:${at}`,
        })
        await tx
          .insert(schema.cryptoMovementsTable)
          .values([
            observe('2026-11-02T08:00:00Z', null, '0.2'),
            observe('2026-11-04T08:00:00Z', '2026-11-02T08:00:00Z', '0.3'),
          ])
        const exchange = await account('exchange', [])
        const [imported] = await tx
          .insert(schema.cryptoImportsTable)
          .values({
            accountId: exchange,
            format: 'binance_csv',
            fileName: 'export-exemple.csv',
            fileHash: 'f'.repeat(64),
            committedAt: DAYTIME,
          })
          .returning()
        await tx.insert(schema.cryptoMovementsTable).values({
          accountId: exchange,
          importId: imported.id,
          occurredAt: new Date('2026-11-03T09:00:00Z'),
          operation: 'Deposit',
          kind: 'deposit',
          asset: 'EUR',
          quantity: '1000',
          dedupeHash: 'daily-close-eur',
        })
        close.requestRebuild(exchange)
        await close.run(CLOSE)
        const value = (day: string, quantity: number) =>
          Math.round(Number(closeOf('bitcoin', day)) * 100 * quantity)
        expect(await points(wallet)).toEqual(
          (
            [
              ['2026-11-02', 0.2],
              ['2026-11-03', 0.2],
              ['2026-11-04', 0.5],
              ['2026-11-05', 0.5],
            ] as const
          ).map(([date, quantity]) => ({
            date,
            valueCents: value(date, quantity),
            source: 'computed',
          })),
        )
        expect(await points(exchange)).toEqual(
          ['2026-11-03', '2026-11-04', '2026-11-05'].map((date) => ({
            date,
            valueCents: 100_000,
            source: 'computed',
          })),
        )
        // The invested amount is computed on read (#370): never stored.
        const stored = await tx
          .select({ c: schema.balanceSnapshotsTable.contributionsCents })
          .from(schema.balanceSnapshotsTable)
        expect(stored.every((row) => row.c === null)).toBe(true)
      })
    })

    it('leaves a day without a price when the API fails, and fills it later', async () => {
      await inRollback(async ({ close, account, points, provider }) => {
        const warn = vi
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined)
        try {
          const id = await account('manual', [
            { assetId: 'bitcoin', quantity: '1' },
          ])
          await close.run(new Date('2026-11-04T23:10:00Z'))
          provider.fetchEurHistory.mockRejectedValueOnce(
            new PriceProviderError('rate_limited', 429),
          )
          // No error: the day is retried.
          expect(await close.run(CLOSE)).toEqual({ written: 0, retry: true })
          expect((await points(id)).at(-1)?.date).toBe('2026-11-04')
          // The log names the reason only.
          for (const [message] of warn.mock.calls) {
            expect(String(message)).not.toMatch(/\d{3,}/)
          }
          expect(await close.run(CLOSE)).toEqual({ written: 1, retry: false })
          expect((await points(id)).at(-1)).toEqual({
            date: '2026-11-05',
            valueCents: Number(closeOf('bitcoin', '2026-11-05')) * 100,
            source: 'computed',
          })
        } finally {
          warn.mockRestore()
        }
      })
    })

    it('uses the manual price of the day when the price API is off', async () => {
      await inRollback(
        async ({ close, crypto, account, points, provider }) => {
          const id = await account('manual', [
            { assetId: 'ethereum', quantity: '3' },
          ])
          await crypto.setManualPrice(
            'ethereum',
            '2000.5',
            new Date('2026-11-04T09:00:00Z'),
          )
          await close.run(CLOSE)
          // From the day the price was set; never asked to the API.
          expect(await points(id)).toEqual([
            { date: '2026-11-04', valueCents: 600_150, source: 'computed' },
            { date: '2026-11-05', valueCents: 600_150, source: 'computed' },
          ])
          expect(provider.fetchEurHistory).not.toHaveBeenCalled()
        },
        { enabled: false },
      )
    })
  },
)
