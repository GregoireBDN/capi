import '#/load-env'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import { DashboardService } from '#/dashboard/dashboard.service'
import * as schema from '#/database/schema'
import type { AccountType } from '#/database/schema/domain-enums'
import { InvestmentsService } from '#/investments/investments.service'
import { BudgetsService } from '#/budgets/budgets.service'
import { TransactionsService } from '#/transactions/transactions.service'
import { CryptoPricesService } from './crypto-prices.service'
import { CryptoService } from './crypto.service'
import { type PriceProvider, PriceProviderError } from './price-provider'
import { WalletSyncService } from './wallet-sync/wallet-sync.service'

/**
 * Integration checks against the dedicated test database (see
 * `vitest.config.ts`). Every test runs in a transaction that is rolled back.
 * Synthetic quantities and prices only; the price provider is a mock.
 */

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')
const TTL = 10 * 60_000
/** 5 November 2026, mid-morning in Paris. */
const NOW = new Date('2026-11-05T10:00:00Z')
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

const BTC = { assetId: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }
const ETH = { assetId: 'ethereum', symbol: 'ETH', name: 'Ethereum' }

describe.skipIf(!process.env.DATABASE_URL)('CryptoService (database)', () => {
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
    crypto: CryptoService
    investments: InvestmentsService
    dashboard: DashboardService
    provider: {
      fetchEurPrices: ReturnType<typeof vi.fn>
      searchAssets: ReturnType<typeof vi.fn>
    }
    account: (type?: AccountType, name?: string) => Promise<string>
  }

  async function inRollback(
    fn: (f: Fixture) => Promise<void>,
    { enabled = true }: { enabled?: boolean } = {},
  ) {
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
          searchAssets: vi.fn(() => Promise.resolve([])),
        }
        const prices = new CryptoPricesService(database, {
          provider: enabled ? (provider as PriceProvider) : null,
          ttlMs: TTL,
        })
        const walletSync = new WalletSyncService(database, {
          bitcoin: null,
          evm: null,
          tokens: null,
          intervalMs: TTL,
        })
        const crypto = new CryptoService(database, accounts, prices, walletSync)
        const investments = new InvestmentsService(database, accounts)
        const dashboard = new DashboardService(
          database,
          accounts,
          new TransactionsService(database),
          new BudgetsService(database),
        )
        const account = async (type: AccountType = 'crypto', name = 'Wallet') =>
          (await accounts.create({ name, type, institution: 'Test' })).id
        await fn({
          tx: tx as unknown as Db,
          crypto,
          investments,
          dashboard,
          provider,
          account,
        })
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  const PRICES: Record<string, string> = {
    bitcoin: '60000.5',
    ethereum: '2500.123456789012345', // rounded to 12 decimals when stored
  }

  it('creates, lists, updates and deletes holdings', async () => {
    await inRollback(async ({ crypto, account }) => {
      const id = await account()
      const ledger = await crypto.create(
        id,
        {
          ...BTC,
          quantity: '0.12345678',
          location: 'Ledger',
          investedCents: 500_000,
        },
        NOW,
      )
      expect(ledger).toMatchObject({
        symbol: 'BTC',
        quantity: '0.12345678',
        location: 'Ledger',
      })
      const exchange = await crypto.create(
        id,
        { ...ETH, quantity: '2', location: 'Exchange A' },
        NOW,
      )

      const listed = await crypto.holdings(id, NOW)
      expect(listed.holdings.map((h) => [h.symbol, h.location])).toEqual([
        ['BTC', 'Ledger'],
        ['ETH', 'Exchange A'],
      ])
      expect(listed.holdings[1].priceEur).toBe('2500.123456789012')

      const updated = await crypto.update(
        id,
        exchange.id,
        { ...ETH, quantity: '1.500000000000000001', investedCents: 300_000 },
        NOW,
      )
      expect(updated).toMatchObject({
        quantity: '1.500000000000000001',
        location: '',
        note: null,
      })
      await crypto.remove(id, ledger.id, NOW)
      expect((await crypto.holdings(id, NOW)).holdings).toHaveLength(1)
    })
  })

  it('says what the server reads by itself', async () => {
    await inRollback(async ({ crypto }) => {
      expect(crypto.settings()).toEqual({
        priceApiEnabled: true,
        walletSyncEnabled: false,
      })
    })
  })

  it('never records a first value of 0 € (#207)', async () => {
    await inRollback(async ({ crypto, investments, account }) => {
      const id = await account()
      const zero = await crypto.create(id, { ...BTC, quantity: '0' }, NOW)
      const empty = await crypto.refresh(id, later(1))
      expect(empty.totals.valueCents).toBe(0)
      expect(empty.snapshot).toBeNull()
      expect(await investments.list(id)).toEqual([])

      // Once the account has had a value, 0 € is a real value (sold out).
      await crypto.update(id, zero.id, { ...BTC, quantity: '0.5' }, later(2))
      await crypto.update(id, zero.id, { ...BTC, quantity: '0' }, later(3))
      expect(await investments.list(id)).toMatchObject([
        { date: '2026-11-05', valueCents: 0 },
      ])
    })
  })

  it('refuses non-crypto and archived accounts', async () => {
    await inRollback(async ({ crypto, account, tx }) => {
      const pea = await account('brokerage')
      await expect(crypto.holdings(pea, NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      const id = await account()
      await tx
        .update(schema.accountsTable)
        .set({ archivedAt: NOW })
        .where(eq(schema.accountsTable.id, id))
      await expect(
        crypto.create(id, { ...BTC, quantity: '1' }, NOW),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  it("valuates and writes today's snapshot with the invested total", async () => {
    await inRollback(async ({ crypto, investments, account, provider }) => {
      const id = await account()
      await crypto.create(
        id,
        {
          ...BTC,
          quantity: '0.5',
          location: 'Ledger',
          investedCents: 2_000_000,
        },
        NOW,
      )
      await crypto.create(
        id,
        {
          ...BTC,
          quantity: '0.25',
          location: 'Exchange',
          investedCents: 1_000_000,
        },
        NOW,
      )
      const result = await crypto.refresh(id, later(1))
      // 0.25 × 60000.5 € = 1 500 012.5 cents → 1 500 012 (half to even);
      // the total is the sum of the rounded holdings.
      expect(result.totals).toMatchObject({
        valueCents: 4_500_037,
        investedCents: 3_000_000,
        gainCents: 1_500_037,
      })
      expect(result.holdings.map((h) => h.valueCents)).toEqual([
        1_500_012, 3_000_025,
      ])
      expect(result.snapshot).toEqual({
        date: '2026-11-05',
        valueCents: 4_500_037,
        contributionsCents: 3_000_000,
      })
      expect(await investments.list(id)).toMatchObject([
        {
          date: '2026-11-05',
          valueCents: 4_500_037,
          contributionsCents: 3_000_000,
        },
      ])
      // Only asset ids reach the provider, batched in one call.
      for (const [ids] of provider.fetchEurPrices.mock.calls) {
        expect(ids).toEqual(['bitcoin'])
      }
    })
  })

  it('makes contributions unknown when a holding has no invested amount', async () => {
    await inRollback(async ({ crypto, investments, account }) => {
      const id = await account()
      // Yesterday: a fully invested holding.
      await investments.upsert(
        id,
        '2026-11-04',
        { valueCents: 80_000, contributionsCents: 40_000 },
        NOW,
      )
      await crypto.create(
        id,
        { ...ETH, quantity: '0.4', investedCents: 40_000 },
        NOW,
      )
      expect((await investments.performance(id, NOW)).returnRate).toBe(
        (100_005 - 40_000) / 40_000,
      )
      // An asset without invested amount is added: pairing the old 400 €
      // with the larger value used to report an inflated return (+185 %).
      await crypto.create(id, { ...BTC, quantity: '0.01' }, NOW)
      const [, today] = await investments.list(id)
      expect(today).toMatchObject({
        date: '2026-11-05',
        valueCents: 100_005 + 60_000,
        contributionsCents: null,
      })
      expect(await investments.performance(id, NOW)).toMatchObject({
        contributionsCents: null,
        gainCents: null,
        returnRate: null,
      })
    })
  })

  it('caches prices for the TTL and revalues automatically after it', async () => {
    await inRollback(async ({ crypto, account, provider }) => {
      const id = await account()
      await crypto.create(id, { ...BTC, quantity: '1' }, NOW)
      expect(provider.fetchEurPrices).toHaveBeenCalledTimes(1)
      // Within the TTL: no provider call, no snapshot write.
      const fresh = await crypto.holdings(id, later(5))
      expect(provider.fetchEurPrices).toHaveBeenCalledTimes(1)
      expect(fresh.snapshot).toBeNull()
      // After the TTL: refreshed and valued again.
      PRICES.bitcoin = '61000'
      try {
        const next = await crypto.holdings(id, later(11))
        expect(provider.fetchEurPrices).toHaveBeenCalledTimes(2)
        expect(next.snapshot?.valueCents).toBe(6_100_000)
      } finally {
        PRICES.bitcoin = '60000.5'
      }
    })
  })

  it('keeps the last known price, flagged stale, when the provider fails', async () => {
    await inRollback(async ({ crypto, investments, account, provider }) => {
      const id = await account()
      await crypto.create(id, { ...BTC, quantity: '2' }, NOW)
      for (const error of [
        new PriceProviderError('timeout'),
        new PriceProviderError('rate_limited', 429),
      ]) {
        provider.fetchEurPrices.mockRejectedValueOnce(error)
      }
      const failed = await crypto.refresh(id, later(30))
      expect(failed.refreshFailed).toBe(true)
      expect(failed.holdings[0]).toMatchObject({
        priceEur: '60000.5',
        priceStale: true,
        valueCents: 12_000_100,
      })
      expect(failed.totals.staleCount).toBe(1)
      // The snapshot still uses the last known price.
      expect(failed.snapshot?.valueCents).toBe(12_000_100)
      // A second forced refresh within 15 s does not hit the provider again.
      const calls = provider.fetchEurPrices.mock.calls.length
      await crypto.refresh(id, new Date(later(30).getTime() + 5_000))
      expect(provider.fetchEurPrices.mock.calls.length).toBe(calls)
      expect((await investments.list(id)).length).toBe(1)
    })
  })

  it('values nothing without a price and uses manual prices when disabled', async () => {
    await inRollback(
      async ({ crypto, investments, account, provider }) => {
        const id = await account()
        await crypto.create(id, { ...ETH, quantity: '3' }, NOW)
        const none = await crypto.holdings(id, NOW)
        expect(none.complete).toBe(false)
        expect(none.priceApiEnabled).toBe(false)
        expect(await investments.list(id)).toEqual([])

        const price = await crypto.setManualPrice('ethereum', '0.012345', NOW)
        expect(price).toMatchObject({ priceEur: '0.012345', source: 'manual' })
        const valued = await crypto.holdings(id, later(60 * 24))
        expect(valued.holdings[0]).toMatchObject({
          priceSource: 'manual',
          priceStale: false,
          valueCents: 4, // 3 × 0.012345 € = 3.7035 cents → 4
        })
        // Manual price day, then the automatic valuation of the next day.
        expect(await investments.list(id)).toMatchObject([
          { date: '2026-11-05', valueCents: 4 },
          { date: '2026-11-06', valueCents: 4 },
        ])
        expect(provider.fetchEurPrices).not.toHaveBeenCalled()
      },
      { enabled: false },
    )
  })

  it('sums every crypto account in the summary', async () => {
    await inRollback(async ({ crypto, account, provider }) => {
      const a = await account('crypto', 'Wallet A')
      const b = await account('crypto', 'Wallet B')
      await crypto.create(
        a,
        { ...BTC, quantity: '0.1', investedCents: 500_000 },
        NOW,
      )
      await crypto.create(
        b,
        { ...ETH, quantity: '1', investedCents: 200_000 },
        NOW,
      )
      provider.fetchEurPrices.mockClear()
      const summary = await crypto.summary(later(20))
      // One batched request for both assets.
      expect(provider.fetchEurPrices).toHaveBeenCalledTimes(1)
      expect(provider.fetchEurPrices.mock.calls[0][0]).toEqual([
        'bitcoin',
        'ethereum',
      ])
      const ours = summary.accounts.filter(
        (x) => x.accountId === a || x.accountId === b,
      )
      expect(ours.map((x) => x.name)).toEqual(['Wallet A', 'Wallet B'])
      expect(ours.map((x) => x.totals.valueCents)).toEqual([600_005, 250_012])
    })
  })

  it('sums each asset over every account in the portfolio (#295)', async () => {
    await inRollback(async ({ crypto, account, provider }) => {
      const a = await account('crypto', 'Plateforme A')
      const b = await account('crypto', 'Ledger B')
      await crypto.create(
        a,
        { ...BTC, quantity: '0.1', investedCents: 400_000 },
        NOW,
      )
      await crypto.create(
        b,
        {
          ...BTC,
          quantity: '0.05',
          location: 'Ledger',
          investedCents: 250_000,
        },
        NOW,
      )
      await crypto.create(b, { ...ETH, quantity: '1' }, NOW)
      // Fiat typed by hand is not crypto.
      await crypto.create(
        a,
        { assetId: 'euro-cash', symbol: 'EUR', name: 'Euro', quantity: '250' },
        NOW,
      )
      // The provider gives each price with its change over 24 hours.
      const quotes = vi.fn((ids: readonly string[]) =>
        Promise.resolve(
          new Map(
            ids
              .filter((id) => id in PRICES)
              .map((id) => [
                id,
                {
                  priceEur: PRICES[id],
                  change24hPercent: id === 'bitcoin' ? '2.5' : '-1.23456',
                },
              ]),
          ),
        ),
      )
      ;(provider as unknown as PriceProvider).fetchEurQuotes = quotes
      try {
        const portfolio = await crypto.refreshPortfolio(later(30))
        // One batched request, with the change.
        expect(quotes).toHaveBeenCalledTimes(1)
        const btc = portfolio.assets.find((x) => x.assetId === 'bitcoin')!
        expect(btc).toMatchObject({
          symbol: 'BTC',
          quantity: '0.15',
          // 600 005 + 300 002,5 rounded half to even: each line is rounded.
          valueCents: 900_007,
          investedCents: 650_000,
          gainCents: 250_007,
          change24hPercent: '2.5',
        })
        expect(btc.places.map((x) => [x.name, x.quantity])).toEqual([
          ['Plateforme A', '0.1'],
          ['Ledger B', '0.05'],
        ])
        const eth = portfolio.assets.find((x) => x.assetId === 'ethereum')!
        // Stored with 4 decimals, rounded half to even.
        expect(eth.change24hPercent).toBe('-1.2346')
        expect(eth.investedCents).toBeNull()
        expect(portfolio.assets.some((x) => x.symbol === 'EUR')).toBe(false)
        const ours = portfolio.accounts.filter(
          (x) => x.accountId === a || x.accountId === b,
        )
        expect(ours.map((x) => [x.name, x.source, x.holdingCount])).toEqual([
          ['Plateforme A', 'manual', 2],
          ['Ledger B', 'manual', 2],
        ])
        // Manual accounts: when a line was last edited.
        expect(ours.every((x) => x.updatedAt !== null)).toBe(true)
        expect(portfolio.valued).toBe(true)
        expect(portfolio.walletSyncEnabled).toBe(false)

        // A price typed by hand has no change.
        await crypto.setManualPrice('bitcoin', '61000', later(31))
        const manual = await crypto.portfolio(later(32))
        expect(
          manual.assets.find((x) => x.assetId === 'bitcoin'),
        ).toMatchObject({ priceSource: 'manual', change24hPercent: null })
      } finally {
        delete (provider as unknown as PriceProvider).fetchEurQuotes
      }
    })
  })

  it('refreshes every crypto account at once and writes their snapshots', async () => {
    await inRollback(async ({ crypto, investments, account, provider }) => {
      const a = await account('crypto', 'Wallet A')
      const b = await account('crypto', 'Wallet B')
      await crypto.create(a, { ...BTC, quantity: '0.1' }, NOW)
      await crypto.create(b, { ...ETH, quantity: '1' }, NOW)
      provider.fetchEurPrices.mockClear()

      // Within the TTL a summary does not refresh, a forced refresh does.
      await crypto.summary(later(1))
      expect(provider.fetchEurPrices).not.toHaveBeenCalled()
      PRICES.bitcoin = '61000'
      try {
        const next = await crypto.refreshAll(later(60 * 24))
        expect(provider.fetchEurPrices).toHaveBeenCalledTimes(1)
        expect(provider.fetchEurPrices.mock.calls[0][0]).toEqual([
          'bitcoin',
          'ethereum',
        ])
        const ours = next.accounts.filter(
          (x) => x.accountId === a || x.accountId === b,
        )
        expect(ours.map((x) => x.snapshot)).toMatchObject([
          { date: '2026-11-06', valueCents: 610_000 },
          { date: '2026-11-06', valueCents: 250_012 },
        ])
        expect(next.refreshFailed).toBe(false)
        expect((await investments.list(a)).map((x) => x.date)).toEqual([
          '2026-11-05',
          '2026-11-06',
        ])
      } finally {
        PRICES.bitcoin = '60000.5'
      }
    })
  })

  it('flags a failed refresh of every account without failing', async () => {
    await inRollback(async ({ crypto, account, provider }) => {
      const id = await account()
      await crypto.create(id, { ...BTC, quantity: '2' }, NOW)
      provider.fetchEurPrices.mockRejectedValueOnce(
        new PriceProviderError('timeout'),
      )
      const failed = await crypto.refreshAll(later(30))
      expect(failed.refreshFailed).toBe(true)
      const ours = failed.accounts.find((x) => x.accountId === id)!
      expect(ours.holdings[0]).toMatchObject({
        priceEur: '60000.5',
        priceStale: true,
      })
      expect(ours.snapshot?.valueCents).toBe(12_000_100)
    })
  })

  it('feeds the dashboard net worth', async () => {
    await inRollback(async ({ crypto, dashboard, account }) => {
      const id = await account()
      const before = await dashboard.overview('2026-11', { now: NOW })
      await crypto.create(id, { ...BTC, quantity: '0.01' }, NOW)
      const after = await dashboard.overview('2026-11', { now: NOW })
      expect(
        after.netWorth.investmentsCents - before.netWorth.investmentsCents,
      ).toBe(60_000) // 0.01 × 60000.5 € = 60 000.5 cents → 60 000 (half to even)
    })
  })

  it('refuses a second holding of the same asset at the same location', async () => {
    await inRollback(async ({ crypto, account }) => {
      const id = await account()
      await crypto.create(
        id,
        { ...BTC, quantity: '1', location: 'Ledger' },
        NOW,
      )
      await expect(
        crypto.create(id, { ...BTC, quantity: '2', location: 'Ledger' }, NOW),
      ).rejects.toBeInstanceOf(ConflictException)
    })
  })

  it('keeps imported and synced holdings read-only, next to manual ones', async () => {
    await inRollback(async ({ crypto, account, tx }) => {
      const id = await account()
      // A line written by a wallet sync (#129) or an exchange import (#128).
      const [synced] = await tx
        .insert(schema.cryptoHoldingsTable)
        .values({
          accountId: id,
          ...BTC,
          symbol: 'BTC',
          quantity: '0.5',
          location: 'Ledger',
          origin: 'sync',
        })
        .returning()
      // The same asset at the same place, typed by hand: kept apart.
      const manual = await crypto.create(
        id,
        { ...BTC, quantity: '0.01', location: 'Ledger' },
        NOW,
      )
      expect(manual.origin).toBe('manual')

      await expect(
        crypto.update(id, synced.id, { ...BTC, quantity: '9' }, NOW),
      ).rejects.toThrow('Imported or synced holdings are read-only')
      await expect(crypto.remove(id, synced.id, NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      await crypto.update(
        id,
        manual.id,
        { ...BTC, quantity: '0.02', location: 'Ledger' },
        NOW,
      )

      const listed = await crypto.holdings(id, NOW)
      expect(
        listed.holdings.map((h) => [h.origin, h.quantity, h.valueCents]),
      ).toEqual([
        ['sync', '0.5', 3_000_025],
        ['manual', '0.02', 120_001],
      ])
      // Valuation unchanged: every line counts.
      expect(listed.totals.valueCents).toBe(3_120_026)
    })
  })
  it('lets tokens change only hand-entered lines of manual accounts (#104)', async () => {
    await inRollback(async ({ crypto, account, tx }) => {
      const manualId = await account()
      await expect(
        crypto.assertTokenMayWrite(manualId),
      ).resolves.toBeUndefined()
      const manual = await crypto.create(
        manualId,
        { ...BTC, quantity: '0.01', location: 'Ledger' },
        NOW,
      )
      await expect(
        crypto.assertTokenMayWrite(manualId, manual.id),
      ).resolves.toBeUndefined()

      const [synced] = await tx
        .insert(schema.cryptoHoldingsTable)
        .values({
          accountId: manualId,
          ...BTC,
          quantity: '0.5',
          origin: 'sync',
        })
        .returning()
      await expect(
        crypto.assertTokenMayWrite(manualId, synced.id),
      ).rejects.toThrow('cannot change imported or synced holdings')

      for (const source of ['exchange', 'wallet'] as const) {
        const id = await account('crypto', `Compte ${source}`)
        await tx
          .update(schema.accountsTable)
          .set({
            cryptoSource: source,
            cryptoProvider: source === 'exchange' ? 'binance' : null,
          })
          .where(eq(schema.accountsTable.id, id))
        await expect(crypto.assertTokenMayWrite(id)).rejects.toBeInstanceOf(
          ForbiddenException,
        )
      }
      const pea = await account('brokerage', 'PEA')
      await expect(crypto.assertTokenMayWrite(pea)).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })
  })
})
