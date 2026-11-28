import { DatabaseService } from '#/database/database.service'
import { asSpecOwner } from '#/database/testing/spec-owner'
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
        await asSpecOwner(tx)
        const database = DatabaseService.within(tx)
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
        const investments = new InvestmentsService(database, accounts, crypto)
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
      await crypto.remove(id, ledger.id)
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

  it('never shows a first value of 0 € (#207)', async () => {
    await inRollback(async ({ tx, crypto, investments, account }) => {
      const id = await account()
      await crypto.create(id, { ...BTC, quantity: '0' }, NOW)
      const empty = await crypto.refresh(id, later(1))
      expect(empty.totals.valueCents).toBe(0)
      expect(empty.snapshot).toBeNull()
      expect(await investments.list(id)).toEqual([])

      // Once the account has had a value, 0 € is a real value (sold out).
      await tx.insert(schema.balanceSnapshotsTable).values({
        accountId: id,
        date: '2026-11-04',
        valueCents: 300_00,
        source: 'computed',
      })
      expect((await crypto.holdings(id, later(2))).snapshot).toEqual({
        date: '2026-11-05',
        valueCents: 0,
        contributionsCents: null,
      })
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

  it("values today's live value with the invested total and stores nothing (#366)", async () => {
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
      // Shown, never stored: the daily close writes the day's value.
      expect(await investments.list(id)).toEqual([])
      const performance = await investments.performance(id, later(1))
      expect(performance.live).toEqual(result.snapshot)
      expect(performance).toMatchObject({
        valueCents: 4_500_037,
        valueDate: '2026-11-05',
        snapshots: [],
      })
      // Only asset ids reach the provider, batched in one call.
      for (const [ids] of provider.fetchEurPrices.mock.calls) {
        expect(ids).toEqual(['bitcoin'])
      }
    })
  })

  it('leaves coins of unknown cost out of the gain, the others still counted (#373)', async () => {
    await inRollback(async ({ tx, crypto, investments, account }) => {
      const id = await account()
      // Yesterday's close: its value only (#370).
      await tx.insert(schema.balanceSnapshotsTable).values({
        accountId: id,
        date: '2026-11-04',
        valueCents: 80_000,
        source: 'computed',
      })
      // Typed with what it cost: its arrival is answered at once.
      await crypto.create(
        id,
        { ...ETH, quantity: '0.4', investedCents: 40_000 },
        NOW,
      )
      expect((await investments.performance(id, NOW)).returnRate).toBe(
        (100_005 - 40_000) / 40_000,
      )
      // An asset without invested amount is added: named, out of the gain,
      // never pairing the 400 € with the larger value (+185 %).
      await crypto.create(id, { ...BTC, quantity: '0.01' }, NOW)
      const performance = await investments.performance(id, NOW)
      expect(performance.live).toMatchObject({
        date: '2026-11-05',
        valueCents: 100_005 + 60_000,
        contributionsCents: 40_000,
      })
      expect(performance).toMatchObject({
        contributionsCents: 40_000,
        contributionsSource: 'coins',
        gainCents: 60_005,
        returnRate: 60_005 / 40_000,
        unknownCostCount: 1,
        unknownCost: [{ assetId: 'bitcoin', symbol: 'BTC', quantity: '0.01' }],
      })
    })
  })

  it('reads stored prices only, the auto refresh asking for the due ones (#381)', async () => {
    await inRollback(async ({ crypto, account, provider }) => {
      const id = await account()
      await crypto.create(id, { ...BTC, quantity: '1' }, NOW)
      expect(provider.fetchEurPrices).toHaveBeenCalledTimes(1)
      // Within the TTL: the stored price, nothing due.
      const fresh = await crypto.holdings(id, later(5))
      expect(fresh.snapshot?.valueCents).toBe(6_000_050)
      expect(fresh.refreshDue).toBe(false)
      expect(fresh.holdings[0].priceStale).toBe(false)
      PRICES.bitcoin = '61000'
      try {
        // After the TTL, a read still asks nothing: stale, refresh due.
        const stale = await crypto.holdings(id, later(11))
        expect(provider.fetchEurPrices).toHaveBeenCalledTimes(1)
        expect(stale.snapshot?.valueCents).toBe(6_000_050)
        expect(stale.holdings[0].priceStale).toBe(true)
        expect(stale.refreshDue).toBe(true)
        // The live step the page fires: refreshed, nothing due any more.
        const live = await crypto.refresh(id, later(11), 'auto')
        expect(provider.fetchEurPrices).toHaveBeenCalledTimes(2)
        expect(live.snapshot?.valueCents).toBe(6_100_000)
        expect(live.refreshDue).toBe(false)
        // A second auto refresh within the TTL asks nothing.
        await crypto.refresh(id, later(12), 'auto')
        await crypto.refreshPortfolio(later(12), 'auto')
        expect(provider.fetchEurPrices).toHaveBeenCalledTimes(2)
      } finally {
        PRICES.bitcoin = '60000.5'
      }
    })
  })

  it('answers the portfolio and holdings without any outgoing request (#381)', async () => {
    await inRollback(async ({ tx, crypto, account }) => {
      const manual = await account('crypto', 'Manuel')
      await crypto.create(manual, { ...BTC, quantity: '0.5' }, NOW)
      await crypto.create(manual, { ...ETH, quantity: '2' }, NOW)
      const [wallet] = await tx
        .insert(schema.accountsTable)
        .values({ name: 'Ledger', type: 'crypto', cryptoSource: 'wallet' })
        .returning()
      await tx.insert(schema.cryptoHoldingsTable).values({
        accountId: wallet.id,
        ...ETH,
        quantity: '1',
        location: 'Ethereum',
        origin: 'sync',
      })

      // A price provider and chain clients that fail if called at all.
      const offline = () =>
        vi.fn(() => {
          throw new Error('no network on a read')
        })
      const priceProvider = {
        fetchEurPrices: offline(),
        fetchEurQuotes: offline(),
        fetchEurHistory: offline(),
        searchAssets: offline(),
      }
      const chain = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
        get: (target, key: string) => (target[key] ??= offline()),
      })
      const fetchSpy = offline()
      vi.stubGlobal('fetch', fetchSpy)
      try {
        const database = DatabaseService.within(tx as never)
        const accounts = new AccountsService(database)
        const prices = new CryptoPricesService(database, {
          provider: priceProvider as unknown as PriceProvider,
          ttlMs: TTL,
        })
        const walletSync = new WalletSyncService(database, {
          bitcoin: chain as never,
          evm: chain as never,
          tokens: chain as never,
          intervalMs: TTL,
        })
        const reader = new CryptoService(database, accounts, prices, walletSync)

        const portfolio = await reader.portfolio(later(30))
        const holdings = await reader.holdings(wallet.id, later(30))
        const summary = await reader.summary(later(30))

        for (const fn of Object.values(priceProvider)) {
          expect(fn).not.toHaveBeenCalled()
        }
        for (const fn of Object.values(chain)) {
          expect(fn).not.toHaveBeenCalled()
        }
        expect(fetchSpy).not.toHaveBeenCalled()

        // The stored values, with the stale prices said.
        const btc = portfolio.assets.find((a) => a.assetId === 'bitcoin')
        const eth = portfolio.assets.find((a) => a.assetId === 'ethereum')
        expect(btc).toMatchObject({ valueCents: 3_000_025, priceStale: true })
        expect(eth).toMatchObject({ quantity: '3', priceStale: true })
        expect(portfolio.refreshFailed).toBe(false)
        expect(portfolio.refreshDue).toBe(true)
        expect(holdings.holdings[0]).toMatchObject({
          priceEur: '2500.123456789012',
          priceStale: true,
        })
        expect(holdings.sync).toMatchObject({ syncing: false, syncedAt: null })
        // Prices over the TTL and a wallet never read: the live step is due.
        expect(holdings.refreshDue).toBe(true)
        expect(summary.totals.staleCount).toBeGreaterThan(0)
      } finally {
        vi.unstubAllGlobals()
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
      // The live value still uses the last known price.
      expect(failed.snapshot?.valueCents).toBe(12_000_100)
      // A second forced refresh within 15 s does not hit the provider again.
      const calls = provider.fetchEurPrices.mock.calls.length
      await crypto.refresh(id, new Date(later(30).getTime() + 5_000))
      expect(provider.fetchEurPrices.mock.calls.length).toBe(calls)
      expect(await investments.list(id)).toEqual([])
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
        expect(valued.snapshot).toMatchObject({
          date: '2026-11-06',
          valueCents: 4,
        })
        expect(await investments.list(id)).toEqual([])
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
      // A read asks nothing (#381); « Actualiser » one batched request.
      await crypto.summary(later(20))
      expect(provider.fetchEurPrices).not.toHaveBeenCalled()
      const summary = await crypto.refreshAll(later(20))
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

  it('refreshes every crypto account at once, storing nothing', async () => {
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
        expect(await investments.list(a)).toEqual([])
      } finally {
        PRICES.bitcoin = '60000.5'
      }
    })
  })

  it('keeps a typed cost through any number of valuations (#370)', async () => {
    await inRollback(async ({ crypto, investments, account }) => {
      const id = await account('crypto', 'Ledger')
      // 0.05 BTC at 60 000,50 €: 3 000,02 € (half to even), bought for 1 000 €.
      await crypto.create(
        id,
        { ...BTC, quantity: '0.05', investedCents: 1_000_00 },
        NOW,
      )
      for (const minutes of [60 * 24, 60 * 48]) {
        const next = await crypto.refreshAll(later(minutes))
        const row = next.accounts.find((x) => x.accountId === id)
        expect(row?.totals).toMatchObject({
          investedCents: 1_000_00,
          gainCents: 2_000_02,
          withoutInvestedCount: 0,
        })
      }
      expect(await investments.performance(id, later(60 * 48))).toMatchObject({
        contributionsCents: 1_000_00,
        contributionsSource: 'coins',
        gainCents: 2_000_02,
      })
      const portfolio = await crypto.portfolio(later(60 * 48))
      expect(portfolio.totals).toMatchObject({
        investedCents: 1_000_00,
        gainCents: 2_000_02,
        withoutInvestedSymbols: [],
      })
      expect(portfolio.assets[0]).toMatchObject({
        investedCents: 1_000_00,
        unknownQuantity: '0',
      })
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

  it('leaves the net worth to the daily close: page loads write nothing (#366)', async () => {
    await inRollback(async ({ crypto, dashboard, investments, account }) => {
      const id = await account()
      const before = await dashboard.overview('2026-11', { now: NOW })
      await crypto.create(id, { ...BTC, quantity: '0.01' }, NOW)
      for (let i = 0; i < 10; i++) await crypto.holdings(id, later(i * 15))
      await crypto.refresh(id, later(200))
      const after = await dashboard.overview('2026-11', { now: later(201) })
      expect(after.netWorth.investmentsCents).toBe(
        before.netWorth.investmentsCents,
      )
      expect(await investments.list(id)).toEqual([])
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
      await expect(crypto.remove(id, synced.id)).rejects.toBeInstanceOf(
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
